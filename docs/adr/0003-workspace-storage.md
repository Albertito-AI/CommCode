# ADR 0003 Workspace storage and portability

Status: accepted for single-operator development.

Keep projects in ordinary Git repositories. Store task records, workspace commands
and the activity ledger beside the repository in inspectable JSON/JSONL. Avoid a
database service in the initial path. Use atomic JSON replacement and per-workspace
in-process locks. Never store provider credentials in workspace metadata.

An exclusive server lock now refuses a second cooperating server on the same data
directory and requires manual inspection after an unclean exit. Task history has
explicit admission and byte limits, with no automatic deletion of recovery records.
This does not enable concurrent server processes or hostile multi-user access.
Whole-workspace quotas and distributed coordination remain separate work.
