# Impossible Battlegrounds

Impossible Battlegrounds is a static browser-based 3D sandbox auto-battler. The player builds two armies, selects terrain, distance, formations, loadouts, roles, and seed, then the app precomputes an authoritative deterministic battle in a Web Worker and plays back the resulting timeline in low-poly Three.js.

## Prerequisites

- Node.js 20 or newer
- npm

## Commands

```bash
npm ci
npm run dev
npm run build
npm run build:pages
npm run preview
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run perf:sample
```

## Controls

- Configure both armies from the setup screen.
- Use Front, Support, or Flank per squad to control deterministic deployment.
- Start battle to precompute the result before playback.
- Orbit, pan, and zoom with mouse or trackpad in the battle view.
- Use pause/play, 0.25x, 1x, 2x, and 4x playback controls.
- Click a unit to inspect its current timeline state.
- Use the camera button to download a local screenshot.
- Skip to report to bypass playback.

## Developer Mode

Developer mode is hidden behind `?dev=true` or the `~` key. It shows seed, simulation tick, result hash, and selected unit identity during playback.

## GitHub Pages

The app has no backend, accounts, API keys, or server routing. For a repository Pages path, run:

```bash
npm run build:pages
```

The workflow in `.github/workflows/pages.yml` validates the repo, builds the Pages artifact from `dist`, and can deploy from `main` when Pages is configured to use GitHub Actions.

## Limitations and Non-Goals

v1 intentionally excludes multiplayer, accounts, cloud saves, campaign mode, custom unit creation, drag-and-drop placement, sound, music, replay export, sharing codes, a gore toggle, exact pre-battle win percentages, named individual soldiers, visible commander units, destructible buildings, and direct pop-culture characters or likenesses. Mobile setup and report screens are best effort; mobile 3D playback is not a release requirement.

The simulation is evidence-informed and internally consistent, not a claim of perfect historical or military prediction.
