import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { Runner } from '../src/runner.mjs';
import { run } from '../src/process.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { id } from '../src/security.mjs';
import { ContainerOwnership } from '../src/container-ownership.mjs';
test('Docker isolation, real tests, readonly Git, preview and cleanup', async (t) => {
  const { ws } = await fixture(t);
  const runner = new Runner();
  t.after(() => runner.close());
  const status = await runner.status();
  assert.equal(status.available, true, JSON.stringify(status));
  const tested = await runner.execute(ws, ws.test);
  assert.equal(tested.code, 0, tested.output);
  const identity = await runner.execute(ws, 'id -u');
  assert.notEqual(identity.output.trim(), '0');
  const write = await runner.execute(ws, 'touch /.commcode-test');
  assert.notEqual(write.code, 0);
  const gitWrite = await runner.execute(ws, 'touch .git/unauthorised');
  assert.notEqual(gitWrite.code, 0);
  const app = await runner.start(ws);
  assert.equal(app.verified, true, JSON.stringify(await runner.logs(ws.id)));
  const running = runner.apps.get(ws.id);
  const network = await run('docker', [
    'inspect',
    '--format',
    '{{.HostConfig.NetworkMode}}',
    running.name,
  ]);
  assert.equal(network.output.trim(), 'none');
  const preview = await fetch('http://127.0.0.1:' + running.port + '/app.js');
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /validExpense/);
  await runner.stop(ws.id);
  assert.equal(runner.apps.size, 0);
});

test('real Docker recovery removes only the reviewed prior-instance container and cancellation leaves no owned job', async (t) => {
  const { ws } = await fixture(t);
  const { ws: other } = await fixture(t);
  const runner = new Runner();
  const current = await runner.ownerFor(ws);
  const prior = await ContainerOwnership.create(path.dirname(path.dirname(ws.root)), id());
  const created = [];
  t.after(async () => {
    await runner.close();
    for (const container of created) await run('docker', ['rm', '-f', container]);
  });
  const create = async (owner, source, extraLabels = []) => {
    const name = 'pw-app-' + owner.instance + '-' + id();
    const result = await run('docker', [
      'create',
      '--name',
      name,
      ...owner.labels(ws, 'app'),
      ...extraLabels,
      '--network',
      'none',
      '--read-only',
      '--mount',
      'type=bind,src=' + source + ',dst=/workspace',
      runner.image,
      'sleep',
      '300',
    ]);
    assert.equal(result.code, 0, result.output);
    const container = result.output.trim();
    created.push(container);
    return container;
  };
  const stale = await create(prior, ws.root);
  const active = await create(current, ws.root);
  const wrongMount = await create(prior, other.root);
  const foreign = await create(prior, ws.root, ['--label', 'io.commcode.owner=' + 'f'.repeat(64)]);
  assert.equal((await run('docker', ['start', stale])).code, 0);
  const records = (await runner.resources(ws)).resources;
  assert.equal(records.find((record) => record.id === stale).running, true);
  assert.equal(records.find((record) => record.id === stale).cleanupAllowed, true);
  assert.equal(records.find((record) => record.id === active).finding, 'current_instance');
  assert.equal(records.find((record) => record.id === wrongMount).finding, 'ownership_mismatch');
  assert.equal(
    records.some((record) => record.id === foreign),
    false,
  );
  for (const container of [active, wrongMount, foreign]) {
    await assert.rejects(runner.cleanup(ws, container), /Cleanup refused/);
    assert.equal((await run('docker', ['inspect', container])).code, 0);
  }
  const sourceBefore = await fs.readFile(path.join(ws.root, 'README.md'), 'utf8');
  assert.deepEqual(await runner.cleanup(ws, stale), { removed: stale });
  assert.notEqual((await run('docker', ['inspect', stale])).code, 0);
  assert.equal(await fs.readFile(path.join(ws.root, 'README.md'), 'utf8'), sourceBefore);
  const controller = new AbortController();
  const executing = runner.execute(ws, 'sleep 300', { signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 750);
  let result;
  try {
    result = await executing;
  } finally {
    clearTimeout(timer);
  }
  assert.equal(result.cancelled, true);
  const jobs = await run('docker', [
    'ps',
    '-aq',
    '--no-trunc',
    '--filter',
    'label=io.commcode.owner=' + current.owner,
    '--filter',
    'label=io.commcode.instance=' + current.instance,
    '--filter',
    'label=io.commcode.kind=job',
  ]);
  assert.equal(jobs.code, 0, jobs.output);
  assert.equal(jobs.output.trim(), '');
});
