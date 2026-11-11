# Interrupted AI task recovery and bounded storage

CommCode now exposes **Recovery review** in a selected workspace and authenticated
`GET /api/workspaces/:id/recovery`. These inspect on-disk `task-*.json` records
left in `applying` or `needs_review` state after a process interruption. Validated
records compare their recorded Git HEAD and each proposed file digest against the
current working tree. `unreadable` records are reported without rendering their
contents. The scan is capped at 200 task records and 100 recorded edited paths per
task. A truncated scan is explicitly marked incomplete.

A `guarded_rollback_candidate` means only that the recorded head and **all**
recorded applied file digests matched at the moment of inspection. It is **not**
a promise that rollback is safe later. The existing explicit rollback operation
rechecks its head and file digests before writing. Review the task record, the
current Git status/diff and subsequent local work first. If any file was not
written, was edited externally or became inaccessible, the inventory requires
manual review and never silently overwrites it. Running tasks in the current
session are identified separately; no restart signal should cancel them.

The task inventory performs no rollback, container deletion, file deletion, model
call or automatic Git operation. Container cleanup below is a separate explicit
action. These checks do not solve filesystem races outside CommCode.
The current application remains **single operator on localhost**, with the
cooperating-server lock and task-history limits below.

## Bounded task history

Each workspace retains at most 200 task records, with an 8 MiB per-record limit
and a 64 MiB total limit. Before contacting a provider or applying a proposal,
the workbench checks that a complete 8 MiB recovery record can fit. A full history
rejects new work and preserves prior records. Updates and guarded rollback remain
available within the record budget; no task is automatically deleted or truncated
to make room. Back up the whole data directory while stopped, inspect completed
records, and manually archive only records no longer needed for recovery.

Original source files used for rollback are bounded to 256 KiB each and 512 KiB
combined per task, checked before any proposed file is written. Stored test-output
and diff excerpts retain at most 64,000 characters with explicit truncation flags.
Inspect the actual Git diff for the complete source change. Recovery inspection
uses the same 8 MiB record limit as the writer, so legitimate records larger than
the earlier 256 KiB scan limit can be reviewed. Failed atomic replacements clean
their own temporary file; files left by an abrupt process kill are retained.

## Workspace application budget

The workspace application budget is 512 MiB, with 16 MiB held back from ordinary
work for recovery metadata. Usage counts logical file bytes throughout the
workspace directory, including the repository, Git objects, dependency trees,
activity records and task files. A scan is limited to 100,000 directory entries.
Symbolic links are counted without following their targets. This is not a count
of allocated filesystem blocks, and linked files can be counted conservatively
more than once.

Normal file saves, command configuration, Git commits, AI admission and edits
check the budget before writes. Commands and repository imports are checked
before and after execution and sampled once per second while running. A detected
overshoot aborts a running command; a short command that finishes between samples
still returns a failed result with `budgetExceeded: true`. Its resulting files
are retained for review. Active previews are checked during the sweep, at most
30 seconds apart. An oversized import is removed only from the new directory
created for that failed import; existing workspaces are not deleted.

This is application enforcement, not a kernel disk quota. A fast command can
overshoot between samples. External writes, background child processes and
concurrent host filesystem changes are outside this boundary. Configure host
filesystem/project quotas for a hard storage ceiling. No automatic source, Git
history, task or activity-log deletion occurs to recover space.

Read-only inspection, stopping applications and guarded rollback do not use the
ordinary-work admission gate. Git export also remains available: it creates a
short-lived bundle in the host temporary directory, removes it after the request,
and requires sufficient host temporary space. A whole-data-directory backup is
still needed for task records and uncommitted files. The 16 MiB reserve is not a
guarantee against external disk exhaustion.

## One cooperating server per data directory

Startup acquires `.server.lock` with exclusive filesystem creation and records
the process, host and instance identity. A second server refuses to start, even
if it chooses other HTTP ports. Clean shutdown removes only its own lock. A killed
process leaves a visible lock and startup refuses to guess whether it is stale.
Stop all users of the directory, inspect the recorded host/process and any orphan
runtime processes, then remove a stale lock manually only after confirming that
none can still write. Process-number reuse and untrusted local users prevent this
from being an automatic recovery certificate. This is not distributed locking or
protection from direct filesystem edits.

## Idle previews and resource ownership

Previews stop after 15 minutes without a request through the preview origin,
checked at most 30 seconds later. Preview requests refresh activity; polling the
logs or status does not keep an otherwise unused application alive. Restart it
explicitly when needed. Source files, tasks and Git history remain intact.
Container names include a new server-instance identity and a unique operation
identifier. Managed containers carry the canonical data-directory ownership hash,
instance identity, workspace identity and kind. Ordinary stop removes only the
tracked resource; a failed removal keeps it tracked unless a successful daemon
inventory confirms that it is already absent. A completed old idle sweep cannot
revoke the capability of a newly restarted application.

Recovery review displays a separate container inventory. Prior-instance cleanup
requires an explicit confirmation for the complete immutable container ID. The
server re-inspects the ID, ownership labels, name and exact workspace bind source
immediately before removal. Current-instance, foreign-owner and mismatched-mount
containers are refused. Legacy unlabelled containers are not automatically
claimed and still require direct operator inspection. Source files are retained;
stopping a container does not prove its previous work was complete or correct.

The same authenticated operations are available as:

- `GET /api/workspaces/:id/storage`: measured bytes, entry count and limits.
- `GET /api/workspaces/:id/resources`: reviewed container identities and eligibility.
- `POST /api/workspaces/:id/cleanup-container` with JSON
  `{"container":"<complete reviewed container ID>","confirm":true}`: recheck and
  remove only that eligible prior-instance container.

All require the existing bearer token; POST also requires `application/json` and
the normal same-origin/host checks. Do not remove a live server lock to manufacture
cleanup authority. Hard host quotas, hostile local-user resistance and independent
operator recovery evaluation remain outside the implemented gate. Track any
remaining acceptance in [issue #7](https://github.com/Albertito-AI/CommCode/issues/7).

The initial gate is useful when an operator restarts after a crash: the question
"what persisted and what would a rollback overwrite?" is answerable without
triggering destructive repair. A source-matching result remains a candidate for
human inspection, never a certificate that the workspace is correct.
