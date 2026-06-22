# WP-00: Repository Audit, Owner Gate, and Traceability

## Objective

Establish the implementation baseline before code work begins: verify the owner gate, audit the repository state, create the initial requirements traceability matrix, and define the project documentation/control logs that later work packages must maintain.

## Requirements Traced to the Master Spec

- Section 0: honor the owner-verified decisions and precedence rules before implementation.
- Section 21: completion requires passing clean-checkout gates, documentation, no critical/high defects, and recorded final evidence.
- Section 24: treat developer mode, determinism tests, report reconciliation, and calibration documentation as foundational.
- Section 25: derive small dependency-ordered work-package specs with explicit ownership, interfaces, tests, risks, and done criteria.
- Section 29: preserve enough evidence for the final completion report.

## In-Scope

- Print the locked owner-verification checklist and wait for the exact approval phrase before implementation begins.
- Inspect repository layout, package/tooling presence, git status, existing docs, source, tests, workflows, and assets.
- Create `docs/requirements-traceability.md` with IDs mapped to master-spec sections, work packages, status, evidence, and open risks.
- Create or initialize `docs/decisions.md` for implementation decisions not already locked by the master spec.
- Create an audit section or file capturing initial repository gaps, expected toolchain work, and immediate blockers.
- Confirm the dependency order and file ownership boundaries for the full WP-00 through WP-37 map.

## Out-of-Scope

- Implementing app source, package scripts, test suites, workflow files, or release documentation content beyond the initial audit/traceability scaffolding.
- Changing locked product decisions from Section 0.
- Resolving implementation defects found during the audit.
- Publishing to GitHub Pages or requiring repository credentials.

## Dependencies

- Requires the companion coding-agent prompt and refined master spec.
- Must complete before WP-01 and all implementation packages.
- Later packages depend on the traceability matrix and decision log conventions created here.

## Owned Files / Integration Boundaries

- Owns: `docs/work-packages/WP-00-repository-audit-and-traceability.md`.
- During implementation execution, this package may create and own initial versions of:
  - `docs/requirements-traceability.md`
  - `docs/decisions.md`
  - an audit entry within project documentation if the lead chooses one.
- Must not edit source, tests, package metadata, workflows, or release docs except through later dedicated work packages.
- Must record existing unowned changes and avoid reverting or overwriting them.

## Public Interfaces and Data Contracts

- Traceability matrix rows must include: requirement ID, source section, requirement summary, owning work package, implementation status, verification evidence, and unresolved risk.
- Decision log entries must include: date, decision, spec driver, alternatives considered briefly, and consequence.
- Work-package status must remain reviewable by future agents without requiring private context.

## Acceptance Tests

- The owner-verification checklist has been presented exactly once and approval captured before implementation edits.
- The repository audit records current layout, missing expected files, git status concerns, and initial risks.
- `docs/requirements-traceability.md` exists and maps all major Section 21, 25, 26, 27, and 28 obligations to one or more work packages.
- `docs/decisions.md` exists or the decision-log location is explicitly recorded.
- Every generated or refined work-package spec includes the required Section 25 fields.

## Manual Review

- Compare the traceability matrix against Sections 21, 25, 26, 27, and 28 for obvious omissions.
- Confirm no locked decision from Section 0 has been weakened or rephrased into an optional target.
- Confirm work-package ownership avoids overlapping writes to shared files.
- Review git diff to ensure only intended documentation scaffolding changed.

## Risks and Rollback

- Risk: traceability omissions can hide later implementation gaps. Roll back by restoring the previous traceability file and regenerating from the master spec.
- Risk: ownership boundaries may prove too broad once source layout exists. Update the affected work-package specs and decision log before assigning implementation.
- Risk: audit findings may become stale. Later packages must update traceability evidence when they close gaps.

## Definition of Done

- Owner approval is recorded.
- Initial audit, traceability matrix, and decision-log location are present.
- Work-package map is ready for dependency-ordered implementation.
- No source, tests, package metadata, or workflows were changed by this package.
