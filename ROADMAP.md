# Roadmap

## Development snapshot 0.1.0-dev.1

Local control plane, browser workbench source, two portable templates, Git history,
command console, HTTP preview, AI proposal transaction, two provider protocols,
rollback, activity ledger and automated tests are implemented. See verification
for the remaining environment-dependent acceptance checks.

## Before a stable v0.1 release

- Completed: full source upload verified against a fresh public clone.
- Completed: Docker integration, network-disabled preview and cleanup in Linux CI;
  base image digest pinned. Extend actual cgroup pressure and cancellation probes.
- Completed: Chromium desktop/mobile flow and real screenshots. Broaden keyboard,
  accessibility and cross-browser coverage.
- Exercise a live local model through propose, apply, tests and commit.
- Verify public GitHub clone, authenticated creation and non-forced push against a
  disposable authorised test repository.
- Require all workflow jobs to pass on the exact release commit.
- Task-history limits, a workspace application budget with recovery reserve, idle
  preview suspension, a cooperating-server lock and explicitly reviewed owned-container
  cleanup are implemented. Verify the exact-head Docker/browser acceptance and
  complete independent crash/recovery evaluation for issue #7. Hard host filesystem
  quotas remain an operator requirement; sampled application checks do not provide
  hostile-user disk isolation.

## v0.2

PTY terminal; more capable preview routing with WebSockets and backend requests;
explicit template manifests; human-readable verification reports; repository mapping
and model context selection; protected original-test verification; pull-request
creation; persistent project knowledge and a learning-mode walkthrough.

## v0.3

Native Anthropic/Gemini adapters when justified by verified APIs; model budgeting
with configurable prices; stricter source privacy profiles; dependency inventory,
licence/SBOM export, vulnerability reports and bounded dependency-repair proposals.

## v0.4 to v0.5

Portable deployment adapter for a generic VPS/container target, runtime verification,
backups, project-health reports, stronger recovery and accessibility audits. Refine
non-developer workflows using actual user feedback. No paid resources by default.

## v0.6 onwards

Identity and tenant isolation, institutional deployments, collaboration, extensions,
translations, and stronger isolation such as gVisor or microVMs. A stable v1.0 needs
independent security review and evidence from sustained real-world operation.

Prioritise tasks that make the existing path safer and more dependable before
expanding the number of features. Do not mark an item complete solely because an
implementation file exists. Keep working, experimental and planned status distinct.
