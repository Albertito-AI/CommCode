# Threat model

## Scope

This snapshot supports one trusted operator on a controlled Linux machine. It is
not a public arbitrary-code hosting service or a multi-tenant security boundary.
The host OS, Docker engine, Git and the operator are trusted. Repositories, package
scripts, model outputs and application previews may be malicious.

| Threat                                       | Implemented control                                                                                                   | Remaining limitation                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Arbitrary execution and privilege escalation | Docker by default, non-root user, capabilities dropped, no-new-privileges, read-only root, no socket mount            | Shared kernel and Docker daemon risk; selected isolation checks passed in Linux CI                                                      |
| Cross-workspace access                       | Generated IDs, separate directories and container bind mounts                                                         | Host operator and compromised control plane can access all workspaces                                                                   |
| Path traversal and links                     | Relative-path validation, protected paths, symlink/hardlink rejection                                                 | External processes can race filesystem checks; not a hostile multi-user filesystem                                                      |
| Prompt injection and malicious output        | Treat source as data, constrained file proposals, no model command tool, human review, protected hidden configuration | Model can still produce harmful or insecure source; review and tests are essential                                                      |
| Secret leakage                               | Minimal runner environment, protected file names, heuristic content scans, known-key masking, context review          | Unknown formats, encoded secrets and user-provided objectives can leak; no detection guarantee                                          |
| SSRF and preview abuse                       | Fixed upstream loopback ports, registered capability routing, no redirects or forwarded credentials                   | Runtime network access requires separate policy; dependency install has outbound access                                                 |
| Shell injection                              | Git uses argv, repository URLs allowlisted, model cannot submit commands                                              | The authenticated operator's command console intentionally executes shell syntax                                                        |
| Browser origin attacks                       | Exact Host/Origin checks, bearer header, CSP, separate preview origin and iframe sandbox                              | Compromise of the trusted workbench origin can expose the tab token                                                                     |
| Dependency attacks                           | Committed npm lockfile, audit check, bounded explicit installation mode                                               | Package scripts execute code; registry and upstream image trust remain                                                                  |
| Denial of service                            | Command timeouts/output bounds, request bounds, connection bounds, Docker CPU/memory/PID limits                       | Read-only interrupted-task discovery is available; disk quotas and idle cleanup are not implemented, and a local operator can fill disk |
| Container escape                             | Reduced privileges and mounts                                                                                         | No microVM boundary, external penetration test or escape-resistance certification                                                       |
| Supply-chain compromise                      | SHA-pinned CI actions and recorded component provenance                                                               | Base image digest pinned; Debian package updates still vary by build date                                                               |
| Audit modification                           | Hash-linked JSONL records                                                                                             | A privileged writer can rewrite the complete chain; it is not signed or externally anchored                                             |

## Operational rules

Run unprivileged, bind only to loopback, use a dedicated data directory, back up
source and state, and review repositories before executing them. Rootless Docker is
preferred where supported. Docker documents that cgroup limits depend on the host
configuration; verify effective limits rather than trusting flags alone.

`--unsafe-local` deliberately removes execution isolation. Use it only for trusted
fixtures. Do not offer the server through a public reverse proxy. SSH tunnels are
the supported remote-access pattern in this development phase.

Security testing is regression coverage, not a security audit. Multi-user release
requires a dedicated execution service, robust quotas, independent review, stronger
sandboxing, identity/authorisation design, and a full preview gateway.
