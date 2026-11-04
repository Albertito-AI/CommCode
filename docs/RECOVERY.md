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
or automatic Git operation. It does not authenticate competing processes or solve
filesystem races outside CommCode. The current application remains **single
operator on localhost**, not a durable multi-user service. Disk quotas, task
history retention, orphaned temporary-file policies, idle suspension, cross-process
locking and adversarial crash injection are still open in
[issue #7](https://github.com/Albertito-AI/CommCode/issues/7).

The initial gate is useful when an operator restarts after a crash: the question
"what persisted and what would a rollback overwrite?" is answerable without
triggering destructive repair. A source-matching result remains a candidate for
human inspection, never a certificate that the workspace is correct.
