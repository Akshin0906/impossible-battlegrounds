# Architecture

## Boundaries

- `src/data` contains versioned JSON content and startup validation.
- `src/domain` contains shared data contracts for setup, content, timeline, units, and reports.
- `src/simulation` is the authoritative deterministic layer. It imports no React, Three.js, DOM, canvas, or renderer APIs.
- `src/workers` wraps the pure simulator in a typed protocol with progress, validation failure, runtime failure, and result messages.
- `src/render` consumes a finished timeline and renders cosmetic Three.js playback. It cannot alter result hashes or reports.
- `src/app` owns setup state, worker orchestration, playback UI, inspection, report, screenshot capture, and developer mode.

## Data Flow

```text
BattleSetupDraft
-> normalizeBattleSetup
-> simulationWorker
-> simulateBattle
-> BattleResult
-> BattleScene playback
-> BattleReport UI
```

The Web Worker is the only path used by the app to produce an authoritative battle. The React UI may display loading progress and consume the final result, but it never mutates authoritative state.

## Worker Protocol

The protocol is versioned in `src/workers/workerProtocol.ts` and supports:

- `start_simulation`
- `progress`
- `result`
- `validation_failure`
- `runtime_failure`

The loading screen uses vague progress steps and does not display the winner, exact probability, or result hash before playback/report.

## Timeline Representation

The timeline stores stable `unitIds`, `unitMeta`, event records, and packed numeric samples. Each unit sample uses a fixed stride:

```text
x, y, z, rotationY, health, morale, healthCode, moraleCode, actionCode, formationCohesion
```

Playback interpolates positions from these samples and renders shot, wound, death, explosion, blood, and corpse effects as cosmetic consequences of authoritative events.

## Determinism Strategy

- Authoritative code uses seeded integer PRNG streams from `src/simulation/rng.ts`.
- No `Math.random()` is allowed under `src/simulation`.
- Setup, content version/hash, final states, outcome, major events, and report totals feed the result hash.
- Stable unit indexes and squad IDs are assigned before simulation.
- Positions, timers, health, morale, and report metrics are quantized before hashing.

## Dependencies

The only runtime dependencies are React, Three.js, and lucide-react icons. The project uses Vite, TypeScript, Vitest, Playwright, ESLint, Prettier, and GitHub Actions as the locked development/deployment stack.
