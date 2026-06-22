# Decision Log

## D-2026-06-22-001 Owner Gate Accepted

- Decision: The owner replied with the exact required phrase, `APPROVED — BUILD FULL V1`.
- Rationale: Section 0 and the companion prompt require this before repository changes.
- Consequence: Routine milestone approval is no longer requested; implementation proceeds autonomously.

## D-2026-06-22-002 Static Single-Page App Without Router

- Decision: Use a screen state machine inside React instead of route-based navigation.
- Rationale: GitHub Pages static hosting and the setup-playback-report loop do not require server-side routing.
- Consequence: Pages subpath builds stay simple, and E2E tests exercise one static entry point.

## D-2026-06-22-003 Procedural Assets Only for v1

- Decision: Use procedural low-poly geometry and no external art assets.
- Rationale: The spec prefers procedural art and requires a complete license ledger for external assets.
- Consequence: `THIRD_PARTY_ASSETS.md` can state that runtime visual assets are generated in code.

## D-2026-06-22-004 Lightweight Determinism Hash

- Decision: Use stable canonical serialization plus FNV-1a-style integer hashing for authoritative result hashes.
- Rationale: The hash is for reproducible identity, not cryptographic integrity, and must match across browser engines.
- Consequence: Tests can assert exact corpus hashes in Node and Playwright.
