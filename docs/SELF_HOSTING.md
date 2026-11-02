# Self-hosting

The supported development configuration is a single operator, one Node process,
one local state directory and loopback access. Do not expose it to the public
internet or share an access token among mutually untrusted users.

For private remote use, forward both ports over SSH:

```sh
ssh -L 4317:127.0.0.1:4317 -L 4318:127.0.0.1:4318 your-server
```

Open the same 127.0.0.1 URL on the client. Keep the remote server and SSH account
under your control. A remote operator's browser preview must reach the forwarded
preview port. This is not a hosted team service.

Store `COMMCODE_HOME` on a local filesystem with permissions restricted to the
operator. Back up the entire directory while the service is stopped. Each `repo/`
can be cloned with ordinary Git. Git bundles export committed history only; task
records and uncommitted edits require a data-directory backup.

Use rootless Docker where practical. Confirm memory/CPU/PID limits actually take
effect on your host. The runtime image has no platform credentials and never sees
the Docker socket. Docker permissions still confer substantial host authority.
See THREAT_MODEL.md before running repositories you did not write.
