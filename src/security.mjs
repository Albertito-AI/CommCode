// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class Fault extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const id = () => crypto.randomUUID();
export const token = () => crypto.randomBytes(32).toString('hex');
export const sensitiveName = (name) =>
  /(^|\/)(\.git|\.env(?!\.example(?:\/|$))(?:\..*)?|node_modules|\.venv|\.ssh|\.aws|\.commcode)(\/|$)/i.test(
    name,
  ) ||
  /(?:^|\/)(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/i.test(name) ||
  /\.(pem|key|p12|pfx)$/i.test(name);
export function relativeName(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.length > 240 ||
    /[\x00-\x1f\\:]/.test(name) ||
    path.isAbsolute(name) ||
    name.split('/').some((p) => !p || p === '.' || p === '..') ||
    sensitiveName(name)
  )
    throw new Fault(
      'Use a relative source-file path. Secrets, Git internals and dependency directories are protected.',
    );
  return name;
}
export async function safePath(root, name) {
  relativeName(name);
  let p = root;
  for (const part of name.split('/')) {
    p = path.join(p, part);
    const st = await fs.lstat(p).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if (st?.isSymbolicLink() || (st && st.nlink > 1 && st.isFile()))
      throw new Fault('Linked files are not editable.');
  }
  return p;
}
export const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b/g,
  /(?:api[_-]?key|password|secret|token)\s*[:=]\s*["']?([A-Za-z0-9_+\/=-]{16,})/gi,
];
export function containsSecret(text) {
  return secretPatterns.some((p) => {
    p.lastIndex = 0;
    return p.test(text);
  });
}
export function redact(value, known = []) {
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  for (const key of known.filter((x) => typeof x === 'string' && x.length > 3))
    s = s.split(key).join('[REDACTED]');
  for (const p of secretPatterns) {
    p.lastIndex = 0;
    s = s.replace(p, '[REDACTED]');
  }
  return s;
}
export function constantEqual(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function githubURL(value) {
  if (
    typeof value !== 'string' ||
    !/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(value)
  )
    throw new Fault(
      'Import requires an ordinary HTTPS github.com repository URL without credentials or query strings.',
    );
  return value;
}
export async function files(root, max = 500) {
  const out = [];
  async function walk(dir, prefix = '') {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const name = prefix + ent.name;
      if (sensitiveName(name) || ent.isSymbolicLink()) continue;
      if (out.length >= max) throw new Fault(`Workspace exceeds the ${max}-file inspection limit.`);
      if (ent.isDirectory()) await walk(path.join(dir, ent.name), name + '/');
      else if (ent.isFile()) out.push(name);
    }
  }
  await walk(root);
  return out.sort();
}
export async function textFile(root, name) {
  const p = await safePath(root, name);
  const st = await fs.stat(p);
  if (!st.isFile() || st.size > 256 * 1024)
    throw new Fault('Only text files up to 256 KiB can be opened.');
  const data = await fs.readFile(p);
  if (data.includes(0)) throw new Fault('Binary files cannot be opened in the text editor.');
  return data.toString('utf8');
}
export async function atomicJSON(p, data) {
  const tmp = p + '.' + id() + '.tmp';
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(tmp, p);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}
export function boundedString(value, name, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0'))
    throw new Fault(`${name} must contain 1–${max} characters.`);
  return value;
}
