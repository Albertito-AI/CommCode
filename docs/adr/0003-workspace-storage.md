# ADR 0003 Workspace storage and portability

Status: accepted for single-operator development.

Keep projects in ordinary Git repositories. Store task records, workspace commands
and the activity ledger beside the repository in inspectable JSON/JSONL. Avoid a
database service in the initial path. Use atomic JSON replacement and per-workspace
in-process locks. Never store provider credentials in workspace metadata.

This keeps backups and independent operation simple but does not support concurrent
server processes or hostile multi-user access. Schema migrations and database-backed
coordination become necessary before those features are introduced.
