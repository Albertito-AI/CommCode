import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Workspaces } from '../src/workspaces.mjs';
import { Runner } from '../src/runner.mjs';
export async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-'));
  const workspaces = new Workspaces(root);
  await workspaces.init();
  const ws = await workspaces.create({ name: 'Test project' });
  const runner = new Runner({ mode: 'process' });
  t.after(async () => {
    await runner.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, workspaces, ws, runner };
}
