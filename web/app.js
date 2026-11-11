// SPDX-License-Identifier: AGPL-3.0-or-later
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('commcode-token') || '',
  workspaces = [],
  ws = null,
  file = null,
  editor = null,
  dirty = false,
  task = null,
  job = null;
let noticeTimer;
function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($('notice').hidden = true), 9000);
}
function show(title, value) {
  $('viewer-actions').replaceChildren();
  $('viewer-title').textContent = title;
  $('viewer-content').textContent =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  $('viewer').showModal();
}
async function api(route, body) {
  const r = await fetch('/api/' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || 'Request failed');
  return data;
}
const base = () => {
  if (!ws) throw Error('Create or select a workspace first.');
  return 'workspaces/' + ws.id + '/';
};
const action = (id, fn) =>
  $(id).addEventListener('click', () =>
    Promise.resolve()
      .then(fn)
      .catch((e) => notice(e.message)),
  );
function markDirty() {
  dirty = true;
  $('dirty').textContent = ' · unsaved';
}
async function loadFile(name) {
  if (dirty && !confirm('Discard unsaved editor changes?')) return;
  file = await api(base() + 'file?path=' + encodeURIComponent(name));
  editor?.destroy();
  $('editor').replaceChildren();
  try {
    const { createEditor } = await import('/editor.js');
    editor = createEditor($('editor'), file.content, name, markDirty);
  } catch {
    const area = document.createElement('textarea');
    area.id = 'fallback';
    area.setAttribute('aria-label', 'Source code');
    area.value = file.content;
    area.spellcheck = false;
    area.addEventListener('input', markDirty);
    $('editor').append(area);
    editor = { get: () => area.value, destroy: () => area.remove() };
  }
  dirty = false;
  $('dirty').textContent = '';
  $('filename').textContent = name;
  for (const b of $('files').querySelectorAll('button'))
    b.classList.toggle('active', b.textContent === name);
}
async function refresh() {
  if (!ws) return;
  const info = await api(base() + 'inspect');
  $('files').replaceChildren();
  for (const name of info.files) {
    const b = document.createElement('button');
    b.textContent = name;
    b.className = name === file?.path ? 'active' : '';
    b.onclick = () => loadFile(name).catch((e) => notice(e.message));
    $('files').append(b);
  }
  return info;
}
async function selectWorkspace(key) {
  if (dirty && !confirm('Discard unsaved editor changes?')) {
    $('workspace').value = ws?.id || '';
    return;
  }
  ws = workspaces.find((w) => w.id === key);
  file = null;
  task = null;
  dirty = false;
  $('proposal').hidden = true;
  $('preview').hidden = true;
  $('preview').removeAttribute('src');
  $('preview-empty').hidden = false;
  $('preview-status').textContent = 'Not running';
  if (!ws) return;
  for (const k of ['test', 'start', 'install']) $(k + '-command').value = ws[k] || '';
  const info = await refresh();
  if (info.files[0]) await loadFile(info.files.find((n) => n === 'index.html') || info.files[0]);
}
async function listWorkspaces(selected) {
  workspaces = await api('workspaces');
  $('workspace').replaceChildren();
  if (!workspaces.length) {
    const o = new Option('Create your first workspace', '');
    $('workspace').add(o);
  }
  for (const w of workspaces) $('workspace').add(new Option(w.name, w.id));
  if (selected) $('workspace').value = selected;
  await selectWorkspace($('workspace').value);
}
async function unlock() {
  const status = await api('status');
  $('login').hidden = true;
  $('workbench').hidden = false;
  $('runtime').textContent =
    (status.runtime.available ? '● Runtime ready · ' : '○ Runtime unavailable · ') +
    status.runtime.isolation;
  $('provider').textContent = status.provider.enabled
    ? `${status.provider.kind} · ${status.provider.model} · ${status.provider.endpoint}. Up to 3 calls per task; costs depend on your provider.`
    : 'AI is off. Configure a local Ollama model or compatible provider to enable it.';
  $('propose').disabled = !status.provider.enabled;
  await listWorkspaces();
}
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  token = $('token').value.trim();
  try {
    await unlock();
    sessionStorage.setItem('commcode-token', token);
    $('token').value = '';
  } catch (err) {
    notice(err.message);
  }
});
action('signout', () => {
  sessionStorage.removeItem('commcode-token');
  location.reload();
});
$('template').onchange = () => {
  const show = $('template').value === 'github';
  $('repo-url').hidden = !show;
  $('repo-label').hidden = !show;
  $('repo-url').required = show;
};
action('new-toggle', () => {
  $('create-form').hidden = !$('create-form').hidden;
  if (!$('create-form').hidden) $('project-name').focus();
});
$('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  try {
    const w = await api('workspaces', {
      name: $('project-name').value,
      template: $('template').value,
      url: $('template').value === 'github' ? $('repo-url').value : undefined,
    });
    await listWorkspaces(w.id);
    $('create-form').hidden = true;
    notice('Workspace created with an ordinary Git repository.');
  } catch (err) {
    notice(err.message);
  } finally {
    button.disabled = false;
  }
});
$('workspace').onchange = () =>
  selectWorkspace($('workspace').value).catch((e) => notice(e.message));
async function save() {
  if (!file || !editor) throw Error('Open a file first.');
  const r = await api(base() + 'file', { path: file.path, content: editor.get(), etag: file.etag });
  file.etag = r.etag;
  dirty = false;
  $('dirty').textContent = '';
  notice('Saved.');
  await refresh();
}
action('save', save);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    save().catch((err) => notice(err.message));
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
action('new-file', async () => {
  const name = prompt('Relative source-file path, for example src/example.js');
  if (!name) return;
  await api(base() + 'file', { path: name, content: '', etag: null });
  await refresh();
  await loadFile(name);
});
async function waitJob(start) {
  if (job) throw Error('Wait for the current job to finish.');
  job = start.id;
  $('cancel').hidden = false;
  $('job-status').textContent = 'Running…';
  try {
    for (;;) {
      const r = await api('jobs/' + job);
      if (r.state === 'done') {
        return r.result;
      }
      if (r.state === 'failed') throw Error(r.error);
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    job = null;
    $('cancel').hidden = true;
    $('job-status').textContent = 'Ready';
  }
}
async function command(action, body = {}) {
  if (dirty) throw Error('Save editor changes before running a command.');
  if (job) throw Error('A job is already running.');
  const result = await waitJob(await api(base() + action, body));
  $('output').textContent = result.output || JSON.stringify(result, null, 2);
  $('job-status').textContent =
    result.code === 0
      ? 'Command passed'
      : result.code === undefined
        ? 'Complete'
        : 'Command failed';
  await refresh();
  return result;
}
action('test', () => command('test'));
$('command-form').addEventListener('submit', (e) => {
  e.preventDefault();
  command('command', { command: $('command').value }).catch((err) => notice(err.message));
});
action('cancel', async () => {
  if (job) {
    await api('jobs/' + job + '/cancel', {});
    notice('Cancellation requested.');
  }
});
action('configure', async () => {
  const config = {};
  for (const k of ['test', 'start', 'install']) config[k] = $(k + '-command').value;
  await api(base() + 'configure', config);
  Object.assign(ws, config);
  notice('Commands saved.');
});
action('install', async () => {
  if (
    confirm(
      'Allow this workspace to download and execute dependency installation scripts with outbound network access?',
    )
  )
    await command('install', { network: true });
});
action('start', async () => {
  if (job) throw Error('Wait for the current job.');
  if (dirty) throw Error('Save editor changes first.');
  const result = await waitJob(await api(base() + 'start', {}));
  $('output').textContent = JSON.stringify(result, null, 2);
  $('preview-status').textContent = result.verified ? 'HTTP response verified' : 'Not verified';
  $('preview-empty').hidden = true;
  $('preview').hidden = false;
  $('preview').src = result.url;
});
action('stop', async () => {
  await api(base() + 'stop', {});
  $('preview').removeAttribute('src');
  $('preview').hidden = true;
  $('preview-empty').hidden = false;
  $('preview-status').textContent = 'Stopped';
  notice('Application stopped.');
});
action('diff', async () => {
  const r = await api(base() + 'inspect');
  show(
    'Git state and diff',
    r.status +
      '\n' +
      r.diff +
      '\nNew untracked files appear in status; review their full contents in the editor.',
  );
});
action('commit', async () => {
  if (dirty) throw Error('Save editor changes first.');
  const message = prompt('Commit message. Review the Git diff before committing.');
  if (message) {
    const r = await api(base() + 'commit', { message });
    notice('Commit created: ' + r.sha.slice(0, 12));
    await refresh();
  }
});
action('ledger', async () => {
  const r = await api(base() + 'ledger');
  show('Activity ledger · chain ' + (r.valid ? 'valid' : 'INVALID'), r.events);
});
async function reviewRecovery() {
  const route = base();
  const [tasks, storage, containers] = await Promise.all([
    api(route + 'recovery'),
    api(route + 'storage').catch((error) => ({ error: error.message })),
    api(route + 'resources').catch((error) => ({ available: false, error: error.message })),
  ]);
  show('Recovery review', { tasks, storage, containers });
  for (const resource of containers.resources || []) {
    if (!resource.cleanupAllowed) continue;
    const button = document.createElement('button');
    button.className = 'secondary';
    button.textContent = 'Clean reviewed container ' + resource.id.slice(0, 12);
    button.addEventListener('click', async () => {
      if (
        !confirm(
          'Stop and remove this prior-instance container?\n' +
            resource.id +
            '\nReview its running state above first. Workspace files will be retained.',
        )
      )
        return;
      button.disabled = true;
      try {
        await api(route + 'cleanup-container', { container: resource.id, confirm: true });
        notice('Reviewed container removed. Workspace files retained.');
        await reviewRecovery();
      } catch (error) {
        button.disabled = false;
        notice(error.message);
      }
    });
    $('viewer-actions').append(button);
  }
  if (tasks.truncated)
    notice('Recovery inventory truncated: inspect the workspace state separately.');
  else if (tasks.tasks.length) notice('Interrupted or unreadable task records need human review.');
}
action('recovery', reviewRecovery);
action('context', async () => {
  const r = await api(base() + 'context');
  show('Exact source context eligible for the next model request', r);
});
function showTask(t) {
  task = t;
  $('proposal').hidden = false;
  $('plan').replaceChildren();
  const list = document.createElement('ol');
  for (const step of t.proposal.plan) {
    const li = document.createElement('li');
    li.textContent = step;
    list.append(li);
  }
  $('plan').append(list);
  const p = document.createElement('p');
  p.textContent = t.proposal.explanation;
  $('plan').append(p);
  $('proposed-files').textContent = t.proposal.files
    .map((f) => 'FILE: ' + f.path + '\n' + f.content)
    .join('\n\n');
  $('apply').disabled = t.state !== 'proposed';
  $('rollback').disabled = !['verified', 'needs_review'].includes(t.state);
}
action('propose', async () => {
  if (job) throw Error('Wait for the current job.');
  if (dirty) throw Error('Save and commit existing changes first.');
  if (!$('share-source').checked)
    throw Error('Review the context and authorise sharing it with your model.');
  const r = await waitJob(
    await api(base() + 'propose', { objective: $('objective').value, shareSource: true }),
  );
  showTask(r);
  notice('Proposal ready. Review the files before applying.');
});
action('apply', async () => {
  if (!task) throw Error('Request a proposal first.');
  if (job) throw Error('Wait for the current job.');
  const r = await waitJob(
    await api(base() + 'apply', { task: task.id, repairAttempts: Number($('repairs').value) }),
  );
  showTask(r);
  $('output').textContent = JSON.stringify(
    { state: r.state, verification: r.verification, attempts: r.attempts, usage: r.usage },
    null,
    2,
  );
  await refresh();
  if (file) {
    dirty = false;
    await loadFile(file.path);
  }
  notice(
    r.state === 'verified'
      ? 'Configured tests passed. Review the diff before committing.'
      : 'Task failed its tests; inspect the recovery result.',
  );
});
action('rollback', async () => {
  if (
    task &&
    confirm(
      'Restore the files changed by this task? This stops if those files have changed since the task.',
    )
  ) {
    showTask(await api(base() + 'rollback', { task: task.id }));
    await refresh();
    if (file) {
      dirty = false;
      await loadFile(file.path);
    }
  }
});
action('export', async () => {
  const r = await fetch('/api/' + base() + 'export', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw Error((await r.json()).error);
  const url = URL.createObjectURL(await r.blob()),
    a = document.createElement('a');
  a.href = url;
  a.download = 'commcode-project.bundle';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Exported committed history. Uncommitted editor changes are not included.');
});
action('github-create', async () => {
  const name = prompt(
    'Create a PUBLIC repository in your connected GitHub account. Repository name:',
  );
  if (name) {
    const r = await api(base() + 'github/create', { name });
    ws.remote = r.url;
    show('GitHub repository created', r);
  }
});
action('github-push', async () => {
  if (confirm('Push committed history to this workspace’s GitHub repository?'))
    show('GitHub push', await api(base() + 'github/push', {}));
});
action('close-viewer', () => $('viewer').close());
setInterval(async () => {
  if (ws && !$('preview').hidden) {
    try {
      const r = await api(base() + 'logs');
      if (r.output) $('output').textContent = r.output;
      if (!r.running) $('preview-status').textContent = 'Process stopped';
    } catch {}
  }
}, 4000);
if (token)
  unlock().catch(() => {
    sessionStorage.removeItem('commcode-token');
    token = '';
  });
