# ADR 0001 Execution model

Status: accepted for development; Docker acceptance suite passed in run 41454201947.

Use a modular Node control plane and a replaceable Docker execution adapter.
Containers receive a single workspace mount, protected Git internals, a non-root
UID, no capabilities, resource limits and a read-only root. Commands normally have
no network. Dependency installation explicitly enables outbound networking; preview
uses network=none and a fixed HTTP transport through docker exec. No container
port is published. A host loopback relay feeds the separate preview gateway.

A separate process adapter supports tests of trusted fixtures when Docker is absent.
It requires `--unsafe-local` and is never a fallback. Shared-kernel containers are
not equivalent to microVM isolation. Multi-tenant hosting is deferred until there
is a stronger execution service and independent review.

The first real GitHub CI run exposed an unavailable published port on the internal
network. The revised transport retains no-network execution and avoids host-port
publication. It adds one bounded docker exec request per preview resource, which
is acceptable for this initial single-operator GET/HEAD preview.
