# Security policy

CommCode is a development preview. No stable release or public hosting security
commitment is made yet. Report security concerns privately to the maintainer using
GitHub private vulnerability reporting when that feature is available. Do not put
credentials, confidential repositories or working exploits in public issues.
If private reporting is unavailable, open a minimal issue asking for a private
channel without disclosing exploit details. No response-time guarantee is promised.

See [THREAT_MODEL.md](THREAT_MODEL.md) for the precise trust boundary. A working
unit test or passing dependency audit is not evidence that arbitrary untrusted code
can be hosted safely. Do not disable failing security checks merely to obtain a
successful workflow run. Reproduce, fix and retain a regression test.

Only explicitly configured AI endpoints receive source. There is no telemetry.
Provider and GitHub keys stay in the control-plane environment, not workspace
containers. Protect local task records, which contain source snapshots.
