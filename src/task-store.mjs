// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJSON, Fault } from './security.mjs';

export const TASK_LIMITS = Object.freeze({
  records: 200,
  recordBytes: 8 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
});
export class TaskStore {
  constructor(limits = TASK_LIMITS) {
    this.limits = limits;
  }
  file(ws, key) {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new Fault('Unknown task.', 404);
    return path.join(path.dirname(ws.root), 'task-' + key + '.json');
  }
  async inventory(ws) {
    const base = path.dirname(ws.root);
    const records = [];
    for (const entry of await fs.readdir(base)) {
      if (!/^task-[0-9a-f-]{36}\.json$/.test(entry)) continue;
      const stat = await fs.lstat(path.join(base, entry));
      if (!stat.isFile() || stat.nlink !== 1)
        throw new Fault(
          'Task history contains a linked or non-regular record. Inspect it before further AI work.',
          409,
        );
      records.push({ name: entry, bytes: stat.size });
    }
    return records;
  }
  async admit(ws, key = null) {
    const records = await this.inventory(ws);
    const existing =
      key && records.find((record) => record.name === path.basename(this.file(ws, key)));
    if (!existing && records.length >= this.limits.records)
      throw new Fault(
        'Task history is full. Back up and review completed records before starting another AI task.',
        409,
      );
    const bytes = records.reduce((total, record) => total + record.bytes, 0);
    // Reserve a complete record before a provider call or any source edit. Existing
    // rollback/save paths can use that room without deleting earlier evidence.
    if (bytes - (existing?.bytes || 0) + this.limits.recordBytes > this.limits.totalBytes)
      throw new Fault(
        'Task history has insufficient recovery space. Back up and review completed records before further AI work.',
        409,
      );
  }
  async read(ws, key) {
    const file = this.file(ws, key);
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > this.limits.recordBytes)
        throw new Fault(
          'Task record is linked, oversized or not a regular file. Manual review is required.',
          409,
        );
      const record = JSON.parse(await fs.readFile(file, 'utf8'));
      if (record.id !== key)
        throw new Fault('Task record identity does not match its filename.', 409);
      return record;
    } catch (error) {
      if (error.code === 'ENOENT') throw new Fault('Unknown task.', 404);
      throw error;
    }
  }
  async save(ws, task) {
    const file = this.file(ws, task.id);
    const bytes = Buffer.byteLength(JSON.stringify(task, null, 2) + '\n');
    if (bytes > this.limits.recordBytes)
      throw new Fault('Task record exceeds its recovery storage limit.', 409);
    const records = await this.inventory(ws);
    const existing = records.find((record) => record.name === path.basename(file));
    if (!existing && records.length >= this.limits.records)
      throw new Fault('Task history is full.', 409);
    const total =
      records.reduce((sum, record) => sum + record.bytes, 0) - (existing?.bytes || 0) + bytes;
    if (total > this.limits.totalBytes)
      throw new Fault(
        'Task history exceeds its storage limit. Existing records are retained.',
        409,
      );
    await atomicJSON(file, task);
  }
}
