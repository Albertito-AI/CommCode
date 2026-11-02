# Installation

Use an unprivileged Linux account with Node.js 24+, npm, Git and Docker Engine.
macOS/Windows Docker Desktop paths and permissions have not been verified.

```sh
npm ci
npm run build
npm run setup:runtime
npm start
```

Visit `http://127.0.0.1:4317`. Read the file `.commcode/access-token` locally and
paste it into the login form. Do not paste real tokens into issue reports.
Ports 4317 and 4318 must both be free. `COMMCODE_PORT` and
`COMMCODE_PREVIEW_PORT` override them. Use the exact 127.0.0.1 URL; host checks
intentionally reject aliases such as localhost.

Configuration is read from the process environment. Copy `.env.example` to `.env`
if desired, then use Node's explicit env-file support:

```sh
node --env-file=.env src/cli.mjs
```

No dotenv loader runs automatically. Protect `.env` and never commit it. The
platform does not need an AI key to operate the editor, templates, tests or Git.

Docker integration passed on GitHub’s Linux runner. Before relying on Docker mode,
run `npm run test:docker` on your target machine and verify effective cgroup limits.
To inspect trusted templates without Docker, use `npm start -- --unsafe-local`.
This runs shell commands directly on your host; it is not an isolation substitute.
