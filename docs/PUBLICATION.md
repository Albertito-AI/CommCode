# Publication record

Canonical public repository: https://github.com/Albertito-AI/CommCode .
The owner created it on 2 November 2026 and instructed publication of the prepared
source. The repository was verified public and empty, then initialised at commit
596433930f17798ce1269d76c66391c4f5827024. The first full source upload follows that
initial commit, preserving its history.

## Historical source package

The initial 84-file development snapshot is retained in
`CommCode-v0.1.0-dev.1.zip`, with a Git bundle at local commit
cf7468982a0bc06b78a9c79d5a41d303247d17ba. The archive records publication as pending
because it predates the owner's repository creation. Current repository contents
and actual Actions results take precedence over that historical status.

## Release gates

Source publication does not establish a passing workflow, a working production
service or a stable release. Read docs/VERIFICATION.md and inspect Actions on the
exact current commit. Complete the recorded Docker, browser and live-provider gates
before presenting v0.1 as fully verified. No paid infrastructure is provisioned.

The local `scripts/publish.mjs` helper creates a new repository and therefore stops
if the repository already exists. It is retained as a reproducible bootstrap helper;
ordinary subsequent changes use Git branches/commits and non-forced pushes.

## First passing public checks

The full source upload was `bbe43bc7917d87fd998f4021f552e5e30775f476`.
The repaired runtime and browser acceptance passed at
`c47bab5df86b9e67aa4e2f8cfe2683dea1998a7e` in
[run 41454201947](https://github.com/Albertito-AI/CommCode/actions/runs/41454201947).
A development release is requested by changing `.github/release-request.json`
on main. The release workflow validates the requested development version against
package.json, runs its gates and publishes the exact triggering commit. Existing
release tags are never overwritten. It uses only the repository-scoped workflow
token and provisions no paid infrastructure.
