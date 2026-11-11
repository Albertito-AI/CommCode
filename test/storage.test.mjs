import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { TaskStore } from '../src/task-store.mjs';
import { Agent } from '../src/agent.mjs';
import { acquireServerLease } from '../src/server-lease.mjs';
import { atomicJSON, hash, id, token } from '../src/security.mjs';
import { git } from '../src/process.mjs';
import { createApp } from '../src/server.mjs';
import { fixture } from './helpers.mjs';

test('a failed atomic record replacement removes only its own temporary file', async (t) => {
  const { root } = await fixture(t);
  const target = path.join(root, 'existing-directory');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'keep.txt'), 'Retain this');
  await assert.rejects(atomicJSON(target, { value: 'cannot replace a directory' }));
  assert.equal(await fs.readFile(path.join(target, 'keep.txt'), 'utf8'), 'Retain this');
  assert.ok(!(await fs.readdir(root)).some((name) => name.endsWith('.tmp')));
});

test('full task history rejects a new provider call but preserves updates and prior records', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const store = new TaskStore({ records: 2, recordBytes: 4096, totalBytes: 8192 });
  const first = { id: id(), state: 'proposed', objective: 'Retain this' };
  const second = { id: id(), state: 'needs_review' };
  await store.save(ws, first);
  await store.save(ws, second);
  let calls = 0;
  const agent = new Agent(
    workspaces,
    runner,
    {
      info: () => ({}),
      propose: () => {
        calls++;
      },
    },
    { taskStore: store },
  );
  await assert.rejects(agent.propose(ws, 'Another task', { shareSource: true }), /history is full/);
  assert.equal(calls, 0);
  await store.save(ws, { ...first, state: 'rolled_back' });
  assert.equal((await store.read(ws, first.id)).state, 'rolled_back');
  assert.equal((await store.read(ws, second.id)).state, 'needs_review');
  await assert.rejects(store.save(ws, { ...first, data: 'x'.repeat(4096) }), /storage limit/);
  assert.equal((await store.read(ws, first.id)).objective, 'Retain this');
});

test('history reserves recovery space before editing and rejects linked task records', async (t) => {
  const { ws } = await fixture(t);
  const store = new TaskStore({ records: 5, recordBytes: 1024, totalBytes: 2048 });
  const first = { id: id(), value: 'x'.repeat(600) };
  const second = { id: id(), value: 'y'.repeat(600) };
  await store.save(ws, first);
  await store.save(ws, second);
  await assert.rejects(store.admit(ws), /insufficient recovery space/);
  await store.admit(ws, first.id);
  const linkId = id();
  await fs.symlink(store.file(ws, first.id), store.file(ws, linkId));
  await assert.rejects(store.read(ws, linkId), /linked/);
  await assert.rejects(store.admit(ws), /linked/);
  assert.equal((await store.read(ws, first.id)).value, first.value);
});

test('valid recovery records larger than the old 256 KiB scan limit remain inspectable', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const before = await fs.readFile(path.join(ws.root, 'README.md'), 'utf8');
  const after = before + '\nAn interrupted edit';
  const agent = new Agent(workspaces, runner, {});
  const task = {
    id: id(),
    state: 'applying',
    head: (await workspaces.inspect(ws)).head,
    applied: { 'README.md': hash(after) },
    originals: { 'README.md': before },
    diagnostic: 'x'.repeat(300 * 1024),
  };
  await agent.save(ws, task);
  await fs.writeFile(path.join(ws.root, 'README.md'), after);
  const recovery = await agent.recovery(ws);
  assert.equal(recovery.tasks[0].finding, 'guarded_rollback_candidate');
  await agent.rollback(ws, await agent.read(ws, task.id));
  assert.equal(await fs.readFile(path.join(ws.root, 'README.md'), 'utf8'), before);
});

test('an oversized original-file set is rejected before any proposed source write', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const original = 'x'.repeat(190 * 1024);
  const names = ['one.txt', 'two.txt', 'three.txt'];
  for (const name of names) await fs.writeFile(path.join(ws.root, name), original);
  await git(ws.root, ['add', '.']);
  await git(ws.root, ['commit', '-m', 'Large original fixture']);
  const agent = new Agent(workspaces, runner, {
    info: () => ({ kind: 'deterministic fixture' }),
    propose: async () => ({
      plan: ['Bounded fixture'],
      explanation: 'Storage regression, not a live model.',
      files: names.map((name) => ({ path: name, content: 'proposed' })),
    }),
  });
  const task = await agent.propose(ws, 'Change the fixture', { shareSource: true });
  await assert.rejects(agent.apply(ws, task.id), /512 KiB/);
  for (const name of names)
    assert.equal(await fs.readFile(path.join(ws.root, name), 'utf8'), original);
  assert.equal((await agent.read(ws, task.id)).state, 'rolled_back');
});

test('one data directory refuses a second server and is reusable after clean shutdown', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-lease-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = await createApp({ root, token: token(), mode: 'process', port: 0, previewPort: 0 });
  try {
    await assert.rejects(
      createApp({ root, token: token(), mode: 'process', port: 0, previewPort: 0 }),
      /existing server lock/,
    );
  } finally {
    await first.close();
  }
  const next = await createApp({ root, token: token(), mode: 'process', port: 0, previewPort: 0 });
  await next.close();
  await assert.rejects(fs.stat(path.join(root, '.server.lock')), { code: 'ENOENT' });
});

test('a killed server lease remains visible and cannot be silently reclaimed', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-crash-lease-'));
  const module = new URL('../src/server-lease.mjs', import.meta.url).href;
  const code = `import { acquireServerLease } from ${JSON.stringify(module)}; await acquireServerLease(process.argv[1]); console.log('ready'); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, root], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    child.kill('SIGKILL');
    await fs.rm(root, { recursive: true, force: true });
  });
  const ready = await Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(() => {
      throw new Error('Lease subprocess exited before acquiring the lock');
    }),
  ]);
  assert.match(String(ready[0]), /ready/);
  await assert.rejects(acquireServerLease(root), /existing server lock/);
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  await assert.rejects(acquireServerLease(root), /existing server lock/);
  const record = JSON.parse(await fs.readFile(path.join(root, '.server.lock'), 'utf8'));
  assert.equal(record.pid, child.pid);
});

test('preview activity delays idle suspension; an idle application is stopped without deleting sources', async (t) => {
  const { ws, runner } = await fixture(t);
  runner.idleTimeoutMs = 1000;
  const before = await fs.readFile(path.join(ws.root, 'README.md'), 'utf8');
  const result = await runner.start(ws);
  assert.equal(result.verified, true);
  runner.apps.get(ws.id).lastUsedAt = 0;
  runner.touch(ws.id);
  const touched = runner.apps.get(ws.id).lastUsedAt;
  assert.deepEqual(await runner.suspendIdle(touched + 999), []);
  assert.deepEqual(await runner.suspendIdle(touched + 1000), [ws.id]);
  assert.equal(runner.apps.has(ws.id), false);
  assert.equal(await fs.readFile(path.join(ws.root, 'README.md'), 'utf8'), before);
});
