// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import { id, atomicJSON, safePath, hash, Fault, boundedString } from './security.mjs';
import { git } from './process.mjs';
import { validateProposal } from './providers.mjs';

export class Agent {
  constructor(workspaces, runner, provider) {
    this.workspaces = workspaces;
    this.runner = runner;
    this.provider = provider;
  }
  taskPath(ws, key) {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new Fault('Unknown task.', 404);
    return path.join(path.dirname(ws.root), 'task-' + key + '.json');
  }
  async read(ws, key) {
    try {
      return JSON.parse(await fs.readFile(this.taskPath(ws, key), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') throw new Fault('Unknown task.', 404);
      throw e;
    }
  }
  async save(ws, task) {
    await atomicJSON(this.taskPath(ws, task.id), task);
  }
  async propose(ws, objective, { signal, shareSource = false } = {}) {
    boundedString(objective, 'Objective', 4000);
    if (this.runner.apps.has(ws.id))
      throw new Fault('Stop the application before requesting AI edits.', 409);
    if (!shareSource)
      throw new Fault(
        'Review the context and explicitly authorise sharing it with the configured model.',
      );
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
    for (const f of proposal.files) {
      const p = await safePath(ws.root, f.path);
      if (!(f.path in task.originals))
        task.originals[f.path] = await fs.readFile(p, 'utf8').catch((e) => {
          if (e.code === 'ENOENT') return null;
          throw e;
        });
      // Persist recovery state before each write. Recovery refuses mismatched bytes.
      task.applied[f.path] = hash(f.content);
      await this.save(ws, task);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, f.content);
    }
  }
  async rollback(ws, task) {
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
        });
        await this.save(ws, task);
        await this.workspaces
          .ledger(ws)
          .append('agent.tested', { task: task.id, ...task.attempts.at(-1) });
        if (result.code === 0 && !result.cancelled && !result.timedOut && !result.truncated) {
          // A test suite can itself write files; such writes remain visible in the diff.
          task.state = 'verified';
          task.diff = await git(ws.root, [
            'diff',
            '--no-ext-diff',
            '--no-textconv',
            'HEAD',
            '--',
            '.',
          ]);
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
