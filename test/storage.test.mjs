import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { TaskStore } from '../src/task-store.mjs';
import { Agent } from '../src/agent.mjs';
import { acquireServerLease } from '../src/server-lease.mjs';
import { atomicJSON, hash, id, token } from '../src/security.mjs';
import { git } from '../src/process.mjs';
import { createApp } from '../src/server.mjs';
import { Runner } from '../src/runner.mjs';
import { WorkspaceBudget } from '../src/workspace-budget.mjs';
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

test('shutdown retains the server lease until an in-flight job finishes its persistence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-close-lease-'));
  const key = token();
  let release, entered, second, lateRequest;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const provider = {
    info: () => ({ kind: 'delayed shutdown fixture, not a live model' }),
    propose: async () => {
      entered();
      await gate;
      return {
        plan: ['Shutdown fixture'],
        explanation: 'Controlled persistence after cancellation.',
        files: [{ path: 'README.md', content: 'Fixture proposal' }],
      };
    },
  };
  const app = await createApp({
    root,
    token: key,
    provider,
    mode: 'process',
    port: 0,
    previewPort: 0,
  });
  const call = async (route, data) => {
    const response = await fetch(app.url + '/api/' + route, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    assert.equal(response.ok, true);
    return response.json();
  };
  let closing;
  try {
    const workspace = await call('workspaces', { name: 'Shutdown persistence' });
    await call('workspaces/' + workspace.id + '/propose', {
      objective: 'Labelled delayed proposal',
      shareSource: true,
    });
    await started;
    let enteredLate;
    const lateEntered = new Promise((resolve) => {
      enteredLate = resolve;
    });
    const originalGet = app.workspaces.get.bind(app.workspaces);
    app.workspaces.get = async (key) => {
      const workspace = await originalGet(key);
      enteredLate();
      return workspace;
    };
    const lateBody = JSON.stringify({ objective: 'Late request fixture', shareSource: true });
    const lateResponse = new Promise((resolve, reject) => {
      lateRequest = http.request(
        app.url + '/api/workspaces/' + workspace.id + '/propose',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(lateBody),
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      );
      lateRequest.on('error', reject);
      lateRequest.write(lateBody.slice(0, 1));
    });
    await lateEntered;
    closing = app.close();
    const concurrentClose = app.close();
    lateRequest.end(lateBody.slice(1));
    assert.equal(
      await lateResponse,
      503,
      'A request body completed during shutdown must not start a new job',
    );
    assert.equal(app.jobs.size, 1);
    assert.equal(
      concurrentClose,
      closing,
      'Concurrent close callers share one lease-release operation',
    );
    const finishedEarly = await Promise.race([
      closing.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 75)),
    ]);
    assert.equal(finishedEarly, false, 'Shutdown must wait for final job persistence');
    await assert.rejects(async () => {
      second = await createApp({ root, token: key, mode: 'process', port: 0, previewPort: 0 });
    }, /existing server lock/);
    release();
    await closing;
    assert.equal(app.workspaces.locks.size, 0);
    const restarted = await createApp({
      root,
      token: key,
      mode: 'process',
      port: 0,
      previewPort: 0,
    });
    await restarted.close();
  } finally {
    lateRequest?.destroy();
    release();
    for (let attempt = 0; app.workspaces.locks.size && attempt < 100; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    if (closing) await closing;
    else await app.close();
    await second?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
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

test('workspace budget counts Git, dependencies and metadata but never follows an external link', async (t) => {
  const { ws, workspaces } = await fixture(t);
  const before = await workspaces.budget.usage(ws);
  const outside = path.join(os.tmpdir(), 'commcode-outside-' + id());
  t.after(() => fs.rm(outside, { force: true }));
  await fs.writeFile(outside, 'x'.repeat(1024 * 1024));
  await fs.mkdir(path.join(ws.root, 'node_modules'));
  await fs.writeFile(path.join(ws.root, 'node_modules', 'fixture'), 'x'.repeat(4096));
  await fs.writeFile(path.join(path.dirname(ws.root), 'activity-fixture.json'), '{}');
  await fs.symlink(outside, path.join(ws.root, 'external-link'));
  const after = await workspaces.budget.usage(ws);
  assert.equal(after.bytes - before.bytes, 4096 + 2 + Buffer.byteLength(outside));
  assert.ok(before.bytes > 0, 'Existing Git/source bytes were included');
});

test('ordinary writes stop before the workspace reserve while an existing-file rollback remains available', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const source = path.join(ws.root, 'README.md');
  const before = await fs.readFile(source, 'utf8');
  const after = before + '\nA recoverable edit';
  const agent = new Agent(workspaces, runner, {});
  const task = {
    id: id(),
    state: 'applying',
    head: (await workspaces.inspect(ws)).head,
    applied: { 'README.md': hash(after) },
    originals: { 'README.md': before },
  };
  await agent.save(ws, task);
  await fs.writeFile(source, after);
  const used = (await workspaces.budget.usage(ws)).bytes;
  workspaces.budget = new WorkspaceBudget({
    bytes: used + 4096,
    recoveryReserve: 4096,
    entries: 100000,
  });
  await assert.rejects(
    workspaces.write(ws, { path: 'new.txt', content: 'Denied', etag: null }),
    /storage budget/,
  );
  assert.equal(await fs.readFile(source, 'utf8'), after);
  await assert.rejects(fs.stat(path.join(ws.root, 'new.txt')), { code: 'ENOENT' });
  await agent.rollback(ws, await agent.read(ws, task.id));
  assert.equal(await fs.readFile(source, 'utf8'), before);
  assert.equal((await agent.read(ws, task.id)).state, 'rolled_back');
  assert.ok((await workspaces.budget.usage(ws)).bytes <= workspaces.budget.limits.bytes);
});

test('a real short command that overshoots the budget fails visibly and preserves its files for review', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const used = (await workspaces.budget.usage(ws)).bytes;
  runner.budget = new WorkspaceBudget({
    bytes: used + 8192,
    recoveryReserve: 4096,
    entries: 100000,
  });
  const result = await runner.execute(
    ws,
    "node -e \"require('fs').writeFileSync('overshoot.txt', 'x'.repeat(5000))\"",
  );
  assert.notEqual(result.code, 0);
  assert.equal(result.budgetExceeded, true);
  assert.equal((await fs.stat(path.join(ws.root, 'overshoot.txt'))).size, 5000);
  await assert.rejects(runner.execute(ws, 'node --version'), /storage budget/);
});

test('a continuing command is aborted after a sampled workspace overshoot', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const used = (await workspaces.budget.usage(ws)).bytes;
  runner.budget = new WorkspaceBudget({
    bytes: used + 8192,
    recoveryReserve: 4096,
    entries: 100000,
  });
  const result = await runner.execute(
    ws,
    "node -e \"require('fs').writeFileSync('overshoot.txt', 'x'.repeat(5000)); setInterval(()=>{},1000)\"",
    { timeout: 10000 },
  );
  assert.equal(result.budgetExceeded, true);
  assert.equal(result.cancelled, true);
  assert.equal(result.timedOut, false);
});

test('Docker removal failures remain tracked until absence is confirmed by the daemon adapter', async (t) => {
  const { ws } = await fixture(t);
  let absent = false;
  const container = 'a'.repeat(64);
  const runner = new Runner({
    docker: async (_bin, args) =>
      args[0] === 'rm'
        ? { code: 1, output: 'Labelled daemon fixture: removal failed' }
        : { code: 0, output: absent ? '' : container + '\n' },
  });
  const app = { container, name: 'owned-fixture' };
  runner.apps.set(ws.id, app);
  await assert.rejects(runner.stop(ws.id), /remains available/);
  assert.equal(runner.apps.get(ws.id), app);
  absent = true;
  await runner.stop(ws.id);
  assert.equal(runner.apps.has(ws.id), false);
});

test('failed job and startup cleanup are surfaced by the labelled daemon fixture', async (t) => {
  const { ws } = await fixture(t);
  for (const starting of [false, true]) {
    const calls = [];
    const runner = new Runner({
      docker: async (_bin, args) => {
        calls.push(args[0]);
        if (args[0] === 'run')
          return { code: starting ? 1 : 0, output: 'Labelled execution fixture' };
        if (args[0] === 'rm') return { code: 1, output: 'Labelled daemon fixture: removal denied' };
        if (args[0] === 'ps') return { code: 0, output: 'a'.repeat(64) + '\n' };
        throw new Error('Unexpected fixture command');
      },
    });
    await assert.rejects(
      starting ? runner.start(ws) : runner.execute(ws, 'fixture'),
      /Could not remove the owned container/,
    );
    assert.deepEqual(calls, ['run', 'rm', 'ps']);
  }
});

test('an old idle sweep cannot revoke the capability of a restarted real preview', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-capability-'));
  const key = token();
  const app = await createApp({ root, token: key, mode: 'process', port: 0, previewPort: 0 });
  t.after(async () => {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const call = async (route, data) => {
    const response = await fetch(app.url + '/api/' + route, {
      method: data ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + key,
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    assert.equal(response.ok, true);
    return response.json();
  };
  const workspace = await call('workspaces', { name: 'Preview race' });
  const start = async () => {
    const job = await call('workspaces/' + workspace.id + '/start', {});
    for (let attempt = 0; attempt < 100; attempt++) {
      const record = await call('jobs/' + job.id);
      if (record.state === 'done') return record.result;
      if (record.state === 'failed') throw new Error(record.error);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Preview job did not complete');
  };
  await start();
  let release, stopped;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  const stoppedSignal = new Promise((resolve) => {
    stopped = resolve;
  });
  const original = app.runner.suspendIdle.bind(app.runner);
  app.runner.suspendIdle = async () => {
    const result = await original(Date.now() + app.runner.idleTimeoutMs);
    stopped();
    await released;
    return result;
  };
  const sweep = app.sweepIdle();
  await stoppedSignal;
  const restarted = await start();
  release();
  await sweep;
  const response = await fetch(restarted.url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Community expenses/);
});

test('cancelling a real test process rolls back task bytes and retains unrelated command output files', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  ws.test =
    "node -e \"require('fs').writeFileSync('test-ready.txt', 'keep'); setInterval(()=>{},1000)\"";
  const before = await fs.readFile(path.join(ws.root, 'README.md'), 'utf8');
  const agent = new Agent(workspaces, runner, {
    info: () => ({ kind: 'deterministic fixture' }),
    propose: async () => ({
      plan: ['Cancellation regression'],
      explanation: 'Fixture, not a live model.',
      files: [{ path: 'README.md', content: before + '\nTask edit' }],
    }),
  });
  const task = await agent.propose(ws, 'Cancellation fixture', { shareSource: true });
  const controller = new AbortController();
  const applying = agent.apply(ws, task.id, { signal: controller.signal });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await fs.stat(path.join(ws.root, 'test-ready.txt')).catch(() => null)) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  controller.abort();
  const result = await applying;
  assert.equal(result.state, 'rolled_back');
  assert.equal(result.attempts[0].cancelled, true);
  assert.equal(await fs.readFile(path.join(ws.root, 'README.md'), 'utf8'), before);
  assert.equal(await fs.readFile(path.join(ws.root, 'test-ready.txt'), 'utf8'), 'keep');
});
