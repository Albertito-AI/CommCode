# CommCode 0.1.0-dev.1

First development prerelease of the independently implemented local software
workbench: CodeMirror editing, portable JavaScript/Python starters, bounded
commands, Docker execution, a separate preview gateway, ordinary Git projects,
reviewable AI file proposals, test-driven repair and conflict-aware rollback.

The release workflow requires formatting, 28 unit/API checks, frontend build, npm
advisory audit, real Docker integration and Chromium desktop/mobile acceptance
on the packaged commit. The source archive is accompanied by SHA256SUMS.txt.
See the linked Actions run for observed outcomes, not just the workflow definition.

Live AI inference and the product’s authenticated GitHub create/push integration
remain acceptance work. Protocol fixtures are labelled as such. The browser
acceptance uses trusted-local execution; the Docker adapter has a separate suite.

This is a single-operator localhost development preview. There is no hosted cloud
service, full PTY, multi-user boundary or stable-release claim. Preview routing is
GET/HEAD only. Read README, THREAT_MODEL and docs/VERIFICATION before use. Core use
requires no paid service. Platform: AGPL-3.0-or-later; starter templates: CC0-1.0.
