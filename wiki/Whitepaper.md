<!-- atlas-whitepaper:managed:v1 -->

# CommCode: software creation as a capability people can own

## The thesis

People should be able to turn useful ideas into software without surrendering their source, history and practical ability to maintain it. CommCode is an independently implemented workbench built around that proposition. It combines editing, bounded execution, previews, ordinary Git projects and reviewable AI changes in a local development environment.

The immediate product is a modest single-operator workbench. The larger ambition is a public-interest infrastructure for creation: schools, community organisations, researchers and small enterprises can build tools appropriate to their own circumstances and retain the ability to inspect, repair and leave with them.

Prepared for Albert Tan Sin Hon with AI assistance on 2 November 2026. This paper separates the verified development preview from the ideal roadmap. It does not describe a finished cloud platform, a multi-user security boundary or verified live AI inference.

## First principles: ownership must remain practical

Legal permission to possess code is useful only if the code can also be understood, run and moved. CommCode therefore uses ordinary source files and Git repositories, portable templates and replaceable runtime/model adapters. Its core editing, testing, preview and Git functions do not require an AI subscription.

The second principle is that generation and completion are different. A model's proposed edit is a hypothesis about a change. It should be inspected, applied within a controlled transaction, tested against the configured command and either accepted or reversed without overwriting unrelated work. A successful test establishes the behaviour checked by that test, not universal correctness.

The third principle is bounded authority. Model output should not become arbitrary control-plane commands. Source context must be reviewed before sharing, credentials stay outside workspaces, and commands execute through an explicitly selected runtime. A capable assistant does not acquire permission merely by predicting a useful next step.

## Fundamental logic of the workbench

The browser interface supplies a CodeMirror editor, source explorer, command console, review controls and preview. The loopback API uses a bearer token and host/origin checks. Workspaces retain local metadata and ordinary Git history. Optimistic version checks refuse stale saves, and workspace locks bound competing mutations.

Docker is the default execution path and does not silently fall back to the host. Containers apply non-root execution, a read-only root, restricted Git internals and resource limits. Commands normally have no network; dependency installation is an explicit exception. Preview traffic uses a separate origin and a bounded fixed HTTP transport into a network-disabled container. Docker shares a host kernel and daemon trust boundary; these controls do not make arbitrary public hosting safe.

For trusted fixtures, an explicitly unsafe local process adapter supports development. The distinction is visible. The current console is not a full PTY, and preview support is GET/HEAD with restricted routing rather than a general application gateway.

## The AI loop as a reviewable transaction

The agent path begins from a clean worktree and a bounded context selection. A structured proposal names file changes. The operator reviews it before application. The programme checks for stale state, executes the configured tests and permits a bounded repair sequence. Rollback refuses to erase subsequent user edits or a later commit.

This design treats recovery as a correctness problem. “Undo” is unsafe when it assumes nothing else has changed. Task records and an activity ledger make actions inspectable, but a local hash chain is not a tamper-proof external audit. Crash-recovery discovery, storage quotas and stronger operational guarantees remain work to do.

Ollama and compatible-chat adapters exist. Protocol fixtures exercise their interfaces; they do not establish real model quality. The next live acceptance run should identify the actual model and configuration, preserve the proposal and test results, record cost and disclose any manual intervention. It must not quietly replace a difficult model failure with a scripted success.

## Aim and hope: a smaller gap between need and useful software

A community group may need an expense tracker, a teacher a small exercise tool, or a researcher a local data interface. Their needs can be too specific for a general product and too small for a large procurement. CommCode hopes to make such creation more attainable while preserving understanding and control.

The benefit depends on maintainability. A generated application that nobody can repair may create a new dependency rather than solve one. Templates, explanations, tests and export are therefore part of the public-interest purpose. Accessibility, low-bandwidth use and modest hardware requirements should influence design decisions alongside advanced functionality.

The platform uses AGPL-3.0-or-later and its starter templates use CC0-1.0. These are distinct grants with different purposes. The project aims to keep its core useful without a paid feature gate, while allowing users to build and retain their own ordinary projects. This paper makes no new legal interpretation of those licences.

## Ideal progression and wishlist

| Stage                    | Intended outcome                                                   | Evidence required                                                                  |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Verified local slice     | Edit, test, preview and preserve source                            | Fresh checkout, real browser flow, Docker checks and exact-commit CI               |
| Reliable assisted change | Useful live-model proposals with honest failures                   | Actual provider run, bounded repairs, context/privacy review and recovery evidence |
| Durable everyday work    | Crash recovery, storage limits and better terminal/preview support | Failure injection, cancellation, migration and independent first use               |
| Accessible learning      | Explainable workflows, inclusive UI and portable teaching examples | Keyboard, language and user evaluation; measured comprehension                     |
| Controlled collaboration | Multiple users and institutional deployment                        | Explicit threat model, identity, isolation, audit and independent security review  |

The ideal wishlist includes a full terminal, richer previews, accessible project walkthroughs, stronger test protection, reliable GitHub integration, portable deployment and institutional self-hosting. Stronger isolation such as microVMs should follow a justified threat model. A large feature list does not substitute for a dependable path through a small real task.

## Evidence and limits at the first development release

The first prerelease is tied to commit `fdc8509cf8af432f27c99fdd6dbe01531faa789c`. Its release workflow passed formatting, 28 unit/API tests, frontend build, advisory audit, real Docker integration and real Chromium desktop/mobile acceptance. The browser flow used trusted-local execution; Docker was exercised separately. Screenshots were inspected, including an actual mobile expense entry after an initial off-screen iframe capture issue was corrected.

Live inference and the product's authenticated GitHub create/push path remain acceptance tasks. Publishing the CommCode source through GitHub tooling does not verify that product integration. There is no hosted production service, security certification or claim of independent adoption.

## Measuring public value

Evaluate time to a working, understood and recoverable project. Include setup, debugging, reviewing AI output, correcting mistakes and exporting the result. Measure how often a user can explain the change, recover from failure and continue in another editor. Record regressions, resource cost and accessibility obstacles.

If the tool makes people dependent on opaque generated code, it is missing its purpose. If safety controls make ordinary work incomprehensible, they need better design. If a simpler workflow serves a community better, support that route. The best case is increased agency: more people can create useful software and remain able to govern it after the first successful demo.

## Inspected foundation

Sources: [release](https://github.com/Albertito-AI/CommCode/releases/tag/v0.1.0-dev.1), [release verification run](https://github.com/Albertito-AI/CommCode/actions/runs/41455489247), [README](https://github.com/Albertito-AI/CommCode/blob/fdc8509cf8af432f27c99fdd6dbe01531faa789c/README.md), [verification record](https://github.com/Albertito-AI/CommCode/blob/fdc8509cf8af432f27c99fdd6dbe01531faa789c/docs/VERIFICATION.md), [threat model](https://github.com/Albertito-AI/CommCode/blob/fdc8509cf8af432f27c99fdd6dbe01531faa789c/THREAT_MODEL.md) and [roadmap](https://github.com/Albertito-AI/CommCode/blob/fdc8509cf8af432f27c99fdd6dbe01531faa789c/ROADMAP.md). CommCode is the owner's selected name; documented existing business use means no trademark clearance or affiliation is asserted.
