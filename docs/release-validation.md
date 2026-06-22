# Release Validation

This file records final validation evidence for Section 21 gates.

## Environment

- Date: 2026-06-22
- Workspace: `/Users/Apple/Documents/website`
- Browser automation: Playwright Chromium, Firefox, WebKit
- Build target: static GitHub Pages artifact under `/impossible-battlegrounds/`

## Command Evidence

| Gate                | Command                                            | Result                                                |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Install             | `npm ci`                                           | Passed; 255 packages installed, 0 vulnerabilities     |
| Format check        | `npm run format:check`                             | Passed                                                |
| Lint                | `npm run lint`                                     | Passed                                                |
| TypeScript          | `npm run typecheck`                                | Passed                                                |
| Vitest              | `npm run test`                                     | Passed; 1 file, 8 tests                               |
| Playwright Chromium | `npm run test:e2e:chromium` via `npm run validate` | Passed                                                |
| Playwright Firefox  | `npm run test:e2e:firefox` via `npm run validate`  | Passed                                                |
| Playwright WebKit   | `npm run test:e2e:webkit` via `npm run validate`   | Passed                                                |
| Pages build         | `npm run build:pages` via `npm run validate`       | Passed; `dist` built for `/impossible-battlegrounds/` |
| Performance sample  | `npm run perf:sample`                              | Passed; representative scenarios completed            |

## Determinism Corpus

| Scenario                                                | Seed     | Expected hash | Evidence                                                                              |
| ------------------------------------------------------- | -------- | ------------- | ------------------------------------------------------------------------------------- |
| Roman Legionary vs U.S. Army Infantry, open field, 100m | `481923` | `66adae9b`    | Vitest same-seed test and Playwright fixed-hash test across Chromium, Firefox, WebKit |

## Performance Sample Evidence

| Scenario            | Units | Terrain      | Simulated duration | Samples | Events | Hash       | Node precompute |
| ------------------- | ----- | ------------ | ------------------ | ------- | ------ | ---------- | --------------- |
| 20v20 baseline      | 40    | Open Field   | 25.4s              | 65      | 227    | `a8ec9934` | 27ms            |
| 100v100 primary     | 200   | Open Field   | 26.6s              | 68      | 1208   | `1d023c7a` | 90ms            |
| 250-unit threshold  | 250   | Rocky Hills  | 21.6s              | 55      | 896    | `1fd35f05` | 291ms           |
| Dense urban         | 104   | Urban Blocks | 27.4s              | 70      | 758    | `5b2bb839` | 46ms            |
| Forest blockers     | 165   | Forest       | 16.0s              | 41      | 509    | `762b5179` | 263ms           |
| Longer mixed battle | 81    | Rocky Hills  | 47.8s              | 121     | 638    | `c0543a28` | 104ms           |

## Manual Visual Review

- Open field renders with sparse rocks, tactical grid, and both deployed armies visible.
- Forest renders tree blockers and cover-heavy terrain.
- Urban blocks render building blockers and street-grid terrain.
- Rocky hills render rock cover and height variation.
- All 12 units have procedural low-poly silhouettes through shared humanoid, quadruped, elephant, warlord, powered armor, and android archetypes.
- Projectiles/tracers, explosions, corpses, blood pools, and wound markers are event-driven and visible during playback.
- Camera orbit, pan, zoom, and reset work in Playwright flow and manual smoke.
- Playback pause/play and 0.25x, 1x, 2x, 4x speed controls work in E2E.
- Unit inspection updates at current playback time and shows health, morale, ammo, wounds, action, and formation.
- Major alerts are filtered to `major_alert` events and do not show shot-by-shot spam.
- Screenshot download works in Chromium, Firefox, and WebKit E2E.
- Developer mode works with `?dev=true`; `~` toggling is implemented in app code.

## Low-Severity Limitations

- Vite reports one post-minification app chunk over 500 kB because Three.js is bundled into the app chunk. The built artifact is still under 1 MB total and no acceptance scenario failed.
- Automated WebKit passed as Safari-family coverage. A separate manual Safari.app smoke was not performed in this environment.
- Some deliberately high-lethality calibration/performance scenarios finish under one minute; the default Roman-vs-riflemen checkpoint runs 75 seconds and the model remains variable by terrain, range, force composition, ammo, and morale.

## Final Defect Review

Searches for unfinished `TODO`, `FIXME`, `stub`, `placeholder`, `fake`, `not implemented`, `Math.random`, and `console.log` found only specification/docs language, the intentional `Math.random` test scan, and the performance script output. No user-facing TODOs, fake controls, placeholder reports, obvious temporary assets, critical/high defects, or credential blockers remain known.
