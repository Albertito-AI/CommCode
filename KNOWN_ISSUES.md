# Known issues

- The owner created the public repository on 2 November 2026. Source publication
  proceeds from the prepared development snapshot; verify CI on the latest commit.
- Docker is not installed in that session. Its isolation and preview network need
  real engine verification before a v0.1 release.
- The session's browser service fails before launch. Local Chromium also fails on
  a prohibited socket operation. No screenshots or browser-pass claim are supplied.
- There is no full PTY, multi-user account model, production deployer or team service.
- Preview routes support relative assets and GET/HEAD only. Root-relative assets,
  WebSockets, redirects and backend form submission need further implementation.
- Source inspection is intentionally bounded and skips protected files. Binary and
  very large files are not editable in the workbench.
- File/path checks are not race-proof against another hostile local process.
- Disk quotas, idle suspension and multi-process state locking are not implemented.
- Interrupted tasks retain recovery files but have no dedicated recovery UI yet.
- The ledger is hash-linked, not signed or immutable. A privileged writer can
  rewrite a complete valid chain.
- Secret scanning is heuristic. Model token usage is recorded when supplied, but
  no monetary cost estimate or hard spending guarantee is claimed.
- Starter expenses are in-memory and must be downloaded before refresh.
- CommCode is also used by existing businesses; this project claims no trademark
  clearance. The owner expressly selected the name after the initial codename.
