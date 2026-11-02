# Contributing

CommCode welcomes improvements in code, documentation, accessibility, translations
and public-interest use cases. Start with a focused issue describing the user problem
and a reproducible example. Avoid confidential source and personal information.

Use Node.js 24, Git and an unprivileged Linux environment. Run `npm ci`,
`npm run format`, `npm run verify` and `npm audit`. Execution changes also require
`npm run setup:runtime && npm run test:docker` on a real Docker host. Keep tests
that prove behaviour or prevent a regression; avoid tests that simply restate code.

Describe the problem, resulting behaviour, evidence and limits in each pull
request. Update documentation and an ADR when boundaries or formats change. No
feature may add secret telemetry, a proprietary project format or a paywall over
an essential existing capability. Preserve the clean-room provenance record.

Contributions are licensed under AGPL-3.0-or-later unless a file is expressly marked
otherwise. Templates use CC0-1.0. Contributors retain copyright in their work.
Do not submit source you lack the right to contribute. Maintainers review licence
compatibility before adopting dependencies.
