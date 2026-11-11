import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.mjs';
import { token } from '../src/security.mjs';
import { WorkspaceBudget } from '../src/workspace-budget.mjs';
test('authenticated end-to-end workspace, console, preview, commit and export', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-api-')),
    key = token();
  const app = await createApp({ root, token: key, mode: 'process', port: 0, previewPort: 0 });
  t.after(async () => {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const call = async (route, data, extra = {}) => {
    const r = await fetch(app.url + '/api/' + route, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  assert.equal((await fetch(app.url + '/api/workspaces')).status, 401);
  assert.equal(
    (await call('workspaces', undefined, { Origin: 'https://evil.example' })).status,
    403,
  );
  const forgedHost = await new Promise((resolve, reject) => {
    const request = http.get(
      app.url + '/api/workspaces',
      { headers: { Host: 'evil.example', Authorization: 'Bearer ' + key } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on('error', reject);
  });
  assert.equal(forgedHost, 403);
  const created = await call('workspaces', { name: 'Real demo' });
  assert.equal(created.status, 201);
  const base = 'workspaces/' + created.data.id + '/';
  assert.equal((await fetch(app.url + '/api/' + base + 'resources')).status, 401);
  assert.equal((await call(base + 'cleanup-container', { container: 'a'.repeat(64) })).status, 400);
  assert.equal((await call(base + 'resources')).data.available, false);
  const wait = async (key) => {
    for (let n = 0; n < 200; n++) {
      const r = (await call('jobs/' + key)).data;
      if (r.state === 'failed') throw Error(r.error);
      if (r.state === 'done') return r.result;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error('job timed out');
  };
  const tested = await wait((await call(base + 'test', {})).data.id);
  assert.equal(tested.code, 0, tested.output);
  const started = await wait((await call(base + 'start', {})).data.id);
  assert.equal(started.verified, true);
  assert.notEqual(new URL(started.url).origin, new URL(app.url).origin);
  const html = await fetch(started.url);
  assert.match(await html.text(), /Community expenses/);
  assert.match(html.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(started.url, { method: 'POST' })).status, 405);
  assert.equal((await fetch(app.previewUrl + '/unregistered/')).status, 404);
  assert.equal(
    (await call(base + 'file', { path: 'blocked.js', content: 'x', etag: null })).status,
    409,
  );
  await call(base + 'stop', {});
  assert.equal((await fetch(started.url)).status, 404);
  await call(base + 'file', { path: 'user.txt', content: 'A real edit', etag: null });
  const committed = await call(base + 'commit', { message: 'Add a verified edit' });
  assert.equal(committed.data.sha.length, 40);
  const storedWorkspace = await app.workspaces.get(created.data.id);
  const used = (await app.workspaces.budget.usage(storedWorkspace)).bytes;
  app.workspaces.budget = new WorkspaceBudget({
    bytes: used + 4096,
    recoveryReserve: 4096,
    entries: 100000,
  });
  assert.equal(
    (await call(base + 'file', { path: 'over-budget.txt', content: 'blocked', etag: null })).status,
    409,
  );
  const bundle = await fetch(app.url + '/api/' + base + 'export', {
    headers: { Authorization: 'Bearer ' + key },
  });
  assert.equal(bundle.status, 200);
  assert.ok((await bundle.arrayBuffer()).byteLength > 100);
  await assert.rejects(fs.stat(path.join(path.dirname(storedWorkspace.root), 'export.bundle')), {
    code: 'ENOENT',
  });
  const ledger = await call(base + 'ledger');
  assert.equal(ledger.data.valid, true);
  assert.ok(ledger.data.events.some((e) => e.type === 'git.committed'));
});
