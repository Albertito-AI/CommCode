// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import { id, safePath, hash, Fault, boundedString } from './security.mjs';
import { TaskStore } from './task-store.mjs';
import { git } from './process.mjs';
import { validateProposal } from './providers.mjs';

function matchesRollbackTargets(applied, originals) {
  if (
    !applied ||
    typeof applied !== 'object' ||
    Array.isArray(applied) ||
    !originals ||
    typeof originals !== 'object' ||
    Array.isArray(originals)
  ) {
    return false;
  }
  const keys = Object.keys(applied);
  if (keys.length !== Object.keys(originals).length) return false;
  return keys.every((name) => {
    const digest = applied[name];
    const original = originals[name];
    return (
      Object.hasOwn(originals, name) &&
      typeof digest === 'string' &&
      /^[0-9a-f]{64}$/.test(digest) &&
      (typeof original === 'string' || original === null)
    );
  });
}

export class Agent {
  constructor(workspaces, runner, provider, { taskStore = new TaskStore() } = {}) {
    this.workspaces = workspaces;
    this.runner = runner;
    this.provider = provider;
    this.taskStore = taskStore;
  }
  taskPath(ws, key) {
    return this.taskStore.file(ws, key);
  }
  async read(ws, key) {
    return this.taskStore.read(ws, key);
  }
  async save(ws, task) {
    await this.taskStore.save(ws, task);
  }
  // Read-only startup/restart reconciliation. Never restore bytes automatically.
  async recovery(ws, { activeApply = false } = {}) {
    const base = path.dirname(ws.root);
    const entries = (await fs.readdir(base, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^task-[0-9a-f-]{36}\.json$/.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    const limit = 200;
    const head = (await git(ws.root, ['rev-parse', 'HEAD'])).trim();
    const tasks = [];
    for (const entry of entries.slice(0, limit)) {
      const key = entry.name.slice(5, -5);
      let record;
      try {
        const p = path.join(base, entry.name);
        const st = await fs.lstat(p);
        if (!st.isFile() || st.nlink !== 1 || st.size > this.taskStore.limits.recordBytes)
          throw new Error('Invalid task record');
        record = JSON.parse(await fs.readFile(p, 'utf8'));
        if (record.id !== key || typeof record.state !== 'string')
          throw new Error('Invalid task identity');
      } catch {
        tasks.push({
          id: key,
          state: 'unreadable',
          finding: 'record_needs_manual_review',
          canAttemptRollback: false,
        });
        continue;
      }
      if (!['applying', 'needs_review'].includes(record.state)) continue;
      const files = [];
      const applied = record.applied;
      const appliedIsMap = applied && typeof applied === 'object' && !Array.isArray(applied);
      const pairs = appliedIsMap ? Object.entries(applied) : [];
      let exact = matchesRollbackTargets(applied, record.originals);
      if (pairs.length === 0 || pairs.length > 100) exact = false;
      for (const [name, digest] of pairs.slice(0, 100)) {
        let result = 'changed_or_unavailable';
        if (typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest)) {
          try {
            const p = await safePath(ws.root, name);
            const current = await fs.readFile(p);
            result = hash(current) === digest ? 'task_bytes_present' : 'changed_or_unavailable';
          } catch {
            // An absent, linked or protected path cannot be restored automatically.
          }
        }
        if (result !== 'task_bytes_present') exact = false;
        files.push({ path: name, finding: result });
      }
      if (pairs.length === 0) exact = false;
      const headMatches = record.head === head;
      const isActive = record.state === 'applying' && activeApply;
      const canAttemptRollback = Boolean(exact && headMatches && !isActive);
      tasks.push({
        id: key,
        state: record.state,
        finding: isActive
          ? 'possibly_running_in_this_session'
          : canAttemptRollback
            ? 'guarded_rollback_candidate'
            : 'manual_review_required',
        headMatches,
        canAttemptRollback,
        files,
      });
    }
    return {
      scanned: Math.min(entries.length, limit),
      truncated: entries.length > limit,
      tasks,
      note: 'Read-only inventory. Inspect the original Git diff and task record before requesting a guarded rollback. No changes or container cleanup are performed.',
    };
  }
  async propose(ws, objective, { signal, shareSource = false } = {}) {
    boundedString(objective, 'Objective', 4000);
    if (this.runner.apps.has(ws.id))
      throw new Fault('Stop the application before requesting AI edits.', 409);
    if (!shareSource)
      throw new Fault(
        'Review the context and explicitly authorise sharing it with the configured model.',
      );
    await this.taskStore.admit(ws);
    const inspection = await this.workspaces.inspect(ws);
    if (inspection.status.trim())
      throw new Fault('Commit or export your existing changes before starting an AI task.', 409);
    const fingerprint = await this.workspaces.fingerprint(ws);
    await this.workspaces.ledger(ws).append('agent.started', {
      objective,
      head: inspection.head,
      filesInspected: inspection.context.map((f) => f.path),
      provider: this.provider.info(),
    });
    const proposal = await this.provider.propose(objective, inspection.context, { signal });
    validateProposal(proposal);
    const task = {
      id: id(),
      objective,
      state: 'proposed',
      fingerprint,
      head: inspection.head,
      proposal,
      attempts: [],
      usage: [proposal.usage],
      originals: {},
      applied: {},
      createdAt: new Date().toISOString(),
    };
    await this.save(ws, task);
    await this.workspaces.ledger(ws).append('agent.proposed', {
      task: task.id,
      plan: proposal.plan,
      files: proposal.files.map((f) => f.path),
      usage: proposal.usage,
    });
    return task;
  }
  async applyFiles(ws, task, proposal) {
    // Validate the entire edit set before touching disk.
    validateProposal(proposal);
    for (const f of proposal.files) await safePath(ws.root, f.path);
    const originals = { ...task.originals };
    for (const f of proposal.files) {
      const p = await safePath(ws.root, f.path);
      if (!Object.hasOwn(originals, f.path)) {
        const stat = await fs.lstat(p).catch((e) => {
          if (e.code === 'ENOENT') return null;
          throw e;
        });
        if (stat && (!stat.isFile() || stat.size > 256 * 1024))
          throw new Fault(
            'AI recovery supports original source files up to 256 KiB. No proposal files were written.',
          );
        originals[f.path] = await fs.readFile(p, 'utf8').catch((e) => {
          if (e.code === 'ENOENT') return null;
          throw e;
        });
      }
    }
    if (
      Object.values(originals).reduce(
        (bytes, content) => bytes + Buffer.byteLength(content || ''),
        0,
      ) >
      512 * 1024
    )
      throw new Fault(
        'The original files exceed the 512 KiB task recovery budget. No proposal files were written.',
      );
    task.originals = originals;
    for (const f of proposal.files) {
      const p = await safePath(ws.root, f.path);
      // Persist recovery state before each write. Recovery refuses mismatched bytes.
      task.applied[f.path] = hash(f.content);
      await this.save(ws, task);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, f.content);
    }
  }
  async rollback(ws, task) {
    // Fail closed if a stored task declares extra or malformed restoration targets.
    // Recovery review is advisory: rollback must enforce the same boundary itself.
    if (!matchesRollbackTargets(task.applied, task.originals)) {
      throw new Fault(
        'Rollback paused: task record contains invalid or unmatched restoration targets.',
        409,
      );
    }
    if ((await git(ws.root, ['rev-parse', 'HEAD'])).trim() !== task.head)
      throw new Fault(
        'Git history changed after this task. Use ordinary Git review/revert to preserve later commits.',
        409,
      );
    for (const [name, digest] of Object.entries(task.applied)) {
      const p = await safePath(ws.root, name),
        current = await fs.readFile(p).catch((e) => {
          if (e.code === 'ENOENT') return null;
          throw e;
        });
      if (!current || hash(current) !== digest)
        throw new Fault(
          'Rollback paused: ' +
            name +
            ' changed outside this task. Export and review it; no files were restored.',
          409,
        );
    }
    for (const [name, content] of Object.entries(task.originals)) {
      const p = await safePath(ws.root, name);
      if (content === null) await fs.rm(p, { force: true });
      else await fs.writeFile(p, content);
    }
    task.state = 'rolled_back';
    await this.save(ws, task);
    await this.workspaces
      .ledger(ws)
      .append('agent.rolled_back', { task: task.id, files: Object.keys(task.applied) });
    return task;
  }
  async apply(ws, key, { repairAttempts = 0, signal } = {}) {
    const task = await this.read(ws, key);
    if (task.state !== 'proposed')
      throw new Fault('This proposal has already been applied or cancelled.', 409);
    if (!Number.isInteger(repairAttempts) || repairAttempts < 0 || repairAttempts > 2)
      throw new Fault('Repair attempts must be between zero and two.');
    if (!ws.test) throw new Fault('Configure a real test command before applying AI edits.');
    if (this.runner.apps.has(ws.id))
      throw new Fault('Stop the application before applying edits.', 409);
    if ((await this.workspaces.fingerprint(ws)) !== task.fingerprint)
      throw new Fault('The repository changed after this proposal. Request a new proposal.', 409);
    await this.taskStore.admit(ws, task.id);
    task.state = 'applying';
    await this.save(ws, task);
    let proposal = task.proposal;
    const failures = new Set();
    try {
      for (let attempt = 0; attempt <= repairAttempts; attempt++) {
        if (signal?.aborted) throw new Fault('Task cancelled.');
        await this.applyFiles(ws, task, proposal);
        const result = await this.runner.execute(ws, ws.test, { signal });
        task.attempts.push({
          attempt,
          files: proposal.files.map((f) => f.path),
          command: ws.test,
          ...result,
          output: result.output.slice(0, 64000),
          outputStoredTruncated: result.output.length > 64000,
        });
        await this.save(ws, task);
        await this.workspaces
          .ledger(ws)
          .append('agent.tested', { task: task.id, ...task.attempts.at(-1) });
        if (result.code === 0 && !result.cancelled && !result.timedOut && !result.truncated) {
          // A test suite can itself write files; such writes remain visible in the diff.
          task.state = 'verified';
          const diff = await git(ws.root, [
            'diff',
            '--no-ext-diff',
            '--no-textconv',
            'HEAD',
            '--',
            '.',
          ]);
          task.diff = diff.slice(0, 64000);
          task.diffStoredTruncated = diff.length > 64000;
          task.verification = {
            tests: 'PASS',
            build: 'NOT_RUN',
            security: 'HEURISTIC_ONLY',
            preview: 'UNVERIFIED',
            deployment: 'NOT_RUN',
          };
          await this.save(ws, task);
          return task;
        }
        const signature = hash(result.output);
        if (failures.has(signature) || attempt === repairAttempts || signal?.aborted) break;
        failures.add(signature);
        // Tests may have modified proposed files. Never overwrite those changes.
        for (const [name, digest] of Object.entries(task.applied))
          if (hash(await fs.readFile(await safePath(ws.root, name))) !== digest)
            throw new Fault('Tests changed ' + name + '. Automatic repair stopped.', 409);
        const context = (await this.workspaces.inspect(ws)).context;
        proposal = await this.provider.propose(task.objective, context, {
          signal,
          failure: result.output.slice(-12000),
        });
        validateProposal(proposal);
        task.usage.push(proposal.usage);
        await this.workspaces.ledger(ws).append('agent.repair_proposed', {
          task: task.id,
          plan: proposal.plan,
          files: proposal.files.map((f) => f.path),
          usage: proposal.usage,
        });
      }
      task.verification = {
        tests: 'FAIL',
        build: 'NOT_RUN',
        security: 'HEURISTIC_ONLY',
        preview: 'UNVERIFIED',
        deployment: 'NOT_RUN',
      };
      await this.rollback(ws, task);
      return task;
    } catch (e) {
      task.error = e.message;
      try {
        await this.rollback(ws, task);
      } catch (recovery) {
        task.state = 'needs_review';
        task.recoveryError = recovery.message;
        await this.save(ws, task);
      }
      await this.workspaces
        .ledger(ws)
        .append('agent.failed', { task: task.id, error: e.message, state: task.state });
      throw e;
    }
  }
}
