import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Agent } from '../src/agent.mjs';
import { fixture } from './helpers.mjs';
function model(proposals) {
  let calls = 0;
  return {
    info: () => ({ kind: 'TEST FIXTURE, not a live model' }),
    propose: async () => {
      const proposal = proposals[Math.min(calls++, proposals.length - 1)];
      return {
        plan: ['Apply the test fixture'],
        explanation: 'Deterministic response for integration testing.',
        files: proposal,
        usage: { inputTokens: null, outputTokens: null },
      };
    },
    calls: () => calls,
  };
}
test('proposal leaves files untouched, apply tests changes, rollback restores them', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const before = await fs.readFile(path.join(ws.root, 'README.md'), 'utf8');
  const agent = new Agent(
    workspaces,
    runner,
    model([[{ path: 'README.md', content: before + '\nUpdated guide.' }]]),
  );
  const task = await agent.propose(ws, 'Update guide', { shareSource: true });
  assert.equal(await fs.readFile(path.join(ws.root, 'README.md'), 'utf8'), before);
  const done = await agent.apply(ws, task.id);
  assert.equal(done.state, 'verified');
  assert.equal(done.attempts[0].code, 0);
  assert.equal(done.verification.preview, 'UNVERIFIED');
  await agent.rollback(ws, done);
  assert.equal(await fs.readFile(path.join(ws.root, 'README.md'), 'utf8'), before);
});
test('AI context sharing requires explicit authorisation', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  await assert.rejects(
    new Agent(workspaces, runner, model([])).propose(ws, 'Do work'),
    /authorise/,
  );
});
test('dirty workspaces and changed proposals are refused', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const agent = new Agent(workspaces, runner, model([[{ path: 'README.md', content: 'changed' }]]));
  const task = await agent.propose(ws, 'Change guide', { shareSource: true });
  await fs.writeFile(path.join(ws.root, 'user.txt'), 'Keep this');
  await assert.rejects(agent.apply(ws, task.id), /changed after/);
  await assert.rejects(
    agent.propose(ws, 'More changes', { shareSource: true }),
    /existing changes/,
  );
});
test('real test failure rolls back edits', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const before = await fs.readFile(path.join(ws.root, 'expenses.mjs'), 'utf8');
  const agent = new Agent(
    workspaces,
    runner,
    model([
      [
        {
          path: 'expenses.mjs',
          content: 'export const total=()=>999; export const validExpense=()=>true;',
        },
      ],
    ]),
  );
  const task = await agent.propose(ws, 'Test rollback fixture', { shareSource: true });
  const result = await agent.apply(ws, task.id);
  assert.equal(result.state, 'rolled_back');
  assert.notEqual(result.attempts[0].code, 0);
  assert.equal(await fs.readFile(path.join(ws.root, 'expenses.mjs'), 'utf8'), before);
});

test('failed real tests remove a newly created __proto__ file through recorded rollback', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const agent = new Agent(
    workspaces,
    runner,
    model([
      [
        { path: '__proto__', content: 'A legitimate filename from a labelled fixture' },
        {
          path: 'expenses.mjs',
          content: 'export const total=()=>999; export const validExpense=()=>true;',
        },
      ],
    ]),
  );
  const task = await agent.propose(ws, 'Special filename rollback fixture', { shareSource: true });
  const result = await agent.apply(ws, task.id);
  assert.equal(result.state, 'rolled_back');
  assert.notEqual(result.attempts[0].code, 0);
  await assert.rejects(fs.stat(path.join(ws.root, '__proto__')), { code: 'ENOENT' });
  const saved = await agent.read(ws, task.id);
  assert.equal(Object.hasOwn(saved.originals, '__proto__'), true);
  assert.equal(saved.originals.__proto__, null);
  assert.equal(Object.hasOwn(saved.applied, '__proto__'), true);
});

test('JSON-reloaded recovery preserves special filenames and still refuses later user edits', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  await workspaces.write(ws, { path: '__proto__', content: 'Original special file', etag: null });
  await workspaces.commit(ws, 'Add a legitimate special filename');
  const agent = new Agent(
    workspaces,
    runner,
    model([
      [
        { path: '__proto__', content: 'Task special file' },
        { path: 'constructor', content: 'Task constructor file' },
        { path: 'toString', content: 'Task toString file' },
      ],
    ]),
  );
  const proposed = await agent.propose(ws, 'Special filename restore fixture', {
    shareSource: true,
  });
  assert.equal((await agent.apply(ws, proposed.id)).state, 'verified');
  const reloaded = await agent.read(ws, proposed.id);
  assert.equal(Object.hasOwn(reloaded.originals, '__proto__'), true);
  assert.equal(reloaded.originals.__proto__, 'Original special file');
  await fs.writeFile(path.join(ws.root, '__proto__'), 'Later user change');
  await assert.rejects(agent.rollback(ws, reloaded), /changed outside/);
  assert.equal(await fs.readFile(path.join(ws.root, '__proto__'), 'utf8'), 'Later user change');
  await fs.writeFile(path.join(ws.root, '__proto__'), 'Task special file');
  await agent.rollback(ws, await agent.read(ws, proposed.id));
  assert.equal(await fs.readFile(path.join(ws.root, '__proto__'), 'utf8'), 'Original special file');
  for (const name of ['constructor', 'toString'])
    await assert.rejects(fs.stat(path.join(ws.root, name)), { code: 'ENOENT' });
});
test('bounded repair uses actual failing tests and a deterministic repair fixture', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const good = await fs.readFile(path.join(ws.root, 'expenses.mjs'), 'utf8');
  const provider = model([
    [
      {
        path: 'expenses.mjs',
        content: 'export const total=()=>999; export const validExpense=()=>true;',
      },
    ],
    [{ path: 'expenses.mjs', content: good + '\n// Repaired fixture\n' }],
  ]);
  const agent = new Agent(workspaces, runner, provider);
  const task = await agent.propose(ws, 'Integration fixture', { shareSource: true });
  const result = await agent.apply(ws, task.id, { repairAttempts: 1 });
  assert.equal(result.state, 'verified');
  assert.equal(result.attempts.length, 2);
  assert.equal(provider.calls(), 2);
});
test('rollback refuses to overwrite subsequent user changes', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const agent = new Agent(
    workspaces,
    runner,
    model([[{ path: 'README.md', content: 'Agent change' }]]),
  );
  const task = await agent.propose(ws, 'Change guide', { shareSource: true });
  const result = await agent.apply(ws, task.id);
  await fs.writeFile(path.join(ws.root, 'README.md'), 'My later changes');
  await assert.rejects(agent.rollback(ws, result), /changed outside/);
  assert.equal(await fs.readFile(path.join(ws.root, 'README.md'), 'utf8'), 'My later changes');
});
test('rollback cannot silently reverse a later commit', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const agent = new Agent(
    workspaces,
    runner,
    model([[{ path: 'README.md', content: 'Reviewed change' }]]),
  );
  const proposed = await agent.propose(ws, 'Change guide', { shareSource: true });
  const applied = await agent.apply(ws, proposed.id);
  await workspaces.commit(ws, 'Keep the reviewed change');
  await assert.rejects(agent.rollback(ws, applied), /Git history changed/);
});
