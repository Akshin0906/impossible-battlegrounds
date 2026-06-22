# Impossible Battlegrounds Work Packages

This file decomposes the owner-approved v1 contract into small, dependency-ordered packages. Each package uses the same fields so implementation, subagent assignment, review, and rollback remain bounded.

## Shared Interfaces

- `simulateBattle(setup, registry)` is the pure authoritative entry point.
- `NormalizedBattleSetup`, `ContentRegistry`, `BattleResult`, `BattleTimeline`, and `BattleReport` are the cross-package contracts.
- Authoritative modules under `src/simulation` may not import React, Three.js, DOM, canvas, or renderer code.
- UI and renderer packages consume the worker result and never mutate authoritative state.

## WP-00 Repository Audit, Owner Gate, Traceability

- Objective: record approval, current repo state, requirements traceability, and initial package map.
- Requirements traced: Sections 0, 21, 25, 28.
- In scope: audit, package map, traceability, decision log.
- Out of scope: app code.
- Dependencies: owner approval phrase.
- Owned files: `docs/requirements-traceability.md`, `docs/decisions.md`, `docs/work-packages/*`.
- Interfaces: documentation only.
- Acceptance tests: files exist and map every Section 21 gate to evidence.
- Manual review: verify no implementation starts before approval record.
- Risks and rollback: stale package map; update docs as implementation changes.
- Done: traceability and package specs are committed-ready.

## WP-01 Toolchain and Pages Build

- Objective: strict Vite React TypeScript stack with lint, format, tests, Playwright, and Pages workflow.
- Requirements traced: Sections 2, 21.2, 21.3.
- In scope: package scripts, TypeScript, Vite base path, ESLint, Prettier, workflow.
- Out of scope: feature behavior.
- Dependencies: WP-00.
- Owned files: root config files, `.github/workflows/pages.yml`.
- Interfaces: npm scripts named in README and validation docs.
- Acceptance tests: `npm ci`, `npm run build:pages`, lint/typecheck/test scripts exist.
- Manual review: inspect built asset paths under a subpath.
- Risks and rollback: dependency incompatibility; pin or replace lightweight packages.
- Done: clean install and static build are reproducible.

## WP-02 App Shell and State Machine

- Objective: setup, loading, playback, report, and error states with responsive layout.
- Requirements traced: Sections 4, 5, 8, 9, 21.1.
- In scope: React app shell, error boundary, routing-free state machine.
- Out of scope: simulation internals and Three renderer implementation details.
- Dependencies: WP-01, WP-03.
- Owned files: `src/app`, feature containers, global styles.
- Interfaces: UI dispatches normalized setups to worker client.
- Acceptance tests: user can navigate setup to loading to playback/report.
- Manual review: desktop and narrow viewport scan for overflow.
- Risks and rollback: state coupling; keep authoritative data in result object.
- Done: screens are reachable and controls are wired.

## WP-03 Domain Types and Content Registry

- Objective: typed JSON content with validation, content version, and content hash.
- Requirements traced: Sections 6, 7, 11.16, 17, 27.
- In scope: domain types, schemas, content loader, validation diagnostics.
- Out of scope: balance tuning.
- Dependencies: WP-01.
- Owned files: `src/domain`, `src/data`.
- Interfaces: `loadContentRegistry`, `validateContentRegistry`.
- Acceptance tests: invalid content fails; UI options come from data.
- Manual review: all 12 units and four terrains are present.
- Risks and rollback: loose data semantics; document every normalized stat.
- Done: content is data-driven and versioned.

## WP-04 Determinism Primitives

- Objective: seeded PRNG streams, quantized math, stable serialization, and result hashing.
- Requirements traced: Sections 9.2, 10.5, 26.1.
- In scope: RNG test vectors, no `Math.random` in authoritative modules.
- Out of scope: UI seed randomization.
- Dependencies: WP-03.
- Owned files: `src/simulation/rng.ts`, `deterministicMath.ts`, `resultHash.ts`.
- Interfaces: `createRngStreams(seed)`, `hashBattleResult`.
- Acceptance tests: vectors and same-seed hashes match.
- Manual review: scan authoritative imports and random usage.
- Risks and rollback: cross-engine numeric drift; quantize hash inputs.
- Done: deterministic primitives pass tests.

## WP-05 Through WP-21 Terrain, Deployment, and Simulation Systems

- Objective: implement terrain models, formation deployment, tick loop, navigation, targeting, ranged/melee, ammo, wounds, morale, explosions, AI profiles, and all terrain-specific effects.
- Requirements traced: Sections 7, 10, 11, 12, 18, 20, 21, 26.
- In scope: authoritative state transitions and event generation.
- Out of scope: cosmetic rendering.
- Dependencies: WP-03, WP-04.
- Owned files: `src/simulation/**`.
- Interfaces: pure `simulateBattle` plus typed helpers.
- Acceptance tests: invariants, metamorphic scenarios, report reconciliation.
- Manual review: developer-mode traces for representative battles.
- Risks and rollback: unbounded complexity; keep v1 abstractions documented and deterministic.
- Done: all simulation systems are represented and terminate deterministically.

## WP-22 Worker Protocol and Timeline Packing

- Objective: typed dedicated worker with progress, result, validation, and runtime errors.
- Requirements traced: Sections 10.2, 10.3, 10.4, 21.1.
- In scope: worker protocol, transferable-friendly packed timeline.
- Out of scope: renderer interpolation.
- Dependencies: WP-03 through WP-21.
- Owned files: `src/workers`, timeline packing helpers.
- Interfaces: `SimulationWorkerRequest`, `SimulationWorkerResponse`.
- Acceptance tests: worker returns result and safe errors without freezing UI.
- Manual review: loading screen progress does not reveal winner.
- Risks and rollback: worker bundling quirks; keep protocol versioned.
- Done: app simulations run through the worker path.

## WP-23 Through WP-24 Setup Builder and Odds

- Objective: army builder, roles, loadout toggles, validation, warnings, seed controls, and deterministic vague odds.
- Requirements traced: Sections 8, 9, 21.1, 26.3.
- In scope: setup UI and independent odds estimator.
- Out of scope: exact win probabilities.
- Dependencies: WP-02, WP-03, WP-04.
- Owned files: `src/features/setup`, `src/simulation/odds.ts`.
- Interfaces: `BattleSetupDraft` to normalized setup.
- Acceptance tests: invalid armies blocked; odds labels never expose winner.
- Manual review: role/loadout/formation controls are usable.
- Risks and rollback: hidden winner leaks; test copy and DOM during loading.
- Done: complete setup flow is interactive.

## WP-25 Through WP-28 Renderer, Playback, Effects, Inspection, Dev Mode

- Objective: Three.js battlefield, procedural unit/terrain art, camera, speed controls, effects, corpses, wounds, selection, alerts, and dev overlay.
- Requirements traced: Sections 13, 14, 15, 19, 21.1, 26.3, 26.4.
- In scope: cosmetic playback faithful to timeline.
- Out of scope: authoritative state mutation.
- Dependencies: WP-22.
- Owned files: `src/render`, `src/features/battle`, `src/features/developer`.
- Interfaces: renderer consumes `BattleResult` and emits selected unit IDs/screenshots.
- Acceptance tests: Playwright flow and screenshot capture.
- Manual review: all terrains and unit silhouettes render nonblank.
- Risks and rollback: performance; use LOD and static corpse markers.
- Done: playback is watchable and controls work.

## WP-29 Report Aggregation

- Objective: reconciled detailed report with metric-backed contributing factors.
- Requirements traced: Section 16, 21.1, 26.1.
- In scope: report generation and UI.
- Out of scope: fabricated causality.
- Dependencies: WP-05 through WP-22.
- Owned files: `src/domain/report.ts`, `src/features/report`.
- Interfaces: `BattleReport` generated from authoritative metrics.
- Acceptance tests: totals reconcile with final states and events.
- Manual review: representative reports explain why without exact false certainty.
- Risks and rollback: double-counting; centralize aggregation.
- Done: report passes reconciliation tests.

## WP-30 Screenshot Capture

- Objective: local screenshot download only.
- Requirements traced: Sections 4.1, 21.1, 30.
- In scope: canvas capture and local download.
- Out of scope: cloud/social sharing or replay export.
- Dependencies: WP-25.
- Owned files: battle feature and renderer capture hook.
- Interfaces: `captureScreenshot(): string`.
- Acceptance tests: Playwright observes a download on screenshot.
- Manual review: image is not blank.
- Risks and rollback: browser canvas restrictions; use procedural local assets.
- Done: local screenshot works.

## WP-31 Content Pass, Sources, and Calibration

- Objective: all unit/loadout/formation data plus assumptions, sources, and calibration cases.
- Requirements traced: Sections 6, 11.16, 27, 28.
- In scope: representative assumptions and fixed seed suite.
- Out of scope: perfect prediction or balance-first tuning.
- Dependencies: WP-03 through WP-18.
- Owned files: data files and source/calibration docs.
- Interfaces: content IDs consumed by setup/simulation/renderer.
- Acceptance tests: all content validates; calibration scenarios run.
- Manual review: no trademarked pop-culture likenesses.
- Risks and rollback: overclaiming evidence; label abstractions clearly.
- Done: sources and assumptions are documented.

## WP-32 Through WP-35 Tests, Performance, Accessibility, Device Handling

- Objective: unit, integration, determinism, E2E, performance, baseline keyboard semantics, and unsupported-device handling.
- Requirements traced: Sections 18, 21, 26.
- In scope: Vitest, Playwright three-engine suites, performance samples.
- Out of scope: mobile 3D support guarantee.
- Dependencies: all implementation packages.
- Owned files: `src/**/*.test.ts`, `tests/**`, `scripts/performanceSample.ts`.
- Interfaces: npm validation scripts.
- Acceptance tests: Section 21.2 commands pass.
- Manual review: visual QA and performance notes.
- Risks and rollback: flaky browser tests; use deterministic seeds and stable selectors.
- Done: gates pass from a clean checkout.

## WP-36 Documentation, Asset Ledger, Pages

- Objective: finish required docs and third-party asset ledger.
- Requirements traced: Sections 2.3, 3.1, 21.3, 28.
- In scope: README, architecture, deployment, performance, limitations.
- Out of scope: actual Pages publication.
- Dependencies: implementation and validation evidence.
- Owned files: docs, README, `THIRD_PARTY_ASSETS.md`.
- Interfaces: documented commands and Pages settings.
- Acceptance tests: docs reference real scripts and evidence.
- Manual review: no unsupported claims.
- Risks and rollback: docs drift; update after final validation.
- Done: deployment-ready documentation is complete.

## WP-37 Final Adversarial Review and Release Candidate

- Objective: prove every acceptance criterion with current-state evidence.
- Requirements traced: Sections 21 and 29.
- In scope: clean install, full gates, visual review, completion report.
- Out of scope: external deployment.
- Dependencies: all packages.
- Owned files: `docs/release-validation.md`.
- Interfaces: final completion report.
- Acceptance tests: all Section 21.2 commands pass.
- Manual review: setup-to-report flow, all terrains/units, no stubs/TODOs.
- Risks and rollback: weak evidence; rerun targeted checks.
- Done: final report can truthfully claim complete v1.
