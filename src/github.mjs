// SPDX-License-Identifier: AGPL-3.0-or-later
import { Fault, githubURL, atomicJSON } from './security.mjs';
import { git } from './process.mjs';
import path from 'node:path';

export class GitHub {
  constructor(token = process.env.COMMCODE_GITHUB_TOKEN) {
    this.token = token;
  }
  async request(route, body) {
    if (!this.token)
      throw new Fault(
        'Set COMMCODE_GITHUB_TOKEN on the server to create repositories or push. Public import does not require it.',
        503,
      );
    const response = await fetch('https://api.github.com' + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + this.token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Fault(
        `GitHub returned HTTP ${response.status}. Check token permissions and repository availability.`,
        502,
      );
    }
    return response.json();
  }
  async create(ws, name, workspaces) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(name))
      throw new Fault('Use a valid repository name.');
    if (ws.remote) throw new Fault('This workspace already has a remote.', 409);
    const remote = await this.request('/user/repos', {
      name,
      private: false,
      description: 'Created with CommCode. Ordinary, user-owned source code.',
      auto_init: false,
    });
    githubURL(remote.clone_url);
    await git(ws.root, ['remote', 'add', 'origin', remote.clone_url]);
    ws.remote = remote.clone_url;
    const { root, ...data } = ws;
    await atomicJSON(path.join(path.dirname(root), 'workspace.json'), data);
    await workspaces.ledger(ws).append('github.created', { url: remote.html_url });
    return { url: remote.html_url };
  }
  async push(ws, workspaces) {
    if (!this.token) throw new Fault('COMMCODE_GITHUB_TOKEN is not configured.', 503);
    githubURL(ws.remote);
    if ((await git(ws.root, ['status', '--porcelain'])).trim())
      throw new Fault('Commit local changes before pushing.', 409);
    const branch = (await git(ws.root, ['branch', '--show-current'])).trim();
    if (!branch) throw new Fault('Select a branch before pushing.');
    const header =
      'Authorization: Basic ' + Buffer.from('x-access-token:' + this.token).toString('base64');
    const result = await git(ws.root, ['push', '--', ws.remote, `HEAD:refs/heads/${branch}`], {
      env: {
        PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
        GIT_CONFIG_VALUE_0: header,
      },
      secrets: [this.token, header, header.slice(21)],
    });
    await workspaces.ledger(ws).append('github.pushed', { remote: ws.remote, branch });
    return { output: result, branch };
  }
}
