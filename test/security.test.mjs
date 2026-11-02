import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  relativeName,
  safePath,
  containsSecret,
  redact,
  constantEqual,
  githubURL,
} from '../src/security.mjs';
import { validateProposal, Provider } from '../src/providers.mjs';
import { run } from '../src/process.mjs';
import { fixture } from './helpers.mjs';
test('rejects traversal, absolute paths, secrets, Git internals and Windows paths', () => {
  for (const p of [
    '../outside',
    '/etc/passwd',
    'a/../x',
    'a\\b',
    'C:/x',
    '.git/config',
    '.env',
    '.env.production',
    'keys/private.pem',
    'a/\0b',
  ])
    assert.throws(() => relativeName(p));
  assert.equal(relativeName('src/main.js'), 'src/main.js');
});
test('rejects symlink and hardlink file access', async (t) => {
  const { ws, root } = await fixture(t);
  await fs.writeFile(path.join(root, 'outside'), 'secret');
  await fs.symlink(root, path.join(ws.root, 'linked'));
  await assert.rejects(safePath(ws.root, 'linked/outside'));
  await fs.link(path.join(root, 'outside'), path.join(ws.root, 'hard'));
  await assert.rejects(safePath(ws.root, 'hard'));
});
test('detects common credentials and masks known credentials', () => {
  const fake = 'ghp_' + 'a'.repeat(30);
  assert.ok(containsSecret(fake));
  assert.equal(redact('x ' + fake + ' y'), 'x [REDACTED] y');
  assert.equal(redact('private-value', ['private-value']), '[REDACTED]');
});
test('token comparison rejects unicode without throwing', () => {
  assert.equal(constantEqual('é', 'a'), false);
  assert.equal(constantEqual('abc', 'abc'), true);
  assert.equal(constantEqual(undefined, 'abc'), false);
});
test('repository import permits HTTPS GitHub only', () => {
  assert.equal(githubURL('https://github.com/owner/repo'), 'https://github.com/owner/repo');
  for (const u of [
    'file:///etc',
    'https://github.com.evil/repo/x',
    'https://user:pass@github.com/a/b',
    '--upload-pack=evil',
    'https://github.com/a/b?x=1',
  ])
    assert.throws(() => githubURL(u));
});
test('model proposals cannot edit policy or use duplicate paths', () => {
  const good = {
    plan: ['Change title'],
    explanation: 'A small title edit.',
    files: [{ path: 'index.html', content: 'hello' }],
  };
  assert.equal(validateProposal(good).files[0].content, 'hello');
  for (const p of ['.github/workflows/ci.yml', '../x', 'package-lock.json', '.git/config'])
    assert.throws(() => validateProposal({ ...good, files: [{ path: p, content: 'x' }] }));
  assert.throws(() => validateProposal({ ...good, files: [...good.files, ...good.files] }));
  assert.throws(() => validateProposal('not JSON'));
});
test('AI endpoints reject plaintext external and embedded credentials', () => {
  for (const url of ['http://example.com/chat', 'https://user:pw@example.com/chat'])
    assert.throws(() => new Provider({ kind: 'compatible', url, model: 'model', key: 'test' }));
  assert.equal(new Provider().info().enabled, false);
});
test('command timeout and output limit kill the process', async () => {
  const timeout = await run(process.execPath, ['-e', 'setInterval(()=>{},100)'], { timeout: 100 });
  assert.equal(timeout.timedOut, true);
  assert.notEqual(timeout.code, 0);
  const bounded = await run(process.execPath, ['-e', "console.log('a'.repeat(10000))"], {
    limit: 100,
  });
  assert.equal(bounded.truncated, true);
});
test('aborted commands report cancellation', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const r = await run(process.execPath, ['-e', 'setInterval(()=>{},100)'], {
    signal: controller.signal,
  });
  assert.equal(r.cancelled, true);
});
