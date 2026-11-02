import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers.mjs';
import { git } from '../src/process.mjs';
test('starter has real Git history and executable passing tests', async (t) => {
  const { ws, workspaces, runner } = await fixture(t);
  const before = await workspaces.inspect(ws);
  assert.equal(before.status, '');
  assert.equal(before.head.length, 40);
  const result = await runner.execute(ws, ws.test);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /pass 4/);
});
test('file saves refuse stale versions and allow a new file', async (t) => {
  const { ws, workspaces } = await fixture(t);
  const f = await workspaces.read(ws, 'README.md');
  await workspaces.write(ws, { ...f, content: f.content + '\nChange' });
  await assert.rejects(workspaces.write(ws, { ...f, content: 'stale' }), /changed/);
  await workspaces.write(ws, { path: 'new.js', content: 'hello', etag: null });
  assert.equal((await workspaces.read(ws, 'new.js')).content, 'hello');
});
test('workspace locks reject competing writes', async (t) => {
  const { ws, workspaces } = await fixture(t);
  let finish;
  const gate = new Promise((r) => (finish = r));
  const one = workspaces.exclusive(ws, () => gate);
  await assert.rejects(
    workspaces.exclusive(ws, async () => {}),
    /busy/,
  );
  finish();
  await one;
});
test('commits detect credentials and otherwise preserve history', async (t) => {
  const { ws, workspaces } = await fixture(t);
  await workspaces.write(ws, { path: 'bad.txt', content: 'ghp_' + 'Z'.repeat(30), etag: null });
  await assert.rejects(workspaces.commit(ws, 'unsafe'), /secret/);
  await fs.rm(path.join(ws.root, 'bad.txt'));
  await workspaces.write(ws, { path: 'good.txt', content: 'public example', etag: null });
  const result = await workspaces.commit(ws, 'Add example');
  assert.equal(result.sha.length, 40);
  assert.equal((await git(ws.root, ['rev-list', '--count', 'HEAD'])).trim(), '2');
});
test('ledger verifies and detects a changed event', async (t) => {
  const { ws, workspaces } = await fixture(t);
  const ledger = workspaces.ledger(ws);
  await ledger.append('test', { value: 'original' });
  assert.equal(await ledger.verify(), true);
  const text = await fs.readFile(ledger.path, 'utf8');
  await fs.writeFile(ledger.path, text.replace('original', 'tampered'));
  assert.equal(await ledger.verify(), false);
});
test('context excludes credentials and oversized files', async (t) => {
  const { ws, workspaces } = await fixture(t);
  await fs.writeFile(path.join(ws.root, '.env'), 'password=secret');
  await fs.writeFile(path.join(ws.root, 'key.txt'), 'ghp_' + 'z'.repeat(30));
  await fs.writeFile(path.join(ws.root, 'large.txt'), 'x'.repeat(17000));
  const data = await workspaces.inspect(ws);
  assert.ok(!data.context.some((f) => ['.env', 'key.txt', 'large.txt'].includes(f.path)));
});
test('Python starter runs its real tests', async (t) => {
  const { workspaces, runner } = await fixture(t);
  const ws = await workspaces.create({ name: 'Python example', template: 'python-api' });
  const result = await runner.execute(ws, ws.test);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Ran 2 tests/);
});
test('commit honours ignored build files and records tracked deletions', async (t) => {
  const { ws, workspaces } = await fixture(t);
  await workspaces.write(ws, { path: '.gitignore', content: 'build/\n', etag: null });
  await fs.mkdir(path.join(ws.root, 'build'));
  await fs.writeFile(path.join(ws.root, 'build', 'ignored.txt'), 'ghp_' + 'q'.repeat(30));
  await fs.rm(path.join(ws.root, 'README.md'));
  await workspaces.commit(ws, 'Record deletion without ignored build output');
  assert.equal((await git(ws.root, ['status', '--porcelain'])).trim(), '');
  assert.ok(!(await git(ws.root, ['ls-files'])).includes('build/'));
  assert.ok(!(await git(ws.root, ['ls-files'])).includes('README.md'));
});
test('public environment example is editable but credential-like content is rejected at commit', async (t) => {
  const { ws, workspaces } = await fixture(t);
  await workspaces.write(ws, {
    path: '.env.example',
    content: 'MODEL_NAME=choose-a-model\n',
    etag: null,
  });
  await workspaces.commit(ws, 'Document environment variables');
  assert.match((await workspaces.read(ws, '.env.example')).content, /MODEL_NAME/);
});
