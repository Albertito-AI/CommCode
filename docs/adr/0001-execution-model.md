# ADR 0001 Execution model

Status: accepted for development; Docker acceptance tests pending.

Use a modular Node control plane and a replaceable Docker execution adapter.
Containers receive a single workspace mount, protected Git internals, a non-root
UID, no capabilities, resource limits and a read-only root. Commands normally have
no network. Dependency installation explicitly enables outbound networking; preview
uses an internal Docker network and a loopback-published application port.

A separate process adapter supports tests of trusted fixtures when Docker is absent.
It requires `--unsafe-local` and is never a fallback. Shared-kernel containers are
not equivalent to microVM isolation. Multi-tenant hosting is deferred until there
is a stronger execution service and independent review.
