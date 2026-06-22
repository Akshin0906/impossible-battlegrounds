# Performance

## Target

The primary acceptance case is 100 vs. 100 units at approximately 30 FPS or better on a typical modern laptop browser. The simulator runs in a Web Worker in the app, and the renderer consumes packed timeline samples.

## Degradation Policy

- Below 250 units: normal detail target.
- 250+ units: warning and reduced distant detail allowed.
- 500+ units: strong warning and aggressive simplification allowed.
- 1000+ units: best effort only.

## Optimizations Present

- Dedicated simulation worker.
- Packed numeric timeline samples.
- Stable unit IDs and metadata arrays.
- Deterministic target candidate scan with line-of-sight filtering.
- Procedural low-poly geometry.
- Static corpse and blood markers rather than ragdoll physics.
- No React component per rendered unit.

## Sampling Command

```bash
npm run perf:sample
```

The script runs representative deterministic scenarios for:

- 20 vs. 20 baseline
- 100 vs. 100 primary case
- 250-unit warning threshold
- dense urban battle
- forest blocker battle
- longer mixed battle

Final validation records command output and browser playback observations in `docs/release-validation.md`.
