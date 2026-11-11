# Interrupted AI task recovery, initial read-only gate

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

The inventory performs no rollback, container deletion, file deletion, model call
or automatic Git operation. It does not solve filesystem races outside CommCode.
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

These limits cover task JSON files. They are **not filesystem quotas** for Git
history, dependency trees, activity logs, exports or arbitrary commands. Configure
host filesystem limits before relying on a hard disk budget. No automatic deletion
of source files, Git history or activity evidence occurs.

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
identifier, so startup does not delete a container merely because it shares a
workspace identifier. Only resources tracked by the current runner are stopped.
Containers left after a crash still require explicit operator inspection.

Whole-workspace quotas, automatic orphan-container reconciliation and independent
operator evaluation remain open in [issue #7](https://github.com/Albertito-AI/CommCode/issues/7).

The initial gate is useful when an operator restarts after a crash: the question
"what persisted and what would a rollback overwrite?" is answerable without
triggering destructive repair. A source-matching result remains a candidate for
human inspection, never a certificate that the workspace is correct.
