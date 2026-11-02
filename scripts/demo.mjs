import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.mjs';
import { token } from '../src/security.mjs';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-demo-'));
const app = await createApp({ root, token: token(), mode: 'process', port: 0, previewPort: 0 });
const evidence = {
  execution: 'Explicit trusted-local process adapter; not a Docker isolation test',
  ai: 'Not invoked; no live model credential used',
  steps: [],
};
try {
  const ws = await app.workspaces.create({ name: 'Community expense tracker' });
  evidence.steps.push({ action: 'create', head: (await app.workspaces.inspect(ws)).head });
  const before = await app.runner.execute(ws, ws.test);
  evidence.steps.push({ action: 'test baseline', ...before });
  if (before.code !== 0) throw Error('Baseline failed');
  const f = await app.workspaces.read(ws, 'index.html');
  await app.workspaces.write(ws, {
    ...f,
    content: f.content.replace('A clearer picture.', 'A shared purpose.'),
  });
  const tests = await app.runner.execute(ws, ws.test);
  evidence.steps.push({ action: 'test actual edit', ...tests });
  if (tests.code !== 0) throw Error('Edited application failed');
  const preview = await app.runner.start(ws);
  evidence.steps.push({ action: 'verify HTTP runtime', ...preview });
  if (!preview.verified) throw Error('Runtime failed');
  await app.runner.stop(ws.id);
  evidence.steps.push({
    action: 'inspect actual diff',
    diff: (await app.workspaces.inspect(ws)).diff,
  });
  evidence.steps.push({
    action: 'commit',
    ...(await app.workspaces.commit(ws, 'Update the community expense tracker heading')),
  });
  evidence.steps.push({
    action: 'verify activity ledger',
    valid: await app.workspaces.ledger(ws).verify(),
  });
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}
