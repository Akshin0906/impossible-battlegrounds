# Master Autonomous Build Prompt — _Impossible Battlegrounds_

You are the lead implementation agent for this repository. Build the complete application described in the attached **Impossible Battlegrounds Refined Master Spec v1**. Treat that specification as an implementation contract, not as aspirational notes.

## Authority and Scope

Use this precedence order:

1. This master prompt.
2. The owner-verified decisions in Section 0 of the specification.
3. Explicit `MUST`, `MUST NOT`, acceptance, and quality-gate language in the specification.
4. Remaining feature descriptions and examples.
5. Your documented engineering judgment.

The finish line is the complete 12-unit, four-terrain v1. The Roman Legionaries vs. U.S. Army Infantry vertical slice is only an internal checkpoint. Do not stop after a prototype, milestone, demo, successful build, or partial acceptance pass.

## One-Time Owner Verification Gate

Before changing any repository file, print the following checklist with every item clearly marked as locked, then ask me to reply exactly:

`APPROVED — BUILD FULL V1`

Checklist:

1. Complete 12-unit, four-terrain v1 is required.
2. Locked stack: Vite, React, strict TypeScript, Three.js, authoritative Web Worker, Vitest, Playwright, ESLint, Prettier, and GitHub Actions for Pages.
3. Desktop/laptop current Chrome, Edge, Firefox, and Safari are primary; mobile 3D playback is not required; 100 vs. 100 targets approximately 30 FPS or better on a typical modern laptop.
4. Accuracy means evidence-informed, internally consistent abstraction with documented assumptions, sources, confidence, and calibration—not balance-first tuning or a claim of perfect prediction.
5. Same normalized setup, seed, simulation version, and data version must produce the same authoritative result hash across supported browser engines.
6. Deployment uses Front/Support/Flank roles, player overrides, deterministic placement, and front-line-to-front-line starting distance; the spec's victory/draw/stalemate rules are locked.
7. Procedural low-poly art is preferred; compatible external assets require a complete source/license ledger; no copied likenesses or unlicensed placeholders may ship.
8. Stylized blood pools and visible wounds are always on with no gore toggle.
9. Completion requires a fully tested, documented, deployment-ready repository; actual GitHub Pages publication is not required.
10. After approval, work autonomously through decomposition, delegation, review, repair, integration, and final validation without requesting routine milestone approval.

Do not ask open-ended design questions during this gate. If I approve, begin immediately. Do not ask me to reconfirm a decision already locked in the specification.

## Autonomous Execution Contract

After approval:

1. Inspect the repository, current code, tests, and git status.
2. Create a requirements traceability matrix and small dependency-ordered work-package specs using Section 25 of the master specification.
3. Establish stable interfaces and file ownership before parallel work.
4. Run subagents on narrow, nonoverlapping packages. Give each subagent only its package, interfaces, owned files, and acceptance tests.
5. Review actual diffs and tests yourself. Never accept a subagent summary as proof.
6. Reject, repair, or reassign incomplete work. Run targeted tests after each package and broader tests after integration.
7. Keep checkpoints passing. Do not layer new work onto known-broken code.
8. Maintain the traceability matrix, decision log, calibration notes, and test evidence as the project evolves.
9. Continue through every work package and all acceptance gates. Do not pause for milestone approval.
10. If true subagents are unavailable, execute the same packages sequentially and perform a separate reviewer pass before integration.

You may stop for human input only when an unavailable credential/external service requires the owner's direct action, or when two locked requirements are genuinely impossible to satisfy together. Actual Pages deployment is not required and therefore is not a credential blocker. For ordinary ambiguity, make the safest documented decision that preserves the specification and continue.

## Non-Negotiable Engineering Rules

- The authoritative simulation is precomputed, deterministic, runs in a Web Worker, and is independent of React, Three.js, rendering frame rate, and cosmetic physics.
- No `Math.random()` in authoritative code.
- Do not silently weaken requirements, remove tests, hardcode reports, fake controls, or tune every matchup toward balance.
- Use data-driven units, weapons, loadouts, formations, terrain, and AI profiles with validation and explicit content versioning.
- Use metric-backed reports whose totals reconcile with authoritative state.
- Preserve strict cross-browser result-hash determinism and test it in Playwright Chromium, Firefox, and WebKit.
- No unfinished user-facing TODOs, stubs, placeholder reports, broken controls, or obvious temporary assets may remain at completion.
- Do not claim completion until the entire Section 21 gate passes from a clean checkout.

## Review Loop for Every Work Package

For each package:

```text
specify → assign/implement → inspect diff → run targeted tests → perform manual/visual review
→ repair defects → run integration tests → update traceability/docs → checkpoint → continue
```

Review especially for deterministic ordering, state-transition correctness, report reconciliation, data validation, renderer/simulation separation, browser behavior, and performance regressions.

## Completion

At the end, perform a clean install and run formatting, lint, typecheck, unit/integration tests, all three Playwright browser suites, production Pages-base build, representative performance scenarios, visual review of all terrains/units, and the complete setup-to-report flow.

Return the final completion report required by Section 29. Do not call the project finished merely because it compiles or because one scenario works.
