import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const paths = [];
async function walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) await walk(p);
    else if (/\.(mjs|js)$/.test(p) && p !== 'web/editor.js') paths.push(p);
  }
}
for (const dir of ['src', 'web', 'test', 'scripts', 'templates']) await walk(dir);
for (const p of paths) {
  const r = spawnSync(process.execPath, ['--check', p], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log(`Syntax checked ${paths.length} JavaScript modules.`);
