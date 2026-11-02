# Developer guide

```sh
npm ci
npm run format
npm run verify
npm run format:check
npm audit
npm run demo
```

The standard test suite uses temporary Git repositories and actual shell commands
on trusted fixtures. It also uses explicitly labelled mock-provider responses.
No paid model credentials are needed. `test/docker.integration.mjs` is separate
and requires a real Docker engine plus `commcode-runtime:dev`.
Run `npx playwright install --with-deps chromium` and `npm run test:browser` for
the real desktop/mobile UI flow. It uses a trusted temporary starter project and
produces screenshots in `test-results/`; CI retains these for seven days.

Backend modules are ESM using Node standard libraries. Add dependencies only when
they remove substantial complexity. Frontend dependencies are bundled with esbuild;
regenerate notices with `node scripts/notices.mjs` after updates. Commit lockfile
changes and inspect upstream licence changes. Do not silently change the runtime
base image without verification.

The browser API is intentionally small. Start with `/api/status` and
`/api/workspaces`; each workspace exposes `inspect`, `file`, `configure`, `command`,
`test`, `install`, `start`, `stop`, `logs`, `context`, `propose`, `apply`, `rollback`,
`commit`, `export`, `ledger`, `github/create` and `github/push`. GET reads data;
POST mutations require JSON and an Authorization bearer header. Long-running
operations return a job ID polled through `/api/jobs/:id`. Cancellation uses
POST `/api/jobs/:id/cancel` with `{}`.

All source writes, tests and AI tasks are serialised per workspace. Stop the
application before editing. Do not run multiple CommCode processes on one state
folder. See ARCHITECTURE.md for the persistence and recovery model.
