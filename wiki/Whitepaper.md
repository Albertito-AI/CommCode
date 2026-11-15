<!-- atlas-whitepaper:managed:v1 -->

# CommCode: software creation as a capability people can own

Prepared for Albert Tan Sin Hon with AI assistance. Foundational paper: 2 November 2026. Documentation revision: 15 November 2026. This is a design and evidence synthesis, not independent peer review or a new product evaluation.

## Abstract

CommCode asks whether ordinary people and small institutions can create useful software while retaining practical control over its source, execution and maintenance. Its current contribution is a public, single-operator local workbench: editing, tests, previews, Git history and bounded, reviewable model proposals. Its public-interest proposition is broader than generation speed. Users should be able to understand a change, reject it, recover from failure and leave with usable source. This paper defines those objectives, maps implementation claims to a fixed source snapshot, explains a recovery example and proposes an evaluation of user control. Current storage and recovery protections are described alongside their limits. No live-model effectiveness, production safety or measured social benefit is established.

## Purpose and definitions

The intended beneficiaries include researchers, schools, community organisations and small enterprises whose needs do not justify surrendering their tools to a proprietary service. Useful creation includes the ability to maintain and transfer a project after its first demonstration.

Here, **ownership** is an operational objective: possession of ordinary source and history, a usable export path, and sufficient understanding to continue elsewhere. It is not a new legal definition. **A proposal** is a model-produced candidate edit; **verification** is evidence from specified checks; **acceptance** is the operator's decision to retain a particular change. A passing test establishes the behaviour it exercises, not general correctness. **Recovery** means a guarded attempt to reconcile an interrupted task with present files and Git state, rather than an unconditional reset.

These definitions make the thesis testable. If users cannot explain their retained changes, recover without destroying later work, or run exported projects independently, the practical-control objective has failed even when an application appears quickly.

## Current system and trust boundaries

The inspected baseline is [commit 0e5a4e357e6bf357df49250ea745298fb698bfb4](https://github.com/Albertito-AI/CommCode/tree/0e5a4e357e6bf357df49250ea745298fb698bfb4), described in the [README](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/README.md) as development snapshot 0.1.0-dev.1. It is a local preview for one operator, not a hosted production service. Core editing, tests, previews and Git operations need no AI subscription.

The browser talks to a token-authenticated loopback API. Projects remain ordinary repositories. The assisted-change path selects bounded context, obtains a structured proposal, presents it for review, checks stale state and runs the configured tests after application. A bounded repair path and conflict-aware rollback exist. These controls constrain an operation; they do not establish that a model's proposal is useful or that the configured tests are adequate.

Docker is the default execution adapter and does not silently fall back to the host. The documented controls include non-root execution, resource limits, read-only root and Git internals, and normally disabled command networking, with a dependency-installation exception. Effective limits still depend on the host. The explicitly unsafe local option executes on the host without isolation. Neither mode creates a boundary between mutually untrusted users. Previews are limited to GET/HEAD and the documented asset/port contract.

Recovery and storage have progressed beyond the founding paper's roadmap. The [workspace budget](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/src/workspace-budget.mjs) sets 512 MiB, reserving 16 MiB for recovery; ordinary admission therefore uses 496 MiB. Command growth is sampled and checked again after completion. This is an application budget, not a kernel-enforced quota: a fast writer or external process can exceed it before intervention. The [task store](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/src/task-store.mjs) caps history at 200 records, 8 MiB per record and 64 MiB total. Existing records are retained when limits block new work. The [server lease](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/src/server-lease.mjs) excludes a second cooperating server using the same data directory. It cannot coordinate arbitrary external editors or prove that manually removing a stale lock is safe.

Interrupted-task review, guarded rollback, confirmed cleanup of verified prior-instance containers and a 15-minute idle-preview timeout are current documented capabilities. Hard filesystem quotas, comprehensive abrupt-failure guarantees and multi-user operation are not implied. A local activity hash chain is inspectable evidence, not an independently anchored or tamper-proof audit.

## Worked example and counterexample

Consider a fictional expense project with a clean Git tree at commit A. The operator requests a validation change, reviews the chosen context and then reviews a proposal changing one file. The workbench checks the saved baseline before applying it. The configured test fails. The operator can inspect the failure and choose a bounded repair or reviewed rollback.

If the file still matches the task's recorded post-change state and Git remains compatible, rollback can restore the recorded earlier content. Now change the scenario: the operator has independently edited that file after the task, or committed subsequent work. An unconditional reset would destroy unrelated work. Conflict-aware rollback should refuse, retain the evidence and require reconciliation. Refusal is the correct outcome in that counterexample; it is not evidence that recovery is broken. The relevant implementation evidence is the [recovery regression suite](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/test/recovery.test.mjs), not the plausibility of this narrative.

A second counterexample concerns evaluation. Suppose a generated fix passes a test that only checks an empty input, while corrupting non-empty records. “Tests passed” is true for that test and inadequate for accepting the feature. A useful assisted-change workflow needs meaningful tests and operator judgement, not merely a green status.

## Evidence and reproducibility

The table separates source facts, recorded observations and untested propositions. This documentation audit did not execute repository code.

| Claim | Evidence at the inspected snapshot | What it does not establish |
| --- | --- | --- |
| Application storage bounds and reserved recovery space exist | [Budget implementation](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/src/workspace-budget.mjs), [storage tests](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/test/storage.test.mjs) | Hard OS quota or zero overshoot |
| Task records and cooperating-instance exclusion exist | [Task store](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/src/task-store.mjs), [lease](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/src/server-lease.mjs) | Distributed or hostile multi-user coordination |
| Regression and acceptance work has been recorded | [Verification record](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/docs/VERIFICATION.md) | A fresh run of every check at this baseline |
| Model protocols have fixture coverage | [README verification scope](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/README.md) | Live inference quality, model independence or paid-provider availability |
| Git creation/push adapter is implemented | [Remaining acceptance work](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/README.md) | Successful authenticated create/push through the product |
| Users will gain durable practical control | Proposed study below | Any measured user benefit today |

Historical receipts must retain their identities. The first prerelease at `fdc8509cf8af432f27c99fdd6dbe01531faa789c` recorded 28 unit/API tests plus browser and Docker acceptance, with browser execution in trusted-local mode and Docker checked separately. The later verification document reports 53 local tests and separately records an earlier native 48-test run. Those observations must not be combined into a new claim that all 53 tests ran natively at the present HEAD.

To repeat the software checks, first inspect the fixed [installation and verification instructions](https://github.com/Albertito-AI/CommCode/blob/0e5a4e357e6bf357df49250ea745298fb698bfb4/README.md) and use an unprivileged Linux account with Node.js 24+, Git and Docker. In a checkout of the baseline:

~~~sh
npm ci
npm run build
npm run setup:runtime
npm run verify
npm run format:check
npm run test:docker
~~~

Browser acceptance additionally requires the documented Chromium installation and `npm run test:browser`. Record the checkout SHA, dependency lockfile, Node/Docker/browser versions, commands, exit codes and logs. Dependency installation can contact registries; these commands are instructions for a deliberate reproduction, not claims of execution here. The deterministic demo does not call a live model. A live acceptance study must separately record provider/model identity, context sent, cost, every attempt and manual intervention.

## Related work and implications

Perry, Srivastava, Kumar and Boneh's [2023 user study](https://arxiv.org/abs/2211.03622v3), published at CCS, found less secure solutions and greater security confidence among participants with a particular AI assistant in its experimental setting. It did not test CommCode or all contemporary models. It motivates measuring confidence alongside observed defects and examining whether review controls improve detection rather than merely reassuring users.

Souppaya, Scarfone and Dodson's [NIST SSDF version 1.1](https://csrc.nist.gov/pubs/sp/800/218/final), SP 800-218 (2022), supplies an official vocabulary for secure development practices. It is a reference for organising evidence and response to defects. Mentioning it does not constitute a CommCode compliance assessment or certification.

## Research programme, limits and teaching

A first proposed usability study should use synthetic, bounded tasks with hidden evaluation cases and a predeclared comparison: the same workbench with and without assisted proposals. Record successful task completion, retained defects, time spent, comprehension of the final diff, confidence calibration and recovery from an injected stale-state conflict. Counterbalance task order and report prior programming experience. Publish failed and abandoned tasks alongside successes. A later portability exercise should ask participants to export a committed project and continue with ordinary tools outside CommCode.

The important adverse outcome is faster completion accompanied by poorer understanding or more destructive recovery decisions. That result would require revising the workflow, even if users liked it. Live inference, authenticated GitHub create/push through the product, accessibility evaluation and independent first-use experience remain distinct acceptance gates. MicroVM isolation, a full terminal, richer previews and institutional hosting should follow demonstrated needs and an explicit threat model.

For teaching, ask a learner to identify the evidence necessary to accept the fictional validation fix; explain why a stale-state refusal protects their work; and design a test that passes a superficial implementation but catches a meaningful defect. Ask a second reviewer to separate observed facts, implementation inferences and proposed benefits in this paper.

The platform remains AGPL-3.0-or-later and the starter templates CC0-1.0. These are separate grants; this paper changes neither. The public-interest aim remains software creation that people can inspect, maintain and leave with. Its achievement requires evidence from use, not a larger feature inventory.

