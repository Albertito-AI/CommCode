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
A 512 MiB application budget counts the full workspace and reserves 16 MiB from
ordinary operations. Commands are sampled and checked after execution; this is
not a kernel quota against arbitrary host writes. Container cleanup requires
re-inspection of canonical directory ownership, immutable identity and bind mount.
Hard filesystem quotas and distributed coordination remain separate host work.
