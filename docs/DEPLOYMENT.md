# Deployment and portability

CommCode itself is currently a local single-operator tool. It has no automatic
cloud deployment or paid-resource provisioning. The Ship mode in the broader
mandate remains a roadmap item.

A generated project is an ordinary Git repository. Commit reviewed changes, then
export a Git bundle or push to your own GitHub remote. To restore a bundle:

```sh
git clone commcode-project.bundle my-project
```

This preserves committed branches/history. It does not include uncommitted changes
or local task metadata. Copy the data directory for a full backup.

To deploy a project elsewhere, follow that project's runtime and hosting
requirements. The included expense tracker can run with `node server.mjs`; the
Python API can run with `python3 app.py`. These starters are deliberately small
and are not production financial/accounting or authentication systems.

Do not present an HTTP preview as a public deployment. A deployment is verified
only after testing the actual target URL and relevant application behaviour.
