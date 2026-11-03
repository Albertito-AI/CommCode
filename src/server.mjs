// SPDX-License-Identifier: AGPL-3.0-or-later
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workspaces } from './workspaces.mjs';
import { Runner } from './runner.mjs';
import { Provider } from './providers.mjs';
import { Agent } from './agent.mjs';
import { GitHub } from './github.mjs';
import {
  Fault,
  token as makeToken,
  constantEqual,
  boundedString,
  redact,
  id,
} from './security.mjs';
import { git } from './process.mjs';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new Fault('Requests require application/json.', 415);
  let size = 0,
    text = '';
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 512 * 1024) throw new Fault('Request exceeds 512 KiB.', 413);
    text += chunk;
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Fault('Request contains invalid JSON.');
  }
}
function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

export async function createApp({
  root,
  token,
  mode = 'docker',
  provider = new Provider(),
  github = new GitHub(),
  port = 4317,
  previewPort = 4318,
} = {}) {
  if (!token || token.length < 32)
    throw new Fault('Use an authentication token of at least 32 characters.');
  const secrets = [token, provider.key, github.token].filter(Boolean);
  const workspaces = new Workspaces(path.join(root, 'workspaces'), secrets);
  await workspaces.init();
  const runner = new Runner({ mode, secrets }),
    agent = new Agent(workspaces, runner, provider),
    jobs = new Map(),
    capabilities = new Map();
  let mainOrigin, previewOrigin;
  function startJob(ws, type, fn) {
    const key = id(),
      controller = new AbortController();
    const job = {
      id: key,
      workspace: ws.id,
      type,
      state: 'running',
      startedAt: new Date().toISOString(),
      controller,
    };
    jobs.set(key, job);
    workspaces
      .exclusive(ws, () => fn(controller.signal))
      .then((result) => {
        job.state = 'done';
        job.result = result;
      })
      .catch((e) => {
        job.state = 'failed';
        job.error = redact(e.message, secrets);
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
        if (jobs.size > 100) {
          for (const [k, j] of jobs) {
            if (j.state !== 'running') {
              jobs.delete(k);
              break;
            }
          }
        }
      });
    return { id: key, state: job.state };
  }
  const preview = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(previewOrigin).host)
        throw new Fault('Invalid preview host.', 403);
      if (!['GET', 'HEAD'].includes(req.method))
        throw new Fault('Preview only supports GET and HEAD in this release.', 405);
      const url = new URL(req.url, previewOrigin),
        parts = url.pathname.split('/'),
        cap = parts[1],
        wsId = capabilities.get(cap),
        app = runner.apps.get(wsId);
      if (!app) throw new Fault('Preview expired or application stopped.', 404);
      const target = 'http://127.0.0.1:' + app.port + '/' + parts.slice(2).join('/') + url.search;
      const upstream = await fetch(target, {
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel();
        throw new Fault('Preview redirects are disabled in this release.', 502);
      }
      let bytes = 0;
      const chunks = [];
      for await (const chunk of upstream.body) {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) throw new Fault('Preview response exceeds 4 MiB.', 502);
        chunks.push(Buffer.from(chunk));
      }
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "sandbox allow-scripts allow-forms allow-downloads; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors " +
          mainOrigin,
      });
      res.end(req.method === 'HEAD' ? undefined : Buffer.concat(chunks));
    } catch (e) {
      json(
        res,
        { error: e.status ? e.message : 'Preview connection failed. Check application logs.' },
        e.status || 502,
      );
    }
  });
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src ${previewOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
    );
    try {
      if (req.headers.host !== new URL(mainOrigin).host)
        throw new Fault('Invalid host. Open the exact loopback URL printed by the server.', 403);
      if (req.headers.origin && req.headers.origin !== mainOrigin)
        throw new Fault('Cross-origin requests are blocked.', 403);
      const url = new URL(req.url, mainOrigin),
        p = url.pathname;
      if (p === '/healthz' && req.method === 'GET')
        return json(res, { status: 'ok', version: '0.1.0-dev.1' });
      if (!p.startsWith('/api/')) {
        if (
          req.method !== 'GET' ||
          !['/', '/index.html', '/app.js', '/style.css', '/editor.js'].includes(p)
        )
          throw new Fault('Not found.', 404);
        const f = path.join(web, p === '/' ? 'index.html' : p.slice(1));
        const data = await fs.readFile(f).catch(() => {
          throw new Fault('Asset missing. Run npm ci && npm run build.', 503);
        });
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        return res.end(data);
      }
      if (!constantEqual(req.headers.authorization, 'Bearer ' + token))
        throw new Fault('Authentication required. Enter the server access token.', 401);
      if (p === '/api/status' && req.method === 'GET')
        return json(res, {
          runtime: await runner.status(),
          provider: provider.info(),
          githubConfigured: Boolean(github.token),
          mode,
        });
      if (p === '/api/workspaces' && req.method === 'GET')
        return json(
          res,
          (await workspaces.list()).map(({ root, ...w }) => w),
        );
      if (p === '/api/workspaces' && req.method === 'POST') {
        const ws = await workspaces.create(await body(req));
        const { root, ...w } = ws;
        return json(res, w, 201);
      }
      const jobMatch = p.match(/^\/api\/jobs\/([0-9a-f-]{36})(\/cancel)?$/);
      if (jobMatch) {
        const job = jobs.get(jobMatch[1]);
        if (!job) throw new Fault('Unknown job.', 404);
        if (jobMatch[2] && req.method === 'POST') {
          await body(req);
          job.controller.abort();
          return json(res, { cancellationRequested: true });
        }
        if (req.method !== 'GET') throw new Fault('Method not allowed.', 405);
        const { controller, ...data } = job;
        return json(res, data);
      }
      const match = p.match(/^\/api\/workspaces\/([0-9a-f-]{36})\/(.+)$/);
      if (!match) throw new Fault('Not found.', 404);
      const ws = await workspaces.get(match[1]),
        action = match[2];
      if (req.method === 'GET') {
        if (action === 'inspect') {
          const data = await workspaces.inspect(ws);
          return json(res, { ...data, context: undefined });
        }
        if (action === 'context')
          return json(res, {
            files: (await workspaces.inspect(ws)).context,
            provider: provider.info(),
          });
        if (action === 'file')
          return json(res, await workspaces.read(ws, url.searchParams.get('path')));
        if (action === 'logs') return json(res, await runner.logs(ws.id));
        if (action === 'recovery') {
          const activeApply = [...jobs.values()].some(
            (job) => job.workspace === ws.id && job.type === 'apply' && job.state === 'running',
          );
          return json(res, await agent.recovery(ws, { activeApply }));
        }
        if (action === 'ledger')
          return json(res, {
            events: await workspaces.ledger(ws).read(),
            valid: await workspaces.ledger(ws).verify(),
          });
        if (action.startsWith('tasks/')) return json(res, await agent.read(ws, action.slice(6)));
        if (action === 'export') {
          // Standard Git bundle includes committed history, portable without CommCode.
          const target = path.join(path.dirname(ws.root), 'export.bundle');
          await workspaces.exclusive(ws, () => git(ws.root, ['bundle', 'create', target, '--all']));
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="commcode-project.bundle"',
            'Cache-Control': 'no-store',
          });
          return res.end(await fs.readFile(target));
        }
        throw new Fault('Not found.', 404);
      }
      if (req.method !== 'POST') throw new Fault('Method not allowed.', 405);
      const data = await body(req);
      if (action === 'stop') {
        await runner.stop(ws.id);
        for (const [cap, key] of capabilities) if (key === ws.id) capabilities.delete(cap);
        return json(res, { running: false });
      }
      if (action === 'command' || action === 'test' || action === 'install') {
        const command =
          action === 'command'
            ? boundedString(data.command, 'Command', 2000)
            : boundedString(ws[action], action + ' command', 2000);
        if (action === 'install' && data.network !== true)
          throw new Fault('Dependency installation requires explicit network access.');
        return json(
          res,
          startJob(ws, action, async (signal) => {
            const result = await runner.execute(ws, command, {
              signal,
              network: data.network === true,
            });
            await workspaces
              .ledger(ws)
              .append('command.executed', { command, network: data.network === true, ...result });
            return result;
          }),
          202,
        );
      }
      if (action === 'propose')
        return json(
          res,
          startJob(ws, 'propose', (signal) =>
            agent.propose(ws, data.objective, { signal, shareSource: data.shareSource === true }),
          ),
          202,
        );
      if (action === 'apply')
        return json(
          res,
          startJob(ws, 'apply', (signal) =>
            agent.apply(ws, data.task, { signal, repairAttempts: data.repairAttempts ?? 0 }),
          ),
          202,
        );
      if (action === 'start') {
        boundedString(ws.start, 'Application start command', 2000);
        return json(
          res,
          startJob(ws, 'start', async () => {
            const result = await runner.start(ws);
            for (const [c, k] of capabilities) if (k === ws.id) capabilities.delete(c);
            const cap = makeToken();
            capabilities.set(cap, ws.id);
            await workspaces.ledger(ws).append('preview.started', result);
            return { ...result, url: previewOrigin + '/' + cap + '/' };
          }),
          202,
        );
      }
      const result = await workspaces.exclusive(ws, async () => {
        if (runner.apps.has(ws.id))
          throw new Fault('Stop the application before changing this workspace.', 409);
        if (action === 'file') return workspaces.write(ws, data);
        if (action === 'configure') return workspaces.configure(ws, data);
        if (action === 'commit') return workspaces.commit(ws, data.message);
        if (action === 'rollback') return agent.rollback(ws, await agent.read(ws, data.task));
        if (action === 'github/create') return github.create(ws, data.name, workspaces);
        if (action === 'github/push') return github.push(ws, workspaces);
        throw new Fault('Not found.', 404);
      });
      return json(res, result);
    } catch (e) {
      json(
        res,
        {
          error: redact(
            e.status
              ? e.message
              : 'Operation failed. Check the input, file permissions and configured services.',
            secrets,
          ),
        },
        e.status || 500,
      );
    }
  });
  server.requestTimeout = 150000;
  server.headersTimeout = 10000;
  server.maxConnections = 64;
  preview.requestTimeout = 15000;
  preview.headersTimeout = 10000;
  preview.maxConnections = 64;
  async function listen(s, p) {
    await new Promise((resolve, reject) => {
      s.once('error', reject);
      s.listen(p, '127.0.0.1', resolve);
    });
    return 'http://127.0.0.1:' + s.address().port;
  }
  previewOrigin = await listen(preview, previewPort);
  try {
    mainOrigin = await listen(server, port);
  } catch (e) {
    preview.close();
    throw e;
  }
  return {
    url: mainOrigin,
    previewUrl: previewOrigin,
    workspaces,
    runner,
    agent,
    jobs,
    async close() {
      for (const j of jobs.values()) j.controller.abort();
      await runner.close();
      await Promise.all([
        new Promise((r) => server.close(r)),
        new Promise((r) => preview.close(r)),
      ]);
    },
  };
}
