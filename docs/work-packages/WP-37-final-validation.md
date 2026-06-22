# WP-37: Final Adversarial Review, Clean Validation, and Release Candidate

## Objective

Perform the final independent validation pass for the complete v1 release, prove Section 21 gates from a clean checkout, reconcile traceability evidence, and prepare the release-candidate report without relying on subagent summaries or partial demos.

## Requirements Traced to the Master Spec

- Section 21: all product acceptance, engineering quality gates, and deployment-ready requirements must be demonstrated.
- Section 24: highest-risk areas require special scrutiny: simulation believability, determinism, playback fidelity, terrain behavior, 100 vs. 100 performance, and non-balance-first tuning.
- Section 25: the lead must inspect diffs, run tests, repair defects, update traceability/docs, and checkpoint only passing states.
- Section 26: determinism, invariant, system, metamorphic, end-to-end, and manual/visual review coverage must be verified.
- Section 27: calibration and assumptions/source deliverables must be reviewed for evidence-informed claims.
- Section 29: final response must include release summary, tests, determinism evidence, performance observations, documentation/assets, limitations, commands, Pages setup, and defect confirmation.

## In-Scope

- Run clean-install validation from a clean checkout or clean working copy equivalent.
- Run required gates: `npm ci`, format check, lint, TypeScript typecheck, Vitest suite, Playwright Chromium/Firefox/WebKit suites, and production build with the GitHub Pages base path.
- Verify the primary setup -> simulate -> playback -> report flow has no uncaught console errors.
- Inspect the full product against Section 21 acceptance criteria.
- Verify fixed determinism corpus hashes match across Chromium, Firefox, and WebKit.
- Verify report totals reconcile with authoritative final states and event attribution.
- Perform manual visual review of all four terrains, all 12 unit silhouettes, wound/corpse/effect behavior, camera usability, alert density, UI overflow, and large-battle degradation.
- Record performance observations for representative 100 vs. 100 and large-warning scenarios.
- Update `docs/release-validation.md`, `docs/requirements-traceability.md`, and relevant checklist evidence.
- Produce the final release-candidate notes and identify any remaining low-severity limitations.

## Out-of-Scope

- Adding new features or expanding v1 scope.
- Publishing to GitHub Pages.
- Replacing earlier package ownership for substantial implementation repairs; defects should be fixed in the owning package or by an explicitly scoped final repair commit.
- Accepting unverifiable claims from subagents as evidence.
- Waiving locked requirements because validation is late in the schedule.

## Dependencies

- Depends on every implementation package WP-01 through WP-35.
- Depends on WP-36 for complete documentation, asset ledger, Pages instructions, and release checklist.
- Requires access to supported Playwright engines and a local environment capable of production build/preview.

## Owned Files / Integration Boundaries

- Owns: `docs/work-packages/WP-37-final-validation.md`.
- Expected implementation-phase ownership includes `docs/release-validation.md` final evidence sections.
- May update `docs/requirements-traceability.md` and `docs/decisions.md` only for final validation evidence, release-candidate decisions, and unresolved low-severity limitations.
- May touch implementation files only for narrowly scoped defect repairs after documenting the owning package and rerunning affected tests.

## Public Interfaces and Data Contracts

- Release-validation evidence must include: command, environment/browser, result, timestamp/date, relevant artifact path or hash, and failure notes if any.
- Acceptance trace rows must map each Section 21 product and quality gate to a pass/fail status and evidence.
- Determinism evidence must include normalized setup/corpus identity, seed(s), simulation version, data/content version, result hash, and browser engine.
- Performance evidence must include scenario setup, unit counts, terrain, browser, hardware/environment note, observed FPS or timing, and degradation behavior.

## Acceptance Tests

- Clean validation runs all required Section 21 commands successfully or records a blocking failure with exact reproduction steps.
- Playwright Chromium, Firefox, and WebKit determinism corpus hashes match for the same normalized setups, seeds, simulation version, and data version.
- Representative setup -> simulate -> playback -> report flow passes with no uncaught console errors and no winner leakage before report.
- Final report totals reconcile with authoritative state for the tested scenarios.
- Production build works under the configured GitHub Pages base path and local preview verifies asset paths/navigation.
- `docs/release-validation.md` contains the final evidence needed for the Section 29 completion report.

## Manual Review

- Inspect all four terrain types in playback and compare visible behavior to documented terrain effects.
- Inspect all 12 unit silhouettes and loadout/formation representations for non-placeholder, legal, low-poly presentation.
- Inspect corpses, blood pools, visible wounds, projectiles, melee effects, explosion effects, and alert density.
- Exercise camera orbit/reset, pause/play, 0.25x, 1x, 2x, 4x, skip-to-report, unit inspection, screenshot capture, and return-to-setup.
- Review docs, asset ledger, assumptions/sources, calibration, performance notes, controls, limitations, and Pages setup for final accuracy.
- Search for unfinished user-facing TODOs, fake controls, stubs, placeholder reports, and obvious temporary assets.

## Risks and Rollback

- Risk: final validation discovers a high-severity defect. Do not release; route the defect to the owning package, repair, and rerun affected plus final gates.
- Risk: cross-browser determinism fails late. Freeze feature changes, isolate the authoritative divergence, add a regression case, and rerun the full corpus.
- Risk: performance misses the 100 vs. 100 target. Apply scoped degradation/LOD fixes through the owning performance/rendering packages and rerun representative scenarios.
- Risk: documentation overstates completion. Roll back the claim, mark the traceability item blocked or failed, and keep the release candidate open.

## Definition of Done

- All Section 21 gates pass from clean validation, or release is explicitly blocked with documented reproduction.
- Manual and visual review is recorded.
- Traceability has pass/fail evidence for every required v1 acceptance area.
- Final validation docs support the Section 29 completion report.
- No critical/high defects, stubs, fake controls, placeholder reports, obvious temporary assets, or hidden credential blockers remain.
