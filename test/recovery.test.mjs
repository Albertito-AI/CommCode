import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Agent } from '../src/agent.mjs';
import { hash, token } from '../src/security.mjs';
import { fixture } from './helpers.mjs';
import { createApp } from '../src/server.mjs';

function interrupted(ws, applied, overrides = {}) {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    state: 'applying',
    head: overrides.head,
    applied,
    originals: overrides.originals || {},
  };
}
function agent(workspaces, runner) {
  return new Agent(workspaces, runner, { info: () => ({ enabled: false }) });
}
async function persist(ws, task) {
  await fs.writeFile(path.join(path.dirname(ws.root), 'task-' + task.id + '.json'), JSON.stringify(task));
}

test('restarted workbench offers read-only guarded recovery for matching task bytes', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const a = agent(workspaces, runner);
  assert.deepEqual((await a.recovery(ws)).tasks, []);
  const p = path.join(ws.root, 'README.md');
  const before = await fs.readFile(p, 'utf8');
  const replacement = before + '\nInterrupted change';
  const head = (await workspaces.inspect(ws)).head;
  const item = interrupted(ws, { 'README.md': hash(replacement) }, {
    head,
    originals: { 'README.md': before },
  });
  await persist(ws, item);
  await fs.writeFile(p, replacement);
  const fresh = agent(workspaces, runner); // Simulate a new Agent after server restart.
  const result = await fresh.recovery(ws);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].finding, 'guarded_rollback_candidate');
  assert.equal(result.tasks[0].canAttemptRollback, true);
  assert.equal(result.tasks[0].files[0].finding, 'task_bytes_present');
  assert.equal(await fs.readFile(p, 'utf8'), replacement);
  await fresh.rollback(ws, await fresh.read(ws, item.id));
  assert.equal(await fs.readFile(p, 'utf8'), before);
  assert.deepEqual((await fresh.recovery(ws)).tasks, []);
});

test('unexpected or malformed originals never qualify for rollback', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const a = agent(workspaces, runner);
  const p = path.join(ws.root, 'README.md');
  const before = await fs.readFile(p, 'utf8');
  const added = before + '\\nAgent change';
  const head = (await workspaces.inspect(ws)).head;
  const untouched = path.join(ws.root, 'untouched.txt');
  await fs.writeFile(untouched, 'A user file');
  await fs.writeFile(p, added);

  for (const originals of [
    { 'README.md': before, 'untouched.txt': 'stale content' },
    { 'README.md': 42 },
    ['untrusted array'],
  ]) {
    const item = interrupted(ws, { 'README.md': hash(added) }, { head, originals });
    await persist(ws, item);
    const review = (await a.recovery(ws)).tasks[0];
    assert.equal(review.finding, 'manual_review_required');
    assert.equal(review.canAttemptRollback, false);
    await assert.rejects(a.rollback(ws, await a.read(ws, item.id)), /task record/);
    assert.equal(await fs.readFile(untouched, 'utf8'), 'A user file');
    assert.equal(await fs.readFile(p, 'utf8'), added);
  }
});

test('partial writes and later user edits stay untouched and require manual review', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const a = agent(workspaces, runner);
  const head = (await workspaces.inspect(ws)).head;
  const p = path.join(ws.root, 'README.md');
  const original = await fs.readFile(p, 'utf8');
  const item = interrupted(ws, {
    'README.md': hash('agent bytes'),
    'not-written.txt': hash('not written yet'),
  }, { head, originals: { 'README.md': original, 'not-written.txt': null } });
  await persist(ws, item);
  await fs.writeFile(p, 'external edit');
  const r = await a.recovery(ws);
  assert.equal(r.tasks[0].finding, 'manual_review_required');
  assert.equal(r.tasks[0].canAttemptRollback, false);
  assert.ok(r.tasks[0].files.every((f) => f.finding === 'changed_or_unavailable'));
  await assert.rejects(a.rollback(ws, await a.read(ws, item.id)), /changed outside/);
  assert.equal(await fs.readFile(p, 'utf8'), 'external edit');
});

test('new commit, live operation flag and malformed records cannot be called safe', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const a = agent(workspaces, runner);
  const p = path.join(ws.root, 'README.md');
  const bytes = await fs.readFile(p);
  const item = interrupted(ws, { 'README.md': hash(bytes) }, { head: '0'.repeat(40) });
  await persist(ws, item);
  const r = await a.recovery(ws);
  assert.equal(r.tasks[0].canAttemptRollback, false);
  assert.equal(r.tasks[0].headMatches, false);
  item.head = (await workspaces.inspect(ws)).head;
  await persist(ws, item);
  assert.equal((await a.recovery(ws, { activeApply: true })).tasks[0].finding,
    'possibly_running_in_this_session');
  assert.equal((await a.recovery(ws, { activeApply: true })).tasks[0].canAttemptRollback,
    false);
  await fs.writeFile(path.join(path.dirname(ws.root),
    'task-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json'), '{invalid');
  const corrupted = await a.recovery(ws);
  assert.equal(corrupted.tasks.length, 2);
  assert.ok(corrupted.tasks.some((x) => x.finding === 'record_needs_manual_review'));
  assert.ok(corrupted.tasks.every((x) => !('originals' in x)));
});

test('recovery endpoint needs authentication and exposes no task source contents', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-recovery-api-'));
  const key = token();
  const app = await createApp({ root, token: key, mode: 'process', port: 0, previewPort: 0 });
  t.after(async () => { await app.close(); await fs.rm(root, { recursive: true, force: true }); });
  const ws = await app.workspaces.create({ name: 'Recovery test' });
  const pathPart = 'workspaces/' + ws.id + '/recovery';
  const denied = await fetch(app.url + '/api/' + pathPart);
  assert.equal(denied.status, 401);
  const allowed = await fetch(app.url + '/api/' + pathPart, {
    headers: { Authorization: 'Bearer ' + key },
  });
  assert.equal(allowed.status, 200);
  const data = await allowed.json();
  assert.deepEqual(data.tasks, []);
  assert.equal(data.truncated, false);
});
