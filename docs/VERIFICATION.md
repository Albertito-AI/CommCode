# Verification record

Date: 2 November 2026, Asia/Singapore. Version: 0.1.0-dev.1.

## Observed results

| Check                                   | Result                | Scope                                                                                                                                        |
| --------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript syntax                       | PASS                  | 28 application, test, template and tooling modules at the recorded run                                                                       |
| Automated unit/API/integration suite    | PASS                  | 28 tests; zero failures, skips or cancellations                                                                                              |
| Frontend build                          | PASS                  | CodeMirror and language packages bundled with esbuild                                                                                        |
| Formatting                              | PASS                  | Prettier check across supported source and documentation                                                                                     |
| npm advisory audit                      | PASS at check time    | Zero reported vulnerabilities; not proof of absence of vulnerabilities                                                                       |
| Local deterministic demo                | PASS                  | Real starter tests, source edit, application HTTP response, diff and commit                                                                  |
| Public GitHub import                    | PASS                  | channel-income-os at commit 634360031b9688fceed8e63fdac7cfd5319da8d5; 46 source files inspected, clean Git state; imported code not executed |
| Model protocol adapters                 | PASS against fixtures | Local HTTP protocol fixtures for Ollama and compatible chat; not live inference                                                              |
| Failed-test rollback and bounded repair | PASS against fixtures | Real executed tests with deliberately injected implementation faults and labelled model-response fixtures                                    |
| Docker execution/isolation              | NOT RUN               | No Docker executable or engine in authoring environment                                                                                      |
| Browser rendering and interactive UI    | NOT VERIFIED          | Computer-use service failed before launch; local Chromium failed on a prohibited socket operation                                            |
| Live AI provider                        | NOT RUN               | No live model endpoint or paid credential used                                                                                               |
| GitHub create/push                      | NOT RUN               | No repository-create connector action; gh not authenticated; browser unavailable                                                             |
| GitHub Actions                          | NOT RUN               | Workflow definitions prepared; repository not yet created                                                                                    |
| Public release/deployment               | NOT PUBLISHED         | Local source preparation only                                                                                                                |

The API suite exercises token authentication, cross-origin and forged-host rejection,
workspace creation, tests, a real HTTP preview on a separate origin, stop/revocation,
source editing, commit, Git-bundle export and ledger verification. This verifies
server behaviour, not browser rendering or JavaScript execution inside an iframe.

Security regressions include traversal, symlink/hardlink rejection, protected paths,
secret-pattern detection, token comparison, input validation, command deadlines,
cancellation, concurrent writes, stale proposals and rollback conflicts. They do
not constitute a penetration test or prove arbitrary-code hosting safety.

Raw machine-readable evidence: [local demo](evidence/local-demo.json) and
[npm audit](evidence/npm-audit.json). Demo commit hashes identify real temporary
repositories created during the run; they are not public GitHub commits. No fake
screenshots, live-model actions or successful CI badges are supplied.

## Release gates

Run the actual Docker suite on the target host, complete desktop/mobile browser
checks, exercise a configured live model, verify authorised GitHub writes, and
require green CI on the exact release commit before publishing v0.1. See ROADMAP.

## Public repository continuation

The owner created the public CommCode repository on 2 November 2026. Its initial
empty state and administrator write access were verified. Bootstrap commit:
596433930f17798ce1269d76c66391c4f5827024. The table above records the earlier local
preparation run. Source upload and GitHub Actions results are recorded separately
below when observed; they do not turn the product’s GitHub adapter fixture into a
live integration test.
