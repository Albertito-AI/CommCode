// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process';
import { Fault, redact } from './security.mjs';

export function run(
  bin,
  args,
  { cwd, env = {}, timeout = 120000, limit = 1024 * 1024, signal, secrets = [] } = {},
) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(bin, args, {
      cwd,
      env: { PATH: process.env.PATH, LANG: 'C.UTF-8', ...env },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      bytes = 0,
      timedOut = false,
      truncated = false;
    const kill = () => {
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeout);
    const abort = () => kill();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) kill();
    const collect = (data) => {
      bytes += data.length;
      if (bytes <= limit) output += data.toString();
      else {
        truncated = true;
        kill();
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', (e) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new Fault(`Cannot start ${bin}: ${e.code}. Check the installation guide.`, 503));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve({
        code: code ?? -1,
        output: redact(output, secrets),
        timedOut,
        truncated,
        cancelled: Boolean(signal?.aborted),
        durationMs: Date.now() - start,
      });
    });
  });
}

export async function git(root, args, options = {}) {
  const { env: extraEnv = {}, ...runOptions } = options;
  const networkEnv = {};
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy',
    'SSL_CERT_FILE',
    'GIT_SSL_CAINFO',
  ]) {
    if (process.env[name]) networkEnv[name] = process.env[name];
  }
  const result = await run(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'credential.helper=',
      '-c',
      'protocol.file.allow=never',
      '-c',
      'protocol.ext.allow=never',
      '-c',
      'core.pager=cat',
      ...args,
    ],
    {
      cwd: root,
      env: {
        ...networkEnv,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_NAME: 'CommCode User',
        GIT_AUTHOR_EMAIL: 'user@localhost',
        GIT_COMMITTER_NAME: 'CommCode User',
        GIT_COMMITTER_EMAIL: 'user@localhost',
        ...extraEnv,
      },
      ...runOptions,
    },
  );
  if (result.code !== 0)
    throw new Fault(`Git operation failed: ${result.output.trim().slice(0, 2000)}`, 409);
  return result.output;
}
