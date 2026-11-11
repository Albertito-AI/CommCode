// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from './process.mjs';
import { Ledger } from './ledger.mjs';
import { WorkspaceBudget } from './workspace-budget.mjs';
import {
  Fault,
  id,
  files,
  textFile,
  safePath,
  atomicJSON,
  hash,
  containsSecret,
  githubURL,
  boundedString,
} from './security.mjs';

const templateRoot = fileURLToPath(new URL('../templates/', import.meta.url));
export class Workspaces {
  constructor(root, secrets = [], { budget = new WorkspaceBudget() } = {}) {
    this.root = root;
    this.secrets = secrets;
    this.budget = budget;
    this.locks = new Set();
  }
  async init() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
  }
  async list() {
    const result = [];
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[0-9a-f-]{36}$/.test(entry.name))
        result.push(await this.get(entry.name));
    }
    return result;
  }
  async get(key) {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new Fault('Unknown workspace.', 404);
    try {
      const ws = JSON.parse(await fs.readFile(path.join(this.root, key, 'workspace.json'), 'utf8'));
      ws.root = path.join(this.root, key, 'repo');
      return ws;
    } catch (e) {
      if (e.code === 'ENOENT') throw new Fault('Unknown workspace.', 404);
      throw e;
    }
  }
  ledger(ws) {
    return new Ledger(path.dirname(ws.root), this.secrets);
  }
  async exclusive(ws, fn) {
    if (this.locks.has(ws.id))
      throw new Fault('This workspace is busy. Wait for its current operation or cancel it.', 409);
    this.locks.add(ws.id);
    try {
      return await fn();
    } finally {
      this.locks.delete(ws.id);
    }
  }
  async create({ name, url, template = 'expense-tracker' }) {
    boundedString(name, 'Workspace name', 80);
    if (url) githubURL(url);
    if (!url && !['expense-tracker', 'python-api'].includes(template))
      throw new Fault('Unknown starter template.');
    const key = id(),
      base = path.join(this.root, key),
      root = path.join(base, 'repo');
    await fs.mkdir(base, { recursive: true, mode: 0o700 });
    try {
      if (url) {
        const imported = await this.budget.execute({ root }, async (signal) => {
          await git(base, ['clone', '--no-recurse-submodules', '--', url, 'repo'], {
            timeout: 120000,
            signal,
          });
          return { code: 0, output: '' };
        });
        if (imported.budgetExceeded) throw new Fault(imported.output, 409);
      } else {
        await fs.cp(path.join(templateRoot, template), root, { recursive: true });
        await git(root, ['init', '-b', 'main']);
        await git(root, ['add', '--', '.']);
        await git(root, ['commit', '-m', 'Initial portable starter']);
      }
      const ws = {
        id: key,
        name,
        template: url ? null : template,
        remote: url || null,
        createdAt: new Date().toISOString(),
        test: template === 'python-api' && !url ? 'python3 -m unittest discover -v' : 'node --test',
        start: template === 'python-api' && !url ? 'python3 app.py' : 'node server.mjs',
        install: '',
      };
      if (url) {
        ws.test = '';
        ws.start = '';
      }
      await this.budget.admit({ root });
      await atomicJSON(path.join(base, 'workspace.json'), ws);
      ws.root = root;
      await this.ledger(ws).append('workspace.created', {
        name,
        source: url || template,
        head: (await git(root, ['rev-parse', 'HEAD'])).trim(),
      });
      return ws;
    } catch (e) {
      await fs.rm(base, { recursive: true, force: true });
      throw e;
    }
  }
  async configure(ws, config) {
    await this.budget.admit(ws, 8192);
    for (const key of ['test', 'start', 'install'])
      if (key in config) {
        if (
          typeof config[key] !== 'string' ||
          config[key].length > 2000 ||
          config[key].includes('\0')
        )
          throw new Fault('Commands must be text of at most 2000 characters.');
        ws[key] = config[key];
      }
    const { root, ...data } = ws;
    await atomicJSON(path.join(path.dirname(root), 'workspace.json'), data);
    await this.ledger(ws).append('workspace.configured', {
      test: ws.test,
      start: ws.start,
      install: ws.install,
    });
    return ws;
  }
  async inspect(ws) {
    const list = await files(ws.root),
      context = [];
    let used = 0;
    for (const name of list) {
      if (context.length >= 30) break;
      try {
        const content = await textFile(ws.root, name);
        if (content.length > 16000 || used + content.length > 48000 || containsSecret(content))
          continue;
        context.push({ path: name, content });
        used += content.length;
      } catch {}
    }
    return {
      files: list,
      context,
      head: (await git(ws.root, ['rev-parse', 'HEAD'])).trim(),
      status: await git(ws.root, ['status', '--porcelain']),
      diff: await git(ws.root, ['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--', '.']),
    };
  }
  async fingerprint(ws) {
    const entries = [];
    for (const name of await files(ws.root)) {
      const p = await safePath(ws.root, name),
        st = await fs.stat(p);
      if (st.size > 2 * 1024 * 1024)
        throw new Fault('AI editing currently supports files up to 2 MiB.');
      entries.push([name, hash(await fs.readFile(p))]);
    }
    return hash(
      JSON.stringify([
        await git(ws.root, ['rev-parse', 'HEAD']),
        await git(ws.root, ['status', '--porcelain']),
        entries,
      ]),
    );
  }
  async read(ws, name) {
    const content = await textFile(ws.root, name);
    return { path: name, content, etag: hash(content) };
  }
  async write(ws, { path: name, content, etag }) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 256 * 1024)
      throw new Fault('File content exceeds 256 KiB.');
    const p = await safePath(ws.root, name);
    const current = await fs.readFile(p, 'utf8').catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if ((current === null ? null : hash(current)) !== etag)
      throw new Fault('The file changed since it was opened. Reload it before saving.', 409);
    await this.budget.admit(
      ws,
      Math.max(0, Buffer.byteLength(content) - Buffer.byteLength(current || '')) + 8192,
    );
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
    await this.ledger(ws).append('file.saved', {
      path: name,
      before: current === null ? null : hash(current),
      after: hash(content),
    });
    return { etag: hash(content) };
  }
  async commit(ws, message) {
    await this.budget.admit(ws, 1024 * 1024);
    boundedString(message, 'Commit message', 200);
    // Scan the bytes that will be staged, honour ignore rules, and include deletions.
    const names = (
      await git(ws.root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    )
      .split('\0')
      .filter(Boolean);
    if (names.length > 500) throw new Fault('Commit inspection is limited to 500 files.');
    for (const name of names) {
      const exists = await fs.lstat(path.join(ws.root, name)).catch((e) => {
        if (e.code === 'ENOENT') return null;
        throw e;
      });
      if (!exists) continue;
      const target = await safePath(ws.root, name);
      if (!exists.isFile() || exists.size > 2 * 1024 * 1024)
        throw new Fault('Commit inspection requires regular files up to 2 MiB: ' + name);
      if (containsSecret((await fs.readFile(target)).toString('utf8')))
        throw new Fault('Possible secret detected in ' + name + '. Remove it before committing.');
    }
    await git(ws.root, ['add', '-A', '--', '.']);
    await git(ws.root, ['commit', '-m', message]);
    await this.budget.admit(ws);
    const sha = (await git(ws.root, ['rev-parse', 'HEAD'])).trim();
    await this.ledger(ws).append('git.committed', { sha, message });
    return { sha };
  }
}
