# Verification record

## 11 November 2026: bounded recovery continuation

The task-history store now checks 200-record, 8 MiB per-record and 64 MiB
aggregate limits and reserves recovery headroom before provider calls or source
edits. It preserves existing records on rejection. Original-file recovery data
is checked before writes, and long stored output/diff excerpts carry truncation
flags. The recovery reader now accepts the writer's record size, fixing the
earlier 256 KiB inspection mismatch. A cooperating-server filesystem lock and
idle preview suspension have been added; container names are scoped to a runner
instance rather than only a workspace.

The 512 MiB workspace application budget includes source, Git, dependencies and
metadata, with a 16 MiB reserve. It refuses ordinary writes at the threshold,
checks command/import execution before and after running and samples continuing
commands. Prior-instance container cleanup rechecks exact IDs, canonical-directory
ownership labels and bind sources, and refuses current or mismatched resources.
The recovery UI exposes storage and container review separately from task rollback.

On Node 24.22.1, `npm run verify` passed syntax checks, all 52 unit/API/integration
tests with no skips, and the editor build. `npm run format:check` passed. The 19
added tests include original-data preflight, record preservation, exclusive
startup, a killed lease-holder process, idle shutdown, real command overshoot and
termination, cancellation with guarded restore, reserved-space rollback and a
real HTTP preview restart/capability race. A reproduced shutdown regression
checks that a delayed job finishes persistence before lease release, a request
whose body arrives during shutdown receives 503, and concurrent close calls share
one completion promise. A labelled daemon adapter exercises
failed-removal tracking, confirmed absence and failed job/startup cleanup; it is
not a real Docker test. Two reproduced regressions also verify that legitimate
`__proto__` filenames are recorded and restored through JSON-reloaded task maps
without overwriting later user edits.
The API suite also checks authenticated recovery access and successful export
when normal writes have reached their budget. Existing partial-write and later
external-edit refusal regressions remain in force.

No Docker engine or configured local model was available in this authoring
environment. Chromium could not start because a required socket operation was
prohibited. The expanded existing Docker CI suite must separately prove that
reviewed prior-instance containers are removable, current/foreign/mismatched
containers survive refused cleanup, and cancellation leaves no owned job. The
browser suite now opens the real recovery review UI. Exact-revision public CI
must pass before merge. No live inference was substituted with a fixture.

These are controlled software tests, including actual local processes, not
independent operator use. Hard host quotas, hostile local-user resistance and
independent recovery evaluation remain separate gates. See the precise
[recovery boundaries](RECOVERY.md); issue #7 remains open for acceptance review.

### Observed public CI for the complete implementation

[Run 42973285246](https://github.com/Albertito-AI/CommCode/actions/runs/42973285246)
passed at pull-request head `49df869b87e714b891046a7d1487f352393310f6`.
The run executed both real Docker integration tests, including ownership refusal,
prior-instance removal and cancellation cleanup, and the real Chromium flow with
recovery review, editing and desktop/mobile preview interaction. Installation,
formatting, the 48 tests present at that head, build, advisory audit and demo also
passed. The browser artifact was downloaded and its SHA-256 matched
`f6b3f8c2207982e8c5697166a6c5c438f187206aea4e630b301e482cdf43b71d`;
desktop and mobile screenshots were visually inspected. A subsequent review
added four regressions, made job/startup cleanup failures visible, corrected
special-filename recovery maps and held the shutdown lease until job persistence; that final source must receive its own exact-head
CI before merge. The observed run does not establish live-model or independent-user
acceptance.

Date: 2 November 2026, Asia/Singapore. Version: 0.1.0-dev.1.

## Initial authoring-environment results

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
repositories created during the run; they are not public GitHub commits. The later CI evidence below extends this initial local record.

## Stable-release gates

Run the actual Docker suite on the target host, complete desktop/mobile browser
checks, exercise a configured live model, verify authorised GitHub writes, and
require green CI on the exact release commit before publishing stable v0.1. See ROADMAP.

## Public repository continuation

The owner created the public CommCode repository on 2 November 2026. Its initial
empty state and administrator write access were verified. Bootstrap commit:
596433930f17798ce1269d76c66391c4f5827024. The table above records the earlier local
preparation run. Source upload and GitHub Actions results are recorded separately
below when observed; they do not turn the product’s GitHub adapter fixture into a
live integration test.

## Public CI acceptance, 2 November 2026

[Run 41454201947](https://github.com/Albertito-AI/CommCode/actions/runs/41454201947)
passed on commit `c47bab5df86b9e67aa4e2f8cfe2683dea1998a7e`. Observed job steps:

- Installation, formatting, 28 unit/API tests, frontend build, npm advisory audit
  and the deterministic local demo passed.
- A real Docker image built from the digest-pinned Node base. The Docker suite
  executed starter tests, checked non-root identity, rejected root/Git writes,
  checked network mode `none`, fetched JavaScript through the preview relay and
  stopped the managed application. It does not stress-test every resource limit.
- Real Chromium completed login, workspace creation, CodeMirror editing and save,
  test execution, iframe expense entry and shutdown. Desktop width was 1440 pixels;
  mobile width was 390 pixels with no page-level horizontal overflow. The browser
  flow used the explicit trusted-local adapter; Docker was checked separately.
- The screenshot ZIP was downloaded and its SHA-256 matched the Actions artifact:
  `9a901badf5b9bf985d18df89c88808fa66945cfa0a65604539d6a677a9a6dddd`.
  Desktop rendering was inspected. The first full-page mobile capture showed an
  unpainted off-screen iframe; the next revision scrolls to it and performs an
  additional mobile expense interaction before capturing.

The initial run 41453397435 failed on Docker preview port discovery. The repair
uses a fixed HTTP transport through `docker exec`, retaining `network=none`; the
passing run above contains that repair. Failed evidence is preserved in Actions.

The development prerelease workflow repeats formatting, tests, build, audit,
Docker and browser acceptance on the exact source commit before creating a release
and checksummed source archive. A prerelease is not completion of stable gates.
Live-model acceptance remains [issue #6](https://github.com/Albertito-AI/CommCode/issues/6);
crash recovery and bounded storage remain [issue #7](https://github.com/Albertito-AI/CommCode/issues/7).
The product’s authenticated GitHub adapter remains unverified against a live target.
No production hosting, paid model service or arbitrary-user security certification
is claimed. Base-image pinning does not freeze Debian package mirrors.

## Development prerelease observed

[Release v0.1.0-dev.1](https://github.com/Albertito-AI/CommCode/releases/tag/v0.1.0-dev.1)
was published on 2 November 2026 at 13:45 UTC from
`fdc8509cf8af432f27c99fdd6dbe01531faa789c`.
[Release run 41455489247](https://github.com/Albertito-AI/CommCode/actions/runs/41455489247)
and [main CI 41455489252](https://github.com/Albertito-AI/CommCode/actions/runs/41455489252)
both completed successfully. Source archive SHA-256:
`8ab9304b23b87b1527b2c972c463269b59e096ad0b69dbe3b44beed7aa3dbd80`.
The release includes a checksum file.

The release browser artifact SHA-256 was independently matched after download:
`fa7f2b7e10637f77fabb7cda5ea0f3c1b517e878fa90109a0bb246ebac1fbd68`.
The corrected mobile capture was visually inspected with the live iframe showing
both expense entries. The mobile interaction added 2.50 to the desktop 12.50,
and the test verified 15.00 before capture. These are real fixture interactions,
not a live AI demonstration or an accessibility certification.
