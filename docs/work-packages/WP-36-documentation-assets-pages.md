# WP-36: Documentation, Asset Ledger, Pages Workflow, and Release Checklist

## Objective

Produce the repository documentation and deployment-support artifacts required for a deployment-ready v1 release, including the third-party asset ledger, GitHub Pages workflow documentation/configuration, and release checklist evidence expected before final validation.

## Requirements Traced to the Master Spec

- Section 2: the app must be static, GitHub Pages-compatible, reproducibly installable with `npm ci`, and require no backend, API key, or proprietary hosted service.
- Section 3: external assets require compatible licenses and complete ledger entries; final visuals must not include copied likenesses, logos, unclear-license assets, or obvious temporary placeholders.
- Section 21: the repository must include architecture, model, assumptions/sources, calibration, performance, asset-license, controls, limitations, and deployment documentation.
- Section 27: assumptions, sources, and calibration must distinguish sourced facts from normalized abstractions and document confidence.
- Section 28: required repository documentation includes README, architecture, simulation model, assumptions/sources, calibration, performance, third-party asset ledger, traceability, decision log, and final validation docs.
- Section 29: the final completion report must summarize documentation, assets/licenses, run/build commands, Pages setup, and known limitations.

## In-Scope

- Create or update release documentation required by Section 28.
- Create and maintain `THIRD_PARTY_ASSETS.md`, including explicit "no external assets used" status when applicable.
- Document generic archetype/legal-content notes and no-affiliation language.
- Document local development, test, build, preview, controls, developer mode, limitations, and non-goals.
- Document GitHub Pages base-path setup and workflow behavior.
- Add or update the GitHub Actions Pages workflow only if the corresponding implementation package has not already done so and ownership has been handed off.
- Create a release checklist that references Section 21 gates and links to evidence locations.
- Update requirements traceability and decision log entries for documentation and asset-license obligations.

## Out-of-Scope

- Implementing gameplay, simulation, renderer, UI controls, tests, or performance optimizations.
- Publishing the site to GitHub Pages.
- Adding external assets without license review.
- Rewriting implementation-package docs owned by other agents except to link, summarize, or align release documentation.
- Marking final release complete; WP-37 owns final adversarial validation.

## Dependencies

- Depends on WP-01 for final install/build/test commands and Pages base path behavior.
- Depends on WP-03, WP-04, WP-10 through WP-18, WP-21, WP-22, WP-25 through WP-35 for accurate architecture, model, controls, performance, calibration, and limitations content.
- Depends on WP-31 for final roster assumptions and source references.
- Must be substantially complete before WP-37.

## Owned Files / Integration Boundaries

- Owns: `docs/work-packages/WP-36-documentation-assets-pages.md`.
- Expected implementation-phase ownership includes:
  - `README.md`
  - `docs/architecture.md`
  - `docs/simulation-model.md`
  - `docs/assumptions-and-sources.md`
  - `docs/calibration.md`
  - `docs/performance.md`
  - `THIRD_PARTY_ASSETS.md`
  - release checklist content in `docs/release-validation.md` or an equivalent pre-final section.
- May update `docs/requirements-traceability.md` and `docs/decisions.md` only for documentation, asset, Pages, and release-checklist evidence.
- Coordinate before changing `.github/workflows/*`, `vite.config.*`, or package scripts because those are shared integration files.

## Public Interfaces and Data Contracts

- Asset ledger entries must include: asset title/name, creator, source URL or origin, license, required attribution, modifications, file path(s), and reviewer status.
- Documentation commands must match actual package scripts and expected Pages base-path behavior.
- Assumptions/sources entries must identify the claim supported, source title/link, confidence, and whether the value is sourced or normalized.
- Release checklist items must map to Section 21 quality gates and include command/evidence placeholders for WP-37.

## Acceptance Tests

- `README.md` explains product summary, prerequisites, install/run/test/build commands, controls, developer mode, Pages configuration, limitations, and non-goals.
- Required docs from Section 28 exist and are internally consistent with the final code behavior.
- `THIRD_PARTY_ASSETS.md` records all external assets or explicitly states that only procedural/local authored assets ship.
- GitHub Pages setup instructions and workflow documentation identify the built artifact and repository setting requirements.
- Documentation contains no claims of unsupported browser/device behavior, hidden backend dependency, online account requirement, or actual Pages publication.
- Traceability is updated for Sections 2, 3, 21, 27, 28, and 29 documentation obligations.

## Manual Review

- Follow README commands from a clean checkout or use WP-37 clean-install evidence when available.
- Inspect final visuals/assets against the ledger for missing license entries, copied likenesses, logos, or obvious temporary placeholders.
- Check all documentation links and filenames.
- Confirm limitations and non-goals match Section 22 and do not silently weaken required v1 behavior.
- Review Pages instructions against the actual workflow and Vite base path.

## Risks and Rollback

- Risk: docs drift from implementation. Roll back the inaccurate doc changes or update them after rerunning the relevant verification.
- Risk: an asset lacks a complete license trail. Remove or replace the asset and update the ledger before release.
- Risk: Pages workflow ownership conflicts with WP-01. Revert workflow edits and leave documented handoff notes for the owning package.
- Risk: release checklist claims evidence before WP-37 has run. Keep checklist items pending until verified.

## Definition of Done

- All Section 28 documentation artifacts exist.
- Asset ledger is complete and reviewed.
- Pages setup/build documentation is accurate and credential-free.
- Release checklist is ready for WP-37 final evidence.
- Traceability and decision logs reflect documentation and asset-license status.
