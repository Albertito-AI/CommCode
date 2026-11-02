# Troubleshooting

| Symptom                                  | Evidence and remedy                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Runtime unavailable                      | Install/start Docker and run `npm run setup:runtime`. There is no automatic host fallback.                    |
| Invalid host                             | Open the exact `http://127.0.0.1:4317` URL or configured port. Forward both ports for SSH access.             |
| Authentication required                  | Read the server's access-token file. Restart tabs after rotating a token.                                     |
| Asset missing                            | Run `npm ci && npm run build`. CodeMirror is built locally.                                                   |
| Workspace busy                           | Wait for the operation or use Cancel. Stop an application before source edits.                                |
| File changed                             | Reload and reconcile your changes. The server will not overwrite a stale editor buffer.                       |
| AI is disabled                           | Configure a supported provider in the server environment. The workbench works without AI.                     |
| Proposal rejected                        | Inspect the provider output contract, protected paths and file-size bounds. No proposal is applied silently.  |
| Test failure                             | Read captured output and the real exit status. Review configured test commands.                               |
| Rollback needs review                    | Another process or test changed task-owned files. Export source, inspect task records and reconcile manually. |
| Preview unverified                       | Inspect logs. The app must listen on HOST and PORT and answer HTTP at `/`.                                    |
| Missing preview assets                   | Use relative URLs. Root-relative paths and WebSockets are not supported yet.                                  |
| GitHub HTTP 403                          | Check token permissions and repository policy; do not broaden credentials unnecessarily.                      |
| Git push rejected                        | Inspect remote history. Never force-push to bypass unrelated work.                                            |
| Browser launch unavailable in automation | Report the environment failure; do not generate a fake screenshot.                                            |

Task state is stored outside the repository in `task-UUID.json`. A stopped process
can leave an applying task and a runtime container. Preserve its evidence before
cleanup. Use ordinary Docker/Git tools under operator control; do not delete other
users' resources. Dedicated automated crash recovery is a release gate.
