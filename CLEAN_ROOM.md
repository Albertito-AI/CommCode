# Independent implementation and provenance

CommCode was implemented independently from the owner's public-interest product
mandate. No proprietary application source, private API, confidential prompt,
protected UI asset or decompiled code was used. Replit and other product names
identify general categories only; no affiliation is asserted.

The implementation was prepared with AI assistance under the owner’s mandate.
It has not received independent human security review.

The workbench UI, control plane, workspace manager, runner adapters, AI transaction
logic, Git operations and tests were written for this project. CodeMirror is an
MIT-licensed editor component bundled from npm. Node.js, Python, Git and Docker
are separately maintained upstream tools. Exact npm resolutions are in the lockfile;
third-party notices are in THIRD_PARTY_NOTICES.md.

## Public sources consulted on 2 November 2026

- CodeMirror overview and licence: https://codemirror.net/
- code-server repository and MIT licence: https://github.com/coder/code-server
- OpenHands core licence: https://github.com/OpenHands/OpenHands/blob/main/LICENSE
- OpenHands Cloud's separate non-open-source licence statement:
  https://github.com/OpenHands/OpenHands-Cloud
- Docker rootless limits: https://docs.docker.com/engine/security/rootless/tips/
- Docker rootless troubleshooting: https://docs.docker.com/engine/security/rootless/troubleshoot/
- Ollama chat protocol: https://docs.ollama.com/api/chat
- AGPL text distributed by SPDX:
  https://github.com/spdx/license-list-data/blob/main/text/AGPL-3.0-or-later.txt
- Licence comparison: https://choosealicense.com/licenses/

Editor candidates were evaluated at the capability/licence level. CodeMirror was
chosen for a focused, low-bandwidth interface. code-server would add a much larger
IDE surface. OpenHands offers a mature agent ecosystem, but the core and cloud
licences differ; no OpenHands code was incorporated. This research does not imply
that these projects lack comparable features or that CommCode is superior.
