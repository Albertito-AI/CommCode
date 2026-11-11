// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Fault, id } from './security.mjs';

export async function acquireServerLease(root) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const file = path.join(await fs.realpath(root), '.server.lock');
  const identity = id();
  let handle;
  try {
    handle = await fs.open(file, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Fault(
        'This data directory has an existing server lock. Stop its server, or inspect .server.lock and confirm that no process uses this directory before manually removing a stale lock.',
        409,
      );
    throw error;
  }
  try {
    await handle.writeFile(
      JSON.stringify({
        identity,
        pid: process.pid,
        hostname: os.hostname(),
        startedAt: new Date().toISOString(),
      }) + '\n',
    );
    await handle.sync();
  } catch (error) {
    await handle.close();
    await fs.unlink(file);
    throw error;
  }
  await handle.close();
  return {
    async release() {
      const stat = await fs.lstat(file).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!stat) return;
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 4096)
        throw new Fault('Server lock changed; it was retained for manual review.', 409);
      const record = JSON.parse(await fs.readFile(file, 'utf8'));
      if (record.identity !== identity)
        throw new Fault('Server lock ownership changed; it was retained for manual review.', 409);
      await fs.unlink(file);
    },
  };
}
