// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process';
import { run } from './process.mjs';
import { Fault, id, redact } from './security.mjs';

export class Runner {
  constructor({ mode = 'docker', image = 'commcode-runtime:dev', secrets = [] } = {}) {
    this.mode = mode;
    this.image = image;
    this.secrets = secrets;
    this.apps = new Map();
  }
  async status() {
    if (this.mode === 'process')
      return { available: true, isolation: 'NONE: explicit trusted-local development mode' };
    const r = await run('docker', ['info', '--format', '{{json .SecurityOptions}}'], {
      timeout: 5000,
    }).catch((e) => ({ code: -1, output: e.message }));
    const img =
      r.code === 0
        ? await run('docker', ['image', 'inspect', this.image], { timeout: 5000 })
        : { code: -1 };
    return {
      available: r.code === 0 && img.code === 0,
      isolation: 'Docker containers; shared host kernel, single operator only',
      detail: r.code
        ? r.output
        : img.code
          ? 'Build the runtime image first: npm run setup:runtime'
          : r.output,
    };
  }
  flags(ws, name) {
    return [
      '--name',
      name,
      '--init',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--pids-limit=128',
      '--memory=512m',
      '--cpus=1',
      '--user',
      `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`,
      '--tmpfs',
      '/tmp:rw,nosuid,nodev,size=128m',
      '--mount',
      `type=bind,src=${ws.root},dst=/workspace`,
      '--mount',
      `type=bind,src=${ws.root}/.git,dst=/workspace/.git,readonly`,
      '--workdir',
      '/workspace',
      '--env',
      'HOME=/tmp',
      '--env',
      'PYTHONDONTWRITEBYTECODE=1',
      '--env',
      'PIP_CACHE_DIR=/tmp/pip',
    ];
  }
  async execute(ws, command, { network = false, signal, timeout = 120000 } = {}) {
    if (this.apps.has(ws.id))
      throw new Fault(
        'Stop the application before editing, testing or installing dependencies.',
        409,
      );
    if (this.mode === 'process')
      return run('/bin/sh', ['-lc', command], {
        cwd: ws.root,
        timeout,
        signal,
        secrets: this.secrets,
        env: { HOME: '/tmp', PYTHONDONTWRITEBYTECODE: '1' },
      });
    const name = 'pw-job-' + id();
    try {
      return await run(
        'docker',
        [
          'run',
          '--rm',
          ...this.flags(ws, name),
          '--network',
          network ? 'bridge' : 'none',
          this.image,
          'sh',
          '-lc',
          command,
        ],
        { timeout, signal, secrets: this.secrets },
      );
    } finally {
      await run('docker', ['rm', '-f', name], { timeout: 10000 }).catch(() => {});
    }
  }
  async start(ws) {
    await this.stop(ws.id);
    if (this.mode === 'process') {
      // Trusted fixtures only. Production has no automatic fallback to this adapter.
      const port = await freePort();
      const child = spawn('/bin/sh', ['-lc', ws.start], {
        cwd: ws.root,
        detached: true,
        env: {
          PATH: process.env.PATH,
          HOME: '/tmp',
          PORT: String(port),
          HOST: '127.0.0.1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const app = { port, child, log: '', running: true };
      const collect = (d) => {
        app.log = redact((app.log + d.toString()).slice(-65536), this.secrets);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('exit', () => {
        app.running = false;
      });
      child.on('error', (e) => {
        app.log = e.message;
        app.running = false;
      });
      this.apps.set(ws.id, app);
    } else {
      const name = 'pw-app-' + ws.id,
        network = name + '-net';
      await run('docker', ['rm', '-f', name], { timeout: 10000 });
      await run('docker', ['network', 'rm', network], { timeout: 10000 });
      const net = await run('docker', ['network', 'create', '--internal', network]);
      if (net.code !== 0)
        throw new Fault('Cannot create an isolated preview network: ' + net.output, 503);
      const result = await run('docker', [
        'run',
        '-d',
        ...this.flags(ws, name),
        '--network',
        network,
        '-p',
        '127.0.0.1::8080',
        '-e',
        'PORT=8080',
        '-e',
        'HOST=0.0.0.0',
        this.image,
        'sh',
        '-lc',
        ws.start,
      ]);
      if (result.code !== 0) {
        await run('docker', ['network', 'rm', network]);
        throw new Fault('Application startup failed: ' + result.output, 503);
      }
      const mapping = await run('docker', ['port', name, '8080/tcp']);
      const port = Number(mapping.output.trim().split(':').at(-1));
      if (!Number.isInteger(port) || port < 1024) {
        await run('docker', ['rm', '-f', name]);
        await run('docker', ['network', 'rm', network]);
        throw new Fault('Docker did not return a loopback preview port.', 503);
      }
      this.apps.set(ws.id, { name, network, port, running: true });
    }
    const app = this.apps.get(ws.id);
    for (let n = 0; n < 40; n++) {
      try {
        const r = await fetch(`http://127.0.0.1:${app.port}/`, {
          signal: AbortSignal.timeout(500),
          redirect: 'manual',
        });
        await r.body?.cancel();
        if (r.status >= 200 && r.status < 300)
          return { running: true, verified: true, status: r.status };
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      running: app.running,
      verified: false,
      detail: 'No successful HTTP response within the readiness window. Inspect logs.',
    };
  }
  async logs(wsId) {
    const app = this.apps.get(wsId);
    if (!app) return { running: false, output: '' };
    if (app.child) return { running: app.running, output: app.log };
    const r = await run('docker', ['logs', '--tail', '100', app.name], {
      timeout: 5000,
      secrets: this.secrets,
    });
    const st = await run('docker', ['inspect', '--format', '{{.State.Running}}', app.name], {
      timeout: 5000,
    });
    return { running: st.output.trim() === 'true', output: r.output };
  }
  async stop(wsId) {
    const app = this.apps.get(wsId);
    if (!app) return;
    if (app.child) {
      try {
        process.kill(-app.child.pid, 'SIGKILL');
      } catch {}
    } else {
      await run('docker', ['rm', '-f', app.name]);
      await run('docker', ['network', 'rm', app.network]);
    }
    this.apps.delete(wsId);
  }
  async close() {
    for (const key of [...this.apps.keys()]) await this.stop(key);
  }
}

export async function freePort() {
  const { createServer } = await import('node:net');
  const srv = createServer();
  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', resolve);
  });
  const port = srv.address().port;
  await new Promise((resolve) => srv.close(resolve));
  return port;
}
