import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { Runner } from '../src/runner.mjs';
import { run } from '../src/process.mjs';
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
