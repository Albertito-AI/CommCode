# Architecture

CommCode uses a Node.js modular monolith. The control plane has no runtime npm
dependencies. CodeMirror and its language packages are bundled locally during the
build. No application assets depend on a third-party CDN.

## Modules and boundaries

| Module           | Responsibility                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `server.mjs`     | Authenticated API, asynchronous jobs, HTTP host/origin checks and separate preview routing |
| `workspaces.mjs` | Managed repository roots, optimistic file writes, repository inspection, locks and commits |
| `runner.mjs`     | Explicit Docker or trusted-local process execution, limits, application lifecycle and logs |
| `providers.mjs`  | Fixed operator-configured model endpoints, structured responses and edit validation        |
| `agent.mjs`      | Clean-tree checkpoint, proposals, test loop, bounded repair and conflict-aware recovery    |
| `github.mjs`     | Public repository creation and non-forced HTTPS push using an operator credential          |
| `ledger.mjs`     | JSONL activity events with a hash chain and known-secret redaction                         |
| `security.mjs`   | Path validation, file bounds, token comparison and heuristic secret recognition            |

## State

`COMMCODE_HOME` defaults to `.commcode` in the launch directory. Each workspace has
`workspace.json`, a normal `repo/` directory, `events.jsonl`, and separate
`task-UUID.json` files. Tasks preserve original file contents for rollback. This
state can contain confidential source code and objectives; protect and back it up
as carefully as the repository. There is no cloud database or hidden hosted memory.
JSON is written through temporary files and rename. The initial schema is implicit
version 1; a future change to persisted shapes requires an explicit migration.

One application instance owns each data directory. In-process workspace locks do
not coordinate independent server processes. Do not share a state directory across
instances. An external editor can still race a file operation; optimistic checks
reduce accidental overwrites but do not create a hostile-user filesystem boundary.

## AI transaction

A proposal captures HEAD and a fingerprint of inspectable source. The user reviews
context and authorises provider transmission, then reviews proposed files. Apply
refuses a changed fingerprint, writes recovery data, applies edits and executes the
user-configured test command. Up to two additional repair calls can be authorised.
Repeated identical failure output stops the loop. Failure restores only task-owned
files if their bytes still match the task. Otherwise the task is marked for review.

Tests can modify files and can be inadequate. A passing exit status records only
that the configured command passed. Build, deployment and browser verification
remain separate states. Model-generated test changes need particular scrutiny.
No model-provided command is executed automatically. The API never grants the model
GitHub credentials, arbitrary endpoints or deployment authority.

## Preview

A second loopback server routes a random capability path to a registered runtime
port. In Docker mode that port belongs to a host relay using fixed docker exec
HTTP transport to container loopback; the container uses network=none. It accepts GET/HEAD, rejects redirects, limits response size and does not
forward cookies or authentication headers. An opaque-origin iframe sandbox isolates
application JavaScript from the workbench. Capabilities expire on stop/restart and
are kept out of the activity ledger. They remain visible to the local operator.
Absolute URLs, WebSockets and general web-app backends require a more capable
future preview gateway.
