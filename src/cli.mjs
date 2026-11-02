// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import { token as makeToken } from './security.mjs';
import { createApp } from './server.mjs';

const root = path.resolve(process.env.COMMCODE_HOME || '.commcode');
await fs.mkdir(root, { recursive: true, mode: 0o700 });
const tokenPath = path.join(root, 'access-token');
let token = process.env.COMMCODE_TOKEN || (await fs.readFile(tokenPath, 'utf8').catch(() => null));
if (!token) {
  token = makeToken();
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
}
const mode = process.argv.includes('--unsafe-local') ? 'process' : 'docker';
const app = await createApp({
  root,
  token: token.trim(),
  mode,
  port: Number(process.env.COMMCODE_PORT || 4317),
  previewPort: Number(process.env.COMMCODE_PREVIEW_PORT || 4318),
});
console.log(
  `CommCode is listening at ${app.url}\nAccess token: read ${tokenPath}\nExecution: ${mode === 'docker' ? 'Docker (no fallback)' : 'UNISOLATED trusted-local mode'}`,
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
