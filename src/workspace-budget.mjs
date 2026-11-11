// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import { Fault } from './security.mjs';

export const WORKSPACE_LIMITS = Object.freeze({
  bytes: 512 * 1024 * 1024,
  recoveryReserve: 16 * 1024 * 1024,
  entries: 100000,
});

export class WorkspaceBudget {
  constructor(limits = WORKSPACE_LIMITS) {
    this.limits = limits;
  }
  async usage(ws) {
    const pending = [path.dirname(ws.root)];
    let bytes = 0,
      entries = 0;
    while (pending.length) {
      const directory = pending.pop();
      const names = await fs.readdir(directory).catch((error) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      for (const name of names) {
        if (++entries > this.limits.entries)
          throw new Fault(
            'Workspace contains too many entries to establish its storage budget. Review it before further work.',
            409,
          );
        const file = path.join(directory, name);
        const stat = await fs.lstat(file).catch((error) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (!stat) continue;
        if (stat.isDirectory()) pending.push(file);
        else bytes += stat.size; // Count links themselves; never follow them outside the workspace.
      }
    }
    return {
      bytes,
      entries,
      limitBytes: this.limits.bytes,
      ordinaryLimitBytes: this.limits.bytes - this.limits.recoveryReserve,
    };
  }
  async admit(ws, growthBytes = 0, { recovery = false } = {}) {
    const usage = await this.usage(ws);
    const limit = recovery ? usage.limitBytes : usage.ordinaryLimitBytes;
    if (usage.bytes + Math.max(0, growthBytes) > limit)
      throw new Fault(
        'Workspace storage budget reached. Stop active work, export and review files before continuing; existing files are retained.',
        409,
      );
    return usage;
  }
  async execute(ws, fn, signal) {
    await this.admit(ws);
    const controller = new AbortController();
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let violation, pending;
    const check = async () => {
      try {
        await this.admit(ws);
      } catch (error) {
        violation = error;
        controller.abort();
      }
    };
    const timer = setInterval(() => {
      if (!pending)
        pending = check().finally(() => {
          pending = null;
        });
    }, 1000);
    timer.unref();
    let result;
    try {
      result = await fn(combined);
    } finally {
      clearInterval(timer);
      await pending;
    }
    await check(); // A short command can finish before the first sampled check.
    if (violation)
      return {
        ...result,
        code: result.code || 1,
        budgetExceeded: true,
        output: result.output + '\n' + violation.message,
      };
    return result;
  }
}
