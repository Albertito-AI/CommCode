# ADR 0004 Open-source licence

Status: accepted.

Use AGPL-3.0-or-later for the platform. Its network-source obligations for modified
versions align with the aim that improvements to hosted versions remain accessible.
Apache-2.0 would generally reduce adoption friction and permit proprietary forks;
AGPL was selected to give greater weight to continued availability of platform
modifications. This trade-off is explicit, not an assertion that one licence is
universally better.

Starter templates are CC0-1.0 so ordinary generated projects can choose their own
licence. Merely using CommCode does not license a user's independent output under
the AGPL. CodeMirror is MIT-licensed; preserve its notices. Upstream tool/container
licences remain applicable. Review all new dependencies for compatibility.

The complete controlling platform terms are in LICENSE, sourced from the SPDX
licence data. This ADR summarises an engineering decision and does not replace
those terms. Contributors keep copyright and contribute under the stated licence.
