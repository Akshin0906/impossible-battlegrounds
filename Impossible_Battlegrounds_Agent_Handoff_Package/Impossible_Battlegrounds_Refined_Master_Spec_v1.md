# Implementation Handoff Spec: _Impossible Battlegrounds_

**Version:** v1.0 owner-approved implementation contract  
**Release scope:** Complete 12-unit, four-terrain v1  
**Target platform:** GitHub Pages  
**Game type:** Browser-based 3D sandbox auto-battler  
**Core priority:** Evidence-informed, internally consistent simulation rather than balanced arcade combat  
**Primary loop:** Build armies → configure battlefield → precompute battle → watch playback → read detailed report → modify setup and retry

---

## 0. Document Authority and Verified Decisions

This document is the authoritative product and engineering contract for the first public release. The project owner explicitly approved the decisions below. The implementation agent must present them once as a final verification checklist before changing files, then wait for the owner to reply with the approval phrase specified in the companion coding-agent prompt. After approval, the agent must not reopen these decisions or pause for milestone approvals unless two locked requirements are genuinely incompatible.

### 0.1 Precedence

When instructions conflict, use this order:

1. The companion **Coding Agent Prompt** and its execution/approval rules.
2. The locked decisions in this section.
3. Explicit `MUST`, `MUST NOT`, and acceptance criteria in this specification.
4. Detailed feature descriptions and examples.
5. The implementation agent's documented engineering judgment.

Examples are illustrative unless marked as exact requirements. A requirement may not be silently removed, weakened, or replaced merely to make implementation or testing easier.

### 0.2 Owner-Verified Decisions

| ID   | Locked decision                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-01 | The finish line is the **complete 12-unit, four-terrain v1**, not only the Roman-versus-riflemen vertical slice. The vertical slice is an internal integration checkpoint.                                                                                                                                                                       |
| D-02 | Use **Vite, TypeScript strict mode, React, Three.js, an authoritative Web Worker, Vitest, Playwright, ESLint, Prettier, and GitHub Actions for GitHub Pages validation/deployment configuration**.                                                                                                                                               |
| D-03 | Primary support is desktop/laptop versions of current Chrome, Edge, Firefox, and Safari. Mobile setup/report screens are best effort; mobile 3D battle playback is not a release requirement. The primary performance case is 100 vs. 100 at approximately 30 FPS or better on a typical modern laptop.                                          |
| D-04 | “Accuracy-first” means an **evidence-informed, internally consistent abstraction**, not a claim of perfect prediction. Important assumptions, representative eras/equipment, normalized stat meanings, sources, confidence, and calibration cases must be documented. The agent may research and select representative assumptions autonomously. |
| D-05 | Determinism is strict: the same normalized setup, seed, simulation version, and data version must produce the same authoritative result hash in supported browser engines. Cosmetic rendering may vary.                                                                                                                                          |
| D-06 | Mixed armies use deterministic automatic deployment roles—**Front, Support, or Flank**—with sensible defaults and player overrides. Starting distance is measured between the closest opposing front lines. Locked victory, draw, and stalemate rules appear in Section 11.                                                                      |
| D-07 | Final visuals should be procedural low-poly art first. Compatible external assets are permitted only when their source and license are recorded. No copyrighted likenesses, copied costumes, logos, or unlicensed temporary assets may ship.                                                                                                     |
| D-08 | Gore remains **always on with no toggle**. v1 gore is limited to blood pools and visible wound effects; it must remain stylized and low-poly rather than photorealistic.                                                                                                                                                                         |
| D-09 | “Finished” means a **deployment-ready repository**. Actual publication to GitHub Pages is not required. All quality gates, documentation, and the Pages workflow/configuration must be present and passing.                                                                                                                                      |
| D-10 | After approval, the lead agent works autonomously: decompose, delegate, review diffs, test, repair, integrate, and continue through all milestones without asking for routine approval. If true subagents are unavailable, use the same compartmentalized workflow sequentially.                                                                 |

### 0.3 Release Terminology

In older examples, “MVP” means the complete v1 release described here. It does **not** authorize stopping at a prototype. A milestone, demo, placeholder, or vertical slice is not a finished release.

---

## 1. Product Summary

_Impossible Battlegrounds_ is a serious, realism-first army sandbox game where the player builds two opposing armies from historical units, modern military units, animals, and generic fiction-inspired archetypes. The player configures unit counts, loadouts, formations, terrain, and starting distance. The game then precomputes the battle outcome and plays it back in low-poly 3D.

The game should answer ridiculous what-if battles while still respecting realistic combat logic.

Example battles:

```text
100 Roman legionaries vs. 20 U.S. Army infantry
50 medieval knights vs. 5 grizzly bears
300 wolves vs. 10 Marines
100 samurai vs. 1 Powered Armor Champion
1 Dark Space Warlord vs. 200 Roman legionaries
```

The player does **not** control units during the fight. The player’s control happens before the battle through army composition, terrain, distance, loadout, and formation choices.

---

## 2. Platform, Toolchain, and Hosting Constraints

The project must be a static, deployment-ready GitHub Pages application with no backend or required online service.

### 2.1 Locked Toolchain

```text
Vite
TypeScript with strict mode enabled
React
Three.js
Dedicated Web Worker for authoritative simulation
Vitest for unit and integration tests
Playwright for browser and end-to-end tests
ESLint
Prettier
GitHub Actions for validation and GitHub Pages build/deployment configuration
```

Requirements:

- Commit the package lockfile.
- `npm ci` must produce a reproducible installation.
- The Vite base path must work for a repository subpath on GitHub Pages.
- Do not depend on server-side routing or rewrite rules.
- Do not require a backend, database, account, API key, or proprietary hosted service.
- Additional lightweight dependencies are allowed only when they reduce risk and are documented in the architecture notes.
- Rapier is **not** part of the initial stack. It may be added only when a documented cosmetic playback effect cannot reasonably be implemented otherwise. It must never influence authoritative simulation state, outcomes, hit detection, deaths, or reports.

### 2.2 Browser and Device Support

Required desktop/laptop targets:

```text
Current stable Chrome
Current stable Edge
Current stable Firefox
Current stable Safari
```

Automated tests must cover Playwright Chromium, Firefox, and WebKit. A manual Safari smoke test should be documented when the environment permits it.

Mobile behavior:

- Army setup and report screens should remain usable where practical.
- Mobile 3D battle playback is not a release requirement.
- Unsupported or underpowered devices should receive a clear message rather than a broken canvas.

### 2.3 GitHub Pages Deliverable

The repository must contain:

- A production build that works under a GitHub Pages repository base path.
- A GitHub Actions workflow capable of building and publishing the static artifact.
- Documentation for local development, production builds, and Pages setup.
- No requirement for the implementation agent to publish the site or possess repository credentials.

Assets must remain lightweight, reusable, and low-poly.

---

## 3. Legal, Content, and Asset Direction

The public roster must not include direct copyrighted or trademarked pop-culture characters, logos, copied costumes, names used as brand identifiers, or recognizable likenesses.

Use original generic fiction-inspired archetypes instead.

```text
Do not ship as built-in:
- Darth Vader
- Iron Man

Ship as original archetypes:
- Dark Space Warlord
- Powered Armor Champion
```

The fiction-inspired units must have original silhouettes, palettes, effects, ability presentation, and short lore descriptions. Renaming a recognizable character while retaining the same visual identity is not sufficient.

### 3.1 Asset Policy

- Prefer procedural low-poly figures, geometric weapons, reusable materials, and generated terrain props.
- External assets are permitted only under a compatible license such as CC0, CC BY, MIT, BSD, or another license reviewed and documented as compatible with the repository.
- Every external asset must be recorded in `THIRD_PARTY_ASSETS.md` with title, creator, source, license, modifications, and required attribution.
- Do not ship ripped, scraped, unclear-license, noncommercial-only, or attribution-missing assets.
- Temporary cubes or primitive placeholders are acceptable during development, but no obvious temporary asset may remain in the final release.
- Do not copy military insignia, entertainment logos, or protected fictional costume details.

The implementation repository must include a concise legal/content note explaining that the game uses generic archetypes and does not claim affiliation with real military organizations or entertainment properties.

---

## 4. Locked Product Requirements

### 4.1 Genre and Feel

| Area               | Requirement                                          |
| ------------------ | ---------------------------------------------------- |
| Genre              | Sandbox army auto-battler                            |
| Tone               | Serious                                              |
| Simulation style   | Accuracy-first                                       |
| Balance philosophy | Realistic outcomes over fair outcomes                |
| Player fantasy     | Ridiculous what-if battles and army-building sandbox |
| Player control     | Before battle only                                   |
| Battle result      | Precomputed before playback                          |
| Visual style       | Low-poly 3D tactical figures                         |
| Sound              | No sound in v1                                       |
| Gore               | Always on, no toggle                                 |
| Gore detail v1     | Blood pools and visible wounds only                  |
| Sharing            | Local screenshot capture/download only               |
| Saves              | No save system in v1                                 |

### 4.2 Battle Scale

Primary target:

```text
100 vs. 100 units
```

The game should allow larger or absurd battles, but show a performance warning.

Example warning:

```text
Warning: This battle has 850 units.
Large battles may simulate slowly or play back with reduced visual detail.
Recommended target: 100 vs. 100.
```

### 4.3 Battle Duration

Battle length should be variable based on:

```text
- Army size
- Terrain
- Starting distance
- Unit speed
- Weapon range
- Morale collapse
- Ammo exhaustion
```

Most normal battles should feel like they last approximately:

```text
1–4 minutes of playback time
```

Large battles may last longer.

### 4.4 Battle Visibility

Before playback:

```text
- Show a loading/simulation screen.
- Hide the actual winner.
- Show only vague pre-battle odds.
```

Allowed vague odds:

```text
Army A favored
Army B favored
Even matchup
Hopeless for Army A
Hopeless for Army B
Unstable / chaotic
```

Do **not** show exact probability percentages.

During playback:

```text
- Free orbit camera
- Pause
- Play
- Slow motion
- Fast-forward
- Major event alerts only
- Click unit to inspect current state
- Skip to report button
```

After playback:

```text
- Detailed report
- Winner
- Survivors
- Casualties by cause
- Ammo use
- Morale/rout events
- Key factors explaining why the winner won
```

---

## 5. Core Gameplay Loop

```text
1. Player opens game.
2. Player builds Army A.
3. Player builds Army B.
4. Player chooses terrain.
5. Player chooses starting distance.
6. Player chooses unit-specific formations.
7. Player chooses loadouts and small loadout toggles.
8. Player optionally enters or randomizes battle seed.
9. Game shows vague pre-battle odds.
10. Player starts battle.
11. Game precomputes battle.
12. Game loads 3D battlefield playback.
13. Player watches, pauses, speeds up, slows down, or skips.
14. Player inspects units during playback.
15. Battle ends.
16. Detailed report appears.
17. Player returns to setup and modifies armies.
```

---

## 6. v1 Release Roster

The complete v1 release must include **all 12 unit types** below.

### 6.1 Historical Units

#### 1. Roman Legionary

Role:

```text
Disciplined shield infantry
```

Core traits:

```text
- Strong formation cohesion
- Shield protection
- Short-range thrown pilum/javelin
- Strong melee in groups
- Weak against guns in open terrain
```

Default loadout:

```text
- Shield
- Gladius
- Pilum
- Light/medium armor
```

Formation presets:

```text
- Shield wall
- Line
- Column
```

---

#### 2. Medieval Knight

Role:

```text
Heavy melee shock unit
```

Core traits:

```text
- Strong armor against melee
- Powerful charge
- High melee damage
- Slower than light infantry
- Vulnerable to modern firearms before contact
```

Default loadout:

```text
- Sword
- Shield
- Heavy armor
```

Optional toggles:

```text
- Lance charge enabled
- Heavier armor
```

Formation presets:

```text
- Wedge
- Line
- Loose charge
```

---

#### 3. Samurai

Role:

```text
Elite historical melee/ranged hybrid
```

Core traits:

```text
- High melee skill
- Better individual combat than legionary
- Less formation-dependent than Romans
- Can have bow/spear variant
```

Default loadout:

```text
- Katana
- Light/medium armor
```

Optional toggles:

```text
- Bow enabled
- Spear enabled
```

Formation presets:

```text
- Loose line
- Skirmish spread
- Charge group
```

---

### 6.2 Modern Military Units

#### 4. U.S. Army Infantry

Role:

```text
Baseline modern rifle infantry
```

Core traits:

```text
- Strong ranged lethality
- Limited ammunition
- Basic cover seeking
- Vulnerable if swarmed in melee
- Uses grenades only when allies are not too close
```

Default loadout:

```text
- Carbine/rifle
- Body armor
- Limited magazines
```

Optional toggles:

```text
- Grenades on/off
- Extra ammo
- Armor light/medium/heavy
```

Formation presets:

```text
- Fireteam spread
- Defensive line
- Bounding advance
```

---

#### 5. U.S. Marine

Role:

```text
Aggressive modern rifle infantry
```

Core traits:

```text
- Slightly higher aggression than Army infantry
- Strong discipline
- Good ranged combat
- Basic cover seeking
```

Default loadout:

```text
- Rifle/carbine
- Body armor
- Limited magazines
```

Optional toggles:

```text
- Grenades on/off
- Extra ammo
- Armor light/medium/heavy
```

Formation presets:

```text
- Fireteam spread
- Assault line
- Defensive line
```

---

#### 6. Special Operations Soldier

Role:

```text
Elite modern infantry
```

Core traits:

```text
- High accuracy
- High awareness
- High morale
- Better cover usage
- Limited by small numbers and ammo
```

Default loadout:

```text
- Suppressed or standard rifle
- Sidearm
- Body armor
- Limited magazines
```

Optional toggles:

```text
- Grenades on/off
- Extra ammo
- Heavier armor
```

Formation presets:

```text
- Wide spread
- Stealth approach
- Defensive overwatch
```

---

### 6.3 Animals

#### 7. Wolf

Role:

```text
Fast pack predator
```

Core traits:

```text
- Fast movement
- Pack flanking
- Low durability
- Strong against isolated or routed units
- Weak against disciplined formations and firearms
```

Formation presets:

```text
- Pack spread
- Flank left
- Flank right
- Direct swarm
```

---

#### 8. Grizzly Bear

Role:

```text
Large shock predator
```

Core traits:

```text
- High durability
- Terrifying melee
- Morale shock at close range
- Vulnerable to concentrated gunfire
```

Formation presets:

```text
- Direct charge
- Scattered charge
```

---

#### 9. African Elephant

Role:

```text
Huge trampling unit
```

Core traits:

```text
- Massive size
- Trampling damage
- Strong morale shock
- Can panic or rampage
- Large target
- Vulnerable to concentrated modern fire
```

Formation presets:

```text
- Direct line
- Loose herd
- Scattered charge
```

---

### 6.4 Fiction-Inspired Generic Units

#### 10. Dark Space Warlord

Role:

```text
Elite supernatural melee commander
```

Core traits:

```text
- Energy blade
- Fear aura
- Projectile deflection chance
- Telekinetic throw
- Extremely dangerous in close quarters
- Can be overwhelmed by explosives, heavy fire, or large numbers
```

Default loadout:

```text
- Energy blade
- Telekinetic attack
```

Optional toggles:

```text
- Stronger fear aura
- Higher deflection
- Slower/heavier variant
```

Formation presets:

```text
- Solo advance
- Center spearhead
- Defensive stance
```

---

#### 11. Powered Armor Champion

Role:

```text
Flying armored weapons platform
```

Core traits:

```text
- Heavy armor
- Energy blasts
- Micro-missiles
- Short flight bursts
- Strong against infantry
- Limited by energy/ammo/cooldowns
```

Default loadout:

```text
- Energy blasters
- Micro-missiles
- Powered armor
```

Optional toggles:

```text
- More missiles
- More armor
- More mobility
```

Formation presets:

```text
- Solo hover
- Rear support
- Front assault
```

---

#### 12. Combat Android

Role:

```text
Synthetic rifle/melee hybrid
```

Core traits:

```text
- No morale
- High accuracy
- High durability
- Reliable under pressure
- Vulnerable to explosives and heavy melee damage
```

Default loadout:

```text
- Rifle
- Reinforced chassis
```

Optional toggles:

```text
- Heavy weapon
- Heavy armor
- Faster mobility
```

Formation presets:

```text
- Machine line
- Suppression spread
- Direct advance
```

---

## 7. Terrain Requirements

The complete v1 release must include all four terrain types.

### 7.1 Open Field

Purpose:

```text
Pure range and visibility test
```

Effects:

```text
- Long line of sight
- Minimal cover
- Modern firearms dominate
- Historical melee units suffer heavily before contact
- Animals are exposed while charging
```

Implementation:

```text
- Flat terrain
- Sparse obstacles
- Easiest terrain to implement first
```

---

### 7.2 Forest

Purpose:

```text
Broken visibility and ambush terrain
```

Effects:

```text
- Trees block line of sight
- Movement slowed
- Long-range accuracy reduced
- Wolves and melee units gain better closing chances
- Modern units use trees as cover
```

Implementation:

```text
- Procedural tree placement
- Tree colliders
- Line-of-sight blockers
- Cover nodes near large trees
```

---

### 7.3 Urban Blocks

Purpose:

```text
Close-quarters chaos
```

Effects:

```text
- Buildings block line of sight
- Alleys create sudden close-range encounters
- Modern units use corners and walls
- Explosives are more dangerous
- Friendly-fire risk from explosives increases
```

Implementation:

```text
- Simple low-poly building blocks
- Street grid
- Wall/cover nodes
- Doorways optional later, not required for v1
```

---

### 7.4 Rocky Hills

Purpose:

```text
Elevation, cover, and visibility variation
```

Effects:

```text
- High ground improves visibility and effective range
- Rocks provide cover
- Slopes slow movement
- Charge behavior becomes less reliable uphill
```

Implementation:

```text
- Low-poly height variation
- Rock obstacles
- Cover nodes
- Elevation modifier for visibility and range
```

---

## 8. Army Builder Requirements

### 8.1 Army Structure

Each army contains multiple squads.

Example:

```text
Army A
- 60 Roman Legionaries
- 20 Samurai
- 4 African Elephants

Army B
- 30 U.S. Army Infantry
- 10 Marines
- 1 Powered Armor Champion
```

The player should be able to add units in bulk, but the simulation should internally split large counts into squads.

Example:

```text
Player adds:
100 Roman Legionaries

Game internally creates:
10 squads of 10 Roman Legionaries
```

### 8.2 Army Builder UI

Each army panel needs:

```text
- Add squad button
- Unit type selector
- Count input
- Loadout selector
- Loadout toggles
- Formation selector
- Remove squad button
- Duplicate squad button
- Total unit count display
```

### 8.3 No Budget System

There is no point cost or balance budget in v1.

This is intentional.

The game is a sandbox, not a competitive strategy game.

---

## 9. Battle Setup Requirements

Battle setup screen must include:

```text
- Army A panel
- Army B panel
- Terrain selector
- Starting distance slider/input
- Seed field
- Randomize seed button
- Vague odds display
- Performance warning
- Start Battle button
```

### 9.1 Starting Distance

Starting distance should be player-configurable.

Suggested values:

```text
10 meters
25 meters
50 meters
100 meters
200 meters
300 meters
500 meters
```

Custom numeric input may be added later.

### 9.2 Seed and Determinism Identity

Every battle must have a seed.

Requirements:

```text
- A seed is generated automatically by default.
- The player can randomize the seed.
- The player can manually edit the seed.
- The setup is normalized before simulation and hashing.
- Same normalized setup + same seed + same simulation version + same data version
  must produce the same authoritative result hash across supported browser engines.
```

Every battle report and developer-mode view must include:

```text
seed
simulation version
content/data version or content hash
authoritative result hash
```

Cosmetic particle placement, camera interpolation, and other non-authoritative rendering may vary and must not be included in the result hash.

The authoritative simulation must never call `Math.random()`.

### 9.3 Vague Odds

Before battle, show one vague matchup assessment:

```text
Army A favored
Army B favored
Even matchup
Hopeless for Army A
Hopeless for Army B
Unstable / chaotic
```

Do not show exact percentages and do not reveal the actual precomputed winner.

The odds estimator must be independent of the authoritative battle result. It may use a documented heuristic or a small set of simplified sample simulations, but it must use separate derived RNG streams and may not inspect or translate the hidden winner. Given the same normalized setup and version, the displayed label must be deterministic.

The estimator should favor “Unstable / chaotic” when uncertainty is high, unusual fictional abilities dominate, or plausible outcomes vary substantially across sampled seeds.

---

## 10. Precomputed Simulation Architecture

### 10.1 Core Requirement

The battle must be calculated before playback.

The 3D battle view is a playback of the simulation timeline, not the live source of truth.

Required pipeline:

```text
BattleSetup
→ Simulation Precompute
→ BattleTimeline
→ 3D Playback
→ BattleReport
```

### 10.2 Web Worker Requirement

Run the authoritative simulation in a dedicated Web Worker so precomputation does not freeze the user interface.

The worker protocol must be typed and versioned. It must support:

```text
- start simulation
- progress updates
- successful result
- validation failure
- runtime failure with a user-safe message and developer detail
```

Suggested loading states:

```text
Preparing terrain...
Spawning armies...
Calculating navigation and line of sight...
Simulating battle...
Packing playback timeline...
Generating report...
```

The main thread may render loading progress, but it may not alter authoritative state.

### 10.3 Fixed Timestep and Timeline Sampling

Use a fixed authoritative simulation timestep:

```text
0.2 seconds per simulation tick
```

Use timeline keyframes at a tick-aligned interval:

```text
0.4 seconds between keyframes
```

Important actions between keyframes must use event records with tick indexes and, where needed, deterministic sub-tick offsets. Rate-of-fire, reloading, cooldown, bleeding, and movement accumulators must not depend on animation frames.

Do not serialize a complete JavaScript object graph for every unit at every keyframe. Use stable unit indexes, packed arrays or typed arrays where practical, changed-state masks/deltas, event records, and periodic keyframes. The implementation should support seeking and interpolation without making the renderer authoritative.

### 10.4 Simulation Outputs

The simulation must output:

```text
- Winner
- Full battle timeline
- Unit state snapshots
- Major event list
- Casualty list
- Wound list
- Ammo use
- Rout events
- Morale changes
- Formation break events
- Kill/cause attribution
- Final report data
```

---

### 10.5 Authoritative Determinism Contract

The following are mandatory:

- No `Math.random()` or wall-clock time in authoritative modules.
- Use a documented 32-bit integer PRNG with published test vectors in the repository.
- Derive independent streams from the root seed for terrain, deployment, AI decisions, combat, morale, wounds, and odds estimation.
- Stable iteration order is mandatory. Resolve ties by stable numeric unit/squad IDs.
- Never rely on object-key ordering, unstable sorting, renderer order, frame timing, or physics-engine callbacks.
- Use integer/fixed-point values or explicitly quantized numeric values for authoritative positions, angles, timers, health, morale, probabilities, and modifiers.
- Avoid transcendental functions in authoritative code unless inputs/outputs are quantized and cross-engine equality is proven by tests.
- Terrain generation and deployment are part of the authoritative seed contract.
- The result hash must cover the normalized setup, final unit states, outcome, major event sequence, report totals, simulation version, and data version.
- Playwright tests must compare hashes across Chromium, Firefox, and WebKit for a fixed corpus of battles.
- Rendering, particles, camera, and cosmetic corpse poses are outside the authoritative hash.

### 10.6 Module Boundary

The simulation package must be importable and testable without React, Three.js, DOM APIs, canvas APIs, or a browser renderer. No Three.js, React, or Rapier import may appear in authoritative simulation modules.

The preferred boundary is conceptually:

```ts
simulateBattle(setup: NormalizedBattleSetup, registry: ContentRegistry): BattleResult
```

The worker calls this pure simulation layer and transfers a packed result to the main thread. The renderer consumes the result but cannot feed state back into it.

---

## 11. Simulation Systems

### 11.1 Unit State

Health, morale, bleeding, and behavior are separate state dimensions. Do not use one mutually exclusive `status` field for all of them.

```ts
type HealthState = "healthy" | "wounded" | "critically_wounded" | "downed" | "dead";

type MoraleState = "steady" | "shaken" | "routing";
type BleedingState = "none" | "light" | "severe";

type UnitState = {
  index: number; // Stable deterministic numeric ID
  id: string; // Human-readable/debug ID
  armyId: "A" | "B";
  squadId: string;
  unitTypeId: string;

  position: QuantizedVec3;
  rotationY: number;
  velocity: QuantizedVec3;

  healthState: HealthState;
  moraleState: MoraleState;
  bleedingState: BleedingState;

  health: number;
  morale: number;
  stamina: number;
  suppression: number;

  ammo: Record<string, number>;
  currentWeaponId: string;

  wounds: WoundState[];
  targetUnitIndex?: number;
  currentAction: UnitAction;

  isInFormation: boolean;
  formationCohesion: number;

  timeDowned?: number;
  timeOfDeath?: number;
  deathCause?: DamageCause;
};
```

The UI may derive a single display label such as “Wounded and routing,” but the authoritative state dimensions must remain independent. Dead units cannot act. Downed units cannot attack or move. Routing units are alive but combat ineffective unless they recover under the locked morale rules.

### 11.2 Wound Model

Use health plus critical wounds.

Required wound locations:

```text
- Head
- Torso
- Left arm
- Right arm
- Left leg
- Right leg
```

Required wound effects:

```text
Head critical:
- Usually fatal or immediate downed state

Torso critical:
- High damage
- Bleeding risk

Arm wound:
- Reduces melee or ranged effectiveness

Leg wound:
- Reduces speed
- May cause unit to fall/down

Severe bleeding:
- Unit loses health over time
- May die after being downed
```

No medics or rescue behavior in v1.

### 11.3 Morale System

Units can rout.

Morale decreases from:

```text
- Nearby allies killed
- Squad casualties
- Being suppressed
- Being charged by terrifying units
- Being outnumbered nearby
- Formation breaking
- Taking wounds
- Being attacked from behind or flank
- Seeing large animals or supernatural units
```

Morale increases or stabilizes from:

```text
- Strong formation cohesion
- Nearby squadmates
- Invisible leadership stat
- Modern discipline/training
- Winning local engagement
```

Rout behavior:

```text
- Unit stops attacking
- Unit flees away from enemy concentration
- Unit may be killed while fleeing
- Routed units count as combat ineffective
```

### 11.4 Leadership/Cohesion

No visible commander units in v1.

Each squad has an invisible leadership/cohesion stat.

Effects:

```text
- Improves morale resistance
- Improves formation stability
- Improves response to casualties
- Helps units stay grouped
```

Example:

```ts
type SquadState = {
  id: string;
  armyId: "A" | "B";
  unitTypeId: string;
  formationId: string;
  leadership: number; // 0–100
  cohesion: number; // 0–100
  morale: number; // aggregate
  unitIds: string[];
};
```

### 11.5 Friendly Fire

Friendly fire applies only to explosives in v1.

Explosive effects:

```text
- Damage enemies in radius
- Damage allies in radius
- Suppress units in radius
- Cause morale shock
- Create blood/impact events for playback
```

Modern units should avoid throwing/launching explosives when allies are inside the danger radius, unless panic or poor visibility causes a mistake.

### 11.6 Ammo

Ammo is limited.

Each weapon must track:

```text
- Magazine size
- Ammo remaining
- Reload time
- Rate of fire
- Burst behavior
```

A modern unit that runs out of ammo should:

```text
- Switch to sidearm if available
- Fall back if enemy is closing
- Use melee only as last resort
- Rout if morale breaks
```

### 11.7 Ranged Combat

Ranged combat should be probability-based, not purely visual projectile collision.

Hit chance should account for:

```text
- Weapon base accuracy
- Shooter training
- Shooter morale
- Shooter wound penalties
- Range
- Target movement
- Target size
- Cover
- Visibility
- Suppression
- Elevation
- Formation density
```

Suggested formula shape:

```text
hitChance =
  weaponAccuracy
  × shooterTrainingModifier
  × moraleModifier
  × woundModifier
  × rangeModifier
  × visibilityModifier
  × coverModifier
  × targetMovementModifier
  × targetSizeModifier
  × suppressionModifier
  × elevationModifier
```

Clamp final hit chance:

```text
minimum: 0.01
maximum: 0.95
```

Do not make guns perfectly accurate. Stress, movement, visibility, cover, and target behavior matter.

### 11.8 Melee Combat

Melee outcome should account for:

```text
- Weapon reach
- Melee skill
- Armor
- Shield
- Formation support
- Fatigue
- Morale
- Wounds
- Charge momentum
- Outnumbering
```

Melee should be dangerous and fast once contact occurs.

Historical units should become far more dangerous if they successfully close distance against modern infantry.

### 11.9 Formation System

Use unit-specific formation presets.

Examples:

```text
Roman Legionary:
- Shield wall
- Line
- Column

Medieval Knight:
- Wedge
- Line
- Loose charge

Samurai:
- Loose line
- Skirmish spread
- Charge group

Modern Infantry:
- Fireteam spread
- Defensive line
- Bounding advance

Wolves:
- Pack spread
- Flank left
- Flank right
- Direct swarm
```

Formation effects:

```text
- Positioning
- Cohesion
- Movement speed
- Morale resistance
- Vulnerability to explosives
- Melee bonuses
- Ranged exposure
```

### 11.10 Modern Cover AI

Modern military units use basic cover seeking.

Required behaviors:

```text
- Find nearby cover node
- Prefer cover between self and enemy
- Fire from cover
- Reload behind cover when possible
- Fall back if melee enemies get too close
- Avoid explosive use near allies
```

Cover can be implemented as terrain-generated nodes.

Example cover node:

```ts
type CoverNode = {
  id: string;
  position: Vec3;
  normal: Vec3;
  coverQuality: number; // 0–1
  blocksLineOfSight: boolean;
};
```

### 11.11 Animal AI

Animals need animal-specific behavior.

Wolf:

```text
- Moves in packs
- Flanks isolated enemies
- Avoids dense shield formations when possible
- Attacks wounded/routed units preferentially
```

Grizzly bear:

```text
- Direct charge
- High fear effect
- Attacks nearest threatening unit
- Does not use tactics
```

Elephant:

```text
- Charges groups
- Deals trample damage
- Causes morale shock
- Can panic/rampage if heavily wounded
```

### 11.12 Fiction-Inspired AI

Dark Space Warlord:

```text
- Advances toward high-value enemy clusters
- Deflects some incoming projectiles
- Uses telekinetic throw on nearby targets
- Causes fear aura morale penalty
```

Powered Armor Champion:

```text
- Maintains range when possible
- Uses flight bursts to reposition
- Fires energy blasts at infantry
- Uses micro-missiles against clusters
- Limited by cooldowns/ammo/energy
```

Combat Android:

```text
- No morale
- Advances logically
- Prioritizes targets based on threat
- Continues fighting until disabled or destroyed
```

---

### 11.13 Navigation, Movement, and Crowd Handling

Use a deterministic two-dimensional navigation grid with separately sampled terrain height. Full three-dimensional navigation is not required.

Required behaviors:

- Static obstacle avoidance.
- Stable A\* or equivalent pathfinding with deterministic neighbor order and tie-breaking.
- Formation-slot following and regrouping.
- Local separation so units do not occupy the same space.
- Size-aware collision/clearance for humans, bears, elephants, and powered armor.
- Choke-point handling in forest and urban terrain.
- Slope costs on rocky hills.
- Corpses do not block authoritative movement in v1.
- Allied units may pass with a documented movement penalty; they may not teleport through blocked terrain.
- Powered Armor Champion flight bursts are discrete, deterministic reposition actions over valid destinations, not a second real-time 3D physics simulation.

### 11.14 Deterministic Army Deployment

Each squad has a deployment role:

```text
Front
Support
Flank
```

Requirements:

- Unit/loadout data provides a sensible default role.
- The army builder lets the player override the role per squad.
- The deployment algorithm places formations without overlap and remains deterministic for setup + seed.
- Front squads deploy closest to the opponent, Support squads behind them, and Flank squads toward deterministic left/right lanes.
- Multiple squads with the same role use stable ordering, unit size, formation footprint, and terrain constraints.
- If a formation cannot fit, the algorithm must use a documented deterministic fallback and surface a nonfatal setup warning.
- Starting distance means the horizontal distance between the closest opposing front lines after deployment—not army centers.

### 11.15 Battle Outcome and Termination Rules

```ts
type BattleOutcome =
  | { kind: "army_a_victory"; reason: string }
  | { kind: "army_b_victory"; reason: string }
  | { kind: "draw"; reason: string }
  | { kind: "stalemate"; reason: string };
```

Locked rules:

- An army loses when it has no combat-effective units.
- Dead, downed, bleeding-out units that cannot recover, and routing units are not combat effective.
- A routing unit may recover only when its morale rises above a documented data-driven recovery threshold and it is not under immediate suppression or fear pressure.
- Mutual elimination in the same authoritative tick is a draw.
- If neither surviving army has any viable means to damage, incapacitate, or rout the other, the result is a stalemate.
- The default maximum simulated duration is 1,200 seconds. Reaching it without a victory or draw produces a stalemate.
- Outcome evaluation occurs in a stable, documented order at the end of each tick.
- No hidden score or arbitrary “points remaining” tiebreaker may convert a stalemate into a victory.

### 11.16 Stat Semantics and Unit Assumptions

Use SI units where practical:

```text
distance: meters
time: seconds
speed: meters per second
rate of fire: rounds per minute plus deterministic scheduling
angles: documented quantized representation
```

Every normalized 0–100 or 0–1 field must have a written semantic definition and reference point. For example, `training`, `awareness`, `baseAccuracy`, `penetration`, armor values, fear, and suppression may not remain unexplained arbitrary numbers.

For each historical and modern unit, document:

```text
representative era/date range
equipment variant
training assumption
physical assumptions
important abstractions
source list
confidence level: low / medium / high
```

For each fictional unit, document a self-consistent capability contract including damage/energy scale, armor threshold, cooldowns, deflection limits, telekinetic constraints, and mobility limits. Fictional values must be clearly labeled as invented rather than researched.

---

## 12. Terrain and Line-of-Sight Simulation

### 12.1 Terrain Data

Each terrain should define:

```ts
type TerrainDefinition = {
  id: string;
  displayName: string;
  size: Vec2;
  movementModifier: number;
  visibilityModifier: number;
  coverDensity: number;
  obstacles: TerrainObstacle[];
  coverNodes: CoverNode[];
  spawnZones: SpawnZone[];
};
```

### 12.2 Obstacles

Obstacle requirements:

```text
- Block movement where appropriate
- Block line of sight where appropriate
- Provide cover where appropriate
```

Example:

```ts
type TerrainObstacle = {
  id: string;
  kind: "tree" | "rock" | "wall" | "building";
  position: Vec3;
  size: Vec3;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
  coverQuality: number;
};
```

### 12.3 Line of Sight

v1 line-of-sight may use a simplified deterministic model.

Suggested approach:

```text
- Use ray checks against terrain obstacles.
- Use visibility modifiers for dense terrain.
- Do not raycast every unit against every enemy every tick.
- Use spatial partitioning to reduce checks.
```

Optimization:

```text
- Divide battlefield into grid cells.
- Only check likely targets within detection range.
- Cache visibility results for short intervals.
```

---

## 13. Playback System

### 13.1 Timeline-Based Playback

The battle viewer plays back the precomputed timeline.

Required playback data:

```text
- Unit position snapshots
- Unit rotation snapshots
- Action events
- Shot events
- Hit events
- Wound events
- Death events
- Rout events
- Explosion events
- Formation break events
- Major alert events
```

### 13.2 Timeline Event Model

Example event:

```ts
type BattleEvent = {
  time: number;
  type:
    | "shot_fired"
    | "projectile_hit"
    | "melee_attack"
    | "wound"
    | "death"
    | "explosion"
    | "rout"
    | "formation_break"
    | "ammo_low"
    | "unit_down"
    | "bleed_out"
    | "major_alert";

  actorUnitId?: string;
  targetUnitId?: string;
  squadId?: string;
  armyId?: "A" | "B";
  position?: Vec3;
  weaponId?: string;
  damageCause?: DamageCause;
  message?: string;
};
```

### 13.3 Visual Requirements

The playback should show:

```text
- Low-poly 3D battlefield
- Low-poly tactical figures
- Visible weapons
- Visible projectiles or tracer-like effects
- Melee swings
- Explosions
- Units falling
- Blood pools
- Wound effects
- Corpses remaining on battlefield
- Simplified corpses after a while for performance
```

### 13.4 Corpse Handling

Corpses remain on the battlefield but are simplified over time.

Suggested behavior:

```text
0–10 seconds after death:
- Full fallen unit mesh
- Blood pool appears

10+ seconds:
- Reduce animation/physics
- Convert to static mesh

Large battle performance mode:
- Replace distant corpses with simple low-poly body markers
```

### 13.5 Camera

Use free orbit camera.

Required controls:

```text
- Rotate
- Pan
- Zoom
- Reset camera
- Follow selected unit optional later
```

Default camera:

```text
- Angled view over battlefield
- Both armies visible at start
```

### 13.6 Speed Controls

Required:

```text
- Pause
- Play
- Slow motion
- Fast-forward
```

Suggested values:

```text
0x pause
0.25x slow motion
1x normal
2x fast
4x very fast
```

### 13.7 Skip to Report

The player must be able to skip playback and go directly to the report.

---

## 14. Unit Inspection

The player can click an individual unit during playback.

The inspection panel should show that unit’s state at the current playback time.

Required fields:

```text
- Unit type
- Army
- Squad
- Status
- Health
- Morale
- Ammo
- Current weapon
- Wounds
- Current action
- Formation status
```

Do not use individual names.

Example:

```text
Unit: U.S. Army Infantry
Army: B
Squad: Infantry Squad 2
Status: Wounded
Health: 62 / 100
Morale: 48 / 100
Ammo: 83 rounds
Weapon: Carbine
Wounds: Left leg injury, light bleeding
Current action: Firing from cover
Formation: Fireteam spread
```

---

## 15. Major Alert System

During playback, show only major alerts.

Examples:

```text
Army A formation is breaking.
Army B infantry is low on ammunition.
Army A morale collapse.
Elephant rampage.
Powered Armor Champion missile strike.
Dark Space Warlord fear aura triggered a rout.
```

Do not spam every shot or wound in the live UI.

All details should still be available in the final report.

---

## 16. Battle Report Requirements

The final report must be detailed and explain why the winner won.

### 16.1 Required Summary

```text
Winner
Battle duration
Terrain
Starting distance
Seed
Total starting units
Total survivors
Total dead
Total wounded
Total routed
```

### 16.2 Casualties by Cause

Track categories:

```text
- Rifle fire
- Melee
- Explosion
- Trampling
- Energy weapon
- Telekinetic attack
- Bleed-out
- Rout/combat ineffective
```

### 16.3 Ammo Report

For modern and fiction-inspired ranged units:

```text
- Shots fired
- Hits
- Approximate hit rate
- Ammo remaining
- Reloads performed
- Explosives used
- Friendly casualties from explosives
```

### 16.4 Morale Report

Include:

```text
- First squad to rout
- Army morale collapse time, if any
- Units routed
- Formation break events
- Fear effects
```

### 16.5 Key Contributing Factors

The report must explain the outcome from recorded simulation metrics rather than generic winner-specific prose. Use the heading **“Key contributing factors”** to avoid overstating causal certainty.

Record and evaluate metrics including, where applicable:

```text
- Casualties before first melee contact
- Time with line-of-sight or effective-range advantage
- Average effective engagement range
- Time and shots fired from cover
- Local numerical superiority over time
- Formation cohesion over time
- Time and cause of first formation break
- Ammo exhaustion and low-ammo times
- Damage prevented by armor, shields, cover, or deflection
- Morale loss by source
- Suppression applied and received
- Damage and kills by weapon/damage category
- Flank/rear attacks
- Fear, trample, explosion, and special-ability effects
```

Select the most material factors using documented thresholds and include supporting values in the explanation.

Example:

```text
Key contributing factors for Army B:
- It maintained effective rifle range for the first 91 seconds.
- Army A lost 48% of its force before first melee contact.
- Open terrain provided clear lines of sight for 83% of Army B's firing time.
- Army A's first two formation breaks preceded its general morale collapse.
- Army B retained 34% of its rifle ammunition at battle end.
```

### 16.6 Detailed Example Report

```text
Winner: Army B

Battle Duration: 3m 42s
Terrain: Forest
Starting Distance: 80m
Seed: 481923

Starting Forces:
Army A: 120 units
Army B: 36 units

Survivors:
Army A: 14 / 120
Army B: 21 / 36

Casualties:
Rifle fire: 67
Melee: 18
Explosions: 6
Bleed-out: 4
Routed: 26

Ammo:
Army B fired 1,842 rifle rounds.
Army B used 7 grenades.
Army B caused 1 friendly casualty with explosives.
Army B average hit rate: 19%.

Morale:
Army A first squad routed at 1m 28s.
Army A general morale collapse at 2m 41s.
Army B had one squad drop below 35 morale but did not rout.

Key Factors:
- Forest terrain reduced long-range rifle effectiveness.
- Army A reached melee with 39 surviving units.
- Army B’s cover usage preserved enough riflemen to survive the melee phase.
- Army A morale collapsed after losing formation cohesion.
```

---

## 17. Repository Structure and Data Files

Use data-driven content for units, weapons, terrain, loadouts, formations, AI profiles, and tuning constants. Validate content at startup and in tests; invalid content must fail with actionable diagnostics.

Preferred structure:

```text
/src
  /app
    App.tsx
    routes.tsx
    appState.ts
  /domain
    battle.ts
    content.ts
    timeline.ts
    report.ts
  /simulation
    simulateBattle.ts
    rng.ts
    deterministicMath.ts
    resultHash.ts
    spatialGrid.ts
    navigation.ts
    deployment.ts
    targeting.ts
    lineOfSight.ts
    combatRanged.ts
    combatMelee.ts
    wounds.ts
    morale.ts
    outcomes.ts
    timelinePacking.ts
    /ai
  /workers
    simulationWorker.ts
    workerProtocol.ts
  /data
    units.json
    weapons.json
    formations.json
    terrains.json
    loadouts.json
    aiProfiles.json
    contentVersion.ts
    validateContent.ts
  /render
    BattleScene.ts
    camera.ts
    unitRenderer.ts
    terrainRenderer.ts
    effectsRenderer.ts
    timelinePlayer.ts
  /features
    /setup
    /loading
    /battle
    /report
    /developer
  /styles
  /test
/public
  /models
  /textures
  /icons
/docs
  architecture.md
  simulation-model.md
  assumptions-and-sources.md
  calibration.md
  performance.md
  deployment.md
THIRD_PARTY_ASSETS.md
README.md
```

Rules:

- Authoritative simulation code must not import React or Three.js.
- Data IDs are stable and migration-safe within v1.
- JSON examples below illustrate schema shape; final values require documented semantics and validation.
- Content data and simulation code must each have an explicit version used by reports and determinism hashes.

### 17.1 Unit Definition Example

```json
{
  "id": "roman_legionary",
  "displayName": "Roman Legionary",
  "category": "historical",
  "baseHealth": 100,
  "baseMorale": 75,
  "training": 70,
  "awareness": 45,
  "speed": 3.8,
  "size": 1.0,
  "armor": {
    "melee": 55,
    "ballistic": 5,
    "explosive": 10,
    "energy": 5
  },
  "traits": ["formation_disciplined", "shield_user", "short_range_thrower"],
  "allowedLoadouts": ["roman_standard"],
  "allowedFormations": ["shield_wall", "line", "column"],
  "aiProfile": "historical_formation"
}
```

### 17.2 Weapon Definition Example

```json
{
  "id": "carbine",
  "displayName": "Carbine",
  "type": "rifle",
  "damageType": "ballistic",
  "rangeEffective": 300,
  "rangeMax": 500,
  "magazineSize": 30,
  "defaultAmmo": 210,
  "reloadTime": 2.6,
  "fireRatePerMinute": 90,
  "baseAccuracy": 0.68,
  "penetration": 65,
  "suppression": 45,
  "isExplosive": false
}
```

### 17.3 Loadout Definition Example

```json
{
  "id": "army_rifleman_standard",
  "displayName": "Rifleman",
  "unitTypeId": "us_army_infantry",
  "weapons": ["carbine", "combat_knife"],
  "armorProfile": "modern_body_armor_medium",
  "toggles": {
    "grenades": true,
    "extraAmmo": false,
    "heavyArmor": false
  }
}
```

### 17.4 Formation Definition Example

```json
{
  "id": "shield_wall",
  "displayName": "Shield Wall",
  "allowedCategories": ["historical"],
  "spacing": 1.1,
  "widthPreference": "wide",
  "movementSpeedModifier": 0.75,
  "moraleModifier": 1.25,
  "frontDefenseModifier": 1.3,
  "flankVulnerabilityModifier": 1.2,
  "explosiveVulnerabilityModifier": 1.25
}
```

### 17.5 Battle Setup Example

```json
{
  "seed": "481923",
  "terrainId": "forest",
  "startingDistance": 80,
  "armyA": {
    "squads": [
      {
        "unitTypeId": "roman_legionary",
        "count": 100,
        "loadoutId": "roman_standard",
        "formationId": "shield_wall"
      },
      {
        "unitTypeId": "samurai",
        "count": 20,
        "loadoutId": "samurai_katana",
        "formationId": "loose_line"
      }
    ]
  },
  "armyB": {
    "squads": [
      {
        "unitTypeId": "us_army_infantry",
        "count": 30,
        "loadoutId": "army_rifleman_standard",
        "formationId": "fireteam_spread"
      }
    ]
  }
}
```

---

## 18. Performance Requirements

### 18.1 Supported Performance Envelope

Primary target:

```text
100 vs. 100 units
Approximately 30 FPS or better during normal 1x playback
Typical modern desktop/laptop browser and integrated or discrete modern GPU
```

The simulation must run in a Web Worker and keep the setup/loading interface responsive. Performance measurements, test hardware/environment, and known limits must be recorded in `docs/performance.md`.

Scale policy:

```text
Below 250 total units: normal detail target
250+ total units: mild warning; reduced distant detail allowed
500+ total units: strong warning; aggressive instancing/effect/corpse simplification allowed
1000+ total units: extreme warning; best effort only, not a guaranteed frame-rate target
```

The app may reject a setup only when it would exceed a documented hard safety limit needed to avoid browser failure. Such a limit must be significantly above the primary 100 vs. 100 case and clearly explained.

### 18.2 Required Optimization Techniques

Use, where applicable:

```text
- Spatial partitioning
- Stable target candidate limits
- Batched or instanced rendering
- Level-of-detail simplification for distant units
- Static corpse conversion
- Packed timeline data and transferable buffers
- Snapshot interpolation
- Event-driven effects
- Cached line-of-sight results with deterministic invalidation
- Web Worker simulation
- Object pooling for frequent cosmetic effects
```

Avoid:

```text
- Full ragdoll physics for every unit
- Per-frame or per-tick all-vs-all targeting checks
- One React component per rendered unit
- High-poly models
- Large texture packs
- Real-time physics as the source of truth
- Full object snapshots for every unit at every sample
```

### 18.3 Performance Acceptance

Before release, profile at least:

```text
- 20 vs. 20 baseline
- 100 vs. 100 primary case
- 250-unit reduced-detail threshold
- One dense urban battle
- One forest battle with many line-of-sight blockers
- One long battle near the expected 4-minute playback range
```

The final review must check frame pacing, worker duration, packed timeline size, peak memory behavior, draw calls, and long-task warnings. No primary acceptance scenario may crash, hang indefinitely, or make playback controls unusable.

---

## 19. Developer Mode

Include hidden developer mode.

Activation can be:

```text
Press ~
or
Add ?dev=true to URL
```

Developer mode should show:

```text
- Unit IDs
- Squad IDs
- Morale values
- Health values
- Current target
- Current action
- Hit rolls
- Cover values
- Line-of-sight debug rays
- Formation cohesion
- Pathfinding grid
- Seed
- Simulation tick
```

Developer mode is required because tuning realism will be difficult without visibility into the math.

---

## 20. v1 Implementation Milestones

### Milestone 1: Static App Skeleton

Deliver:

```text
- GitHub Pages-ready static site
- Basic UI shell
- Army A / Army B panels
- Terrain selector
- Starting distance selector
- Seed field
- Start battle button
```

Acceptance:

```text
User can configure a simple battle setup and press Start.
No simulation required yet.
```

---

### Milestone 2: Data-Driven Units

Deliver:

```text
- units.json
- weapons.json
- loadouts.json
- formations.json
- terrains.json
- UI reads from JSON
```

Acceptance:

```text
Changing unit data changes available UI options without code changes.
```

---

### Milestone 3: Basic Precomputed Simulation

Deliver:

```text
- Seeded PRNG
- Fixed timestep simulation
- Units move toward enemies
- Basic ranged attacks
- Basic melee attacks
- Health/death
- Simple winner detection
```

Acceptance:

```text
Roman Legionaries vs. U.S. Army Infantry produces a plausible precomputed winner.
Same seed and setup produces same result.
```

---

### Milestone 4: 3D Playback

Deliver:

```text
- Three.js scene
- Terrain rendering
- Low-poly unit placeholders
- Timeline playback
- Unit movement interpolation
- Basic firing/melee/death animations
- Pause/play/speed controls
```

Acceptance:

```text
Player can watch the precomputed battle in 3D.
```

---

### Milestone 5: Formations, Cover, and Terrain

Deliver:

```text
- Formation spawn layouts
- Formation cohesion
- Forest line-of-sight blockers
- Urban cover nodes
- Rocky hills elevation modifiers
- Modern cover-seeking behavior
```

Acceptance:

```text
Open field, forest, urban blocks, and rocky hills produce meaningfully different outcomes.
```

---

### Milestone 6: Morale, Rout, Ammo, Wounds

Deliver:

```text
- Limited ammo
- Reloading
- Morale
- Rout behavior
- Critical wounds
- Bleeding out
- Explosive friendly fire
```

Acceptance:

```text
Units can run out of ammo, rout, bleed out, and suffer wound effects.
Explosives can harm allies.
```

---

### Milestone 7: Full v1 Roster

Deliver all 12 units:

```text
- Roman Legionary
- Medieval Knight
- Samurai
- U.S. Army Infantry
- U.S. Marine
- Special Operations Soldier
- Wolf
- Grizzly Bear
- African Elephant
- Dark Space Warlord
- Powered Armor Champion
- Combat Android
```

Acceptance:

```text
Each unit has distinct behavior, stats, loadouts, and formation options.
```

---

### Milestone 8: Report and Dev Mode

Deliver:

```text
- Detailed final report
- Casualty breakdown
- Ammo breakdown
- Morale breakdown
- Key factors explanation
- Hidden dev mode
```

Acceptance:

```text
After battle, player can understand not just who won, but why.
Developer can inspect rolls, morale, line of sight, and unit states.
```

---

## 21. v1 Acceptance Criteria and Quality Gates

The complete v1 release is successful only when every applicable requirement below is demonstrated.

### 21.1 Product Acceptance

```text
- Builds and runs as a static GitHub Pages-compatible site.
- Allows building two mixed armies.
- Supports all 12 v1 unit types.
- Supports all four terrain types.
- Supports starting distance selection measured between front lines.
- Supports unit-specific formations and Front/Support/Flank deployment roles.
- Supports loadout presets plus required toggles.
- Uses editable/randomizable seeds.
- Shows deterministic vague pre-battle odds without revealing the winner.
- Precomputes the battle in a Web Worker before playback.
- Hides the winner until battle end unless the player skips to the report.
- Plays the authoritative timeline back in low-poly 3D.
- Provides free orbit camera and camera reset.
- Provides pause, play, 0.25x, 1x, 2x, and 4x controls.
- Allows unit inspection at the current playback time.
- Shows major alerts without shot-by-shot spam.
- Keeps corpses with required simplification behavior.
- Shows stylized blood pools and visible wounds, always on.
- Has no sound in v1.
- Has no persistent save system in v1.
- Provides local screenshot capture/download only; no social or cloud sharing.
- Produces a reconciled detailed final report.
- Produces metric-backed key contributing factors.
- Includes hidden developer mode.
```

### 21.2 Engineering Quality Gates

All of the following must pass from a clean checkout:

```text
npm ci
format check
lint
TypeScript typecheck
Vitest unit/integration suite
Playwright Chromium suite
Playwright Firefox suite
Playwright WebKit suite
production build with GitHub Pages base path
```

Additional gates:

- No critical or high-severity known defect remains.
- No unfinished user-facing TODO, fake control, stub system, placeholder report, or obvious temporary visual asset remains.
- No uncaught console error occurs in the primary setup → simulate → playback → report flow.
- Every control visible to the user works.
- Report totals reconcile with authoritative final states and event attribution.
- Dead/downed units never act; ammunition never becomes negative; events never reference invalid units.
- Simulation always terminates by victory, draw, stalemate, or maximum duration.
- Fixed determinism corpus hashes match across Chromium, Firefox, and WebKit.
- Playback final states and report outcome match the authoritative result.
- Production output contains no required secret, API key, or backend dependency.
- The repository includes architecture, model, assumptions/sources, calibration, performance, asset-license, controls, limitations, and deployment documentation.
- A final clean-install run and complete user-flow review are recorded in the completion report.

### 21.3 Deployment-Ready Definition

Actual publication is not required. “Deployment-ready” means:

- The production build succeeds under the configured repository base path.
- The GitHub Pages workflow is syntactically valid and references the built artifact correctly.
- README instructions explain required repository settings.
- Local preview verifies built asset paths and navigation.
- No credential-dependent step is necessary to inspect or test the repository.

---

## 22. Non-Goals for v1

Do **not** implement these in the first version:

```text
- Multiplayer
- Online accounts
- Backend server
- Cloud saves
- Campaign mode
- Unit unlocks
- Full custom unit creator
- Full custom loadout editor
- Drag-and-drop unit placement
- Full ragdoll physics for every unit
- Destructible buildings
- Sound effects
- Music
- Replay file export
- Battle setup sharing codes
- Gore toggle
- Exact pre-battle win probability
- Named individual soldiers
- Visible commanders
- Direct pop-culture character names or likenesses
```

---

## 23. Design Principles

### 23.1 Accuracy Over Balance

The game should not force fairness.

A modern rifle squad should usually destroy medieval melee troops in an open field. Historical or animal units should win only through realistic advantages such as:

```text
- Numbers
- Close starting distance
- Terrain
- Ambush-like visibility
- Morale effects
- Ammo exhaustion
- Formation discipline
- Swarming
```

### 23.2 Precompute First, Animate Second

The simulation result is authoritative.

The 3D visuals should represent the simulation, not determine it.

### 23.3 Data-Driven Expansion

Adding a new unit should usually require:

```text
- Unit JSON
- Weapon JSON
- Loadout JSON
- Formation options
- Model/icon assignment
- AI profile selection
```

Avoid hardcoding unit-specific logic unless necessary.

### 23.4 Serious Tone

The premise is ridiculous, but the game should present it seriously.

Avoid goofy UI language.

Use clear military/simulation language:

```text
- Casualties
- Rout
- Formation cohesion
- Ammunition
- Suppression
- Line of sight
- Cover
- Morale collapse
```

---

## 24. Implementation Strategy

The Roman Legionaries vs. U.S. Army Infantry battle on Open Field at 100 meters is the first end-to-end checkpoint:

```text
Army setup
Deterministic precompute
Packed timeline
3D playback
Final report
```

It is not the finish line. Once it passes, continue through every terrain, system, unit, quality gate, and acceptance criterion without waiting for routine approval.

The highest-risk areas are:

```text
1. Believable and inspectable authoritative simulation.
2. Strict cross-browser determinism.
3. Playback that faithfully represents the authoritative timeline.
4. Formation/navigation behavior in obstructed terrain.
5. Performance with 100 vs. 100 units.
6. Tuning without arbitrary matchup balancing.
```

Developer mode, determinism tests, report reconciliation, and calibration documentation are foundational work, not optional polish.

---

## 25. Mandatory Autonomous Work Decomposition

Before implementation, the lead agent must derive small dependency-ordered work-package specifications and store them in the repository, for example under `docs/work-packages/` or an equivalent project-management file.

Each work package must contain:

```text
ID and title
objective
requirements traced to this specification
explicit in-scope behavior
explicit out-of-scope behavior
dependencies
owned files/directories or integration boundaries
public interfaces and data contracts
acceptance tests
manual review steps
risks and rollback approach
definition of done
```

A work package should be narrow enough for one agent to implement and review without owning unrelated systems. Split it further when it combines more than one major concern.

### 25.1 Minimum Work-Package Map

The lead may refine or split this map, but may not omit its concerns:

```text
WP-00  Repository audit, owner-verification gate, traceability matrix
WP-01  Vite/React/TypeScript strict toolchain and GitHub Pages base-path build
WP-02  Application shell, screen state machine, error boundary, responsive setup/report layout
WP-03  Domain types, JSON schemas/validation, content registry, content version/hash
WP-04  Deterministic PRNG streams, quantized math, stable IDs, result hashing, test vectors
WP-05  Open-field terrain model, authoritative obstacle/grid primitives
WP-06  Formation footprints, squad splitting, deployment roles, deterministic placement
WP-07  Simulation tick loop, unit lifecycle, spatial partition, outcome termination
WP-08  Deterministic navigation, local separation, slopes, choke points
WP-09  Target acquisition, threat scoring, line of sight, visibility cache
WP-10  Ranged fire scheduling, accuracy model, projectiles-as-events, suppression
WP-11  Magazines, reloads, ammo exhaustion, sidearm/fallback behavior
WP-12  Melee reach, attacks, armor, shields, charge momentum, outnumbering
WP-13  Wounds, body locations, penalties, bleeding, downed/death transitions
WP-14  Morale, fear, cohesion, formation breaks, rout and recovery
WP-15  Grenades/explosions, danger checks, friendly fire, blast attribution
WP-16  Historical and modern AI profiles, including cover behavior
WP-17  Wolf, bear, and elephant AI/abilities
WP-18  Dark Space Warlord, Powered Armor Champion, and Combat Android AI/abilities
WP-19  Forest terrain, tree blockers, cover nodes, movement/visibility effects
WP-20  Urban terrain, street/block layout, walls/corners, cover nodes
WP-21  Rocky Hills terrain, height sampling, slopes, rocks, elevation effects
WP-22  Worker protocol, progress/error states, timeline packing and transfer
WP-23  Army builder, loadout/formation/role controls, validation and warnings
WP-24  Odds estimator using independent deterministic inputs
WP-25  Three.js scene, camera, lighting, procedural unit/terrain assets
WP-26  Timeline interpolation, action playback, speed controls, skip-to-report
WP-27  Shots, melee, explosions, falls, corpses, blood pools, wound visuals
WP-28  Unit picking/inspection, major alerts, hidden developer mode overlays
WP-29  Report aggregation, reconciliation, metric-backed contributing factors
WP-30  Local screenshot capture/download
WP-31  Full 12-unit and loadout/formation content pass with assumptions/sources
WP-32  Unit, integration, property/metamorphic, and cross-browser determinism tests
WP-33  End-to-end user-flow and winner-leakage tests
WP-34  Performance profiling, LOD/instancing, large-battle degradation modes
WP-35  Accessibility/baseline keyboard semantics and unsupported-device handling
WP-36  Documentation, third-party asset ledger, Pages workflow, release checklist
WP-37  Final adversarial review, clean-install validation, acceptance trace, release candidate
```

### 25.2 Subagent Assignment Rules

- Give each subagent only the relevant work-package spec and necessary interface contracts.
- Assign explicit file ownership. Avoid simultaneous edits to the same files.
- Reserve shared integration files for the lead agent or a dedicated integration task.
- Require subagents to report files changed, tests added/run, assumptions, and unresolved risks.
- A summary is not proof of completion; the lead must inspect the actual diff and tests.
- Reject or repair changes that weaken types, violate deterministic boundaries, bypass data validation, or satisfy only the happy path.
- Run targeted tests after each package and the broader suite after integration.
- Checkpoint only passing states. Do not stack known-broken work on top of other work.
- If a subagent fails, reduce the scope, improve the interface/spec, reassign, or implement the package directly.
- If subagents are unavailable, execute the same packages sequentially and perform a separate review pass before integration.

### 25.3 Autonomous Loop

After owner approval, repeat until Section 21 passes:

```text
select next unblocked work package
confirm its interfaces and tests
assign or implement it
inspect the diff
run targeted tests
perform manual/visual review when applicable
repair defects
run integration tests
update traceability and decision logs
checkpoint the passing state
continue
```

Do not pause merely because a milestone is complete. Do not ask the owner to choose routine implementation details already covered by this contract. Make the safest documented decision and continue.

The only acceptable human blockers after approval are:

```text
- unavailable credentials needed for an explicitly required external action
- an external service requiring the owner's direct action
- two genuinely incompatible locked requirements that cannot both be satisfied
```

Actual Pages publication is not required, so repository credentials are not a normal blocker.

---

## 26. Required Test Strategy

### 26.1 Determinism and Invariants

At minimum, automate tests for:

```text
- Same normalized setup/seed/version produces identical result hash.
- Determinism corpus matches across Chromium, Firefox, and WebKit.
- Different seeds can change stochastic event sequences while preserving validity.
- No Math.random reference exists in authoritative modules.
- Stable IDs and tie-breaking produce repeatable target/path choices.
- Dead and downed units never act.
- Ammo, health, morale, stamina, and timers remain within valid bounds.
- Every event references valid units/squads/weapons.
- Report totals reconcile without double-counting wounded, routed, downed, and dead states.
- Friendly fire is limited to explosives in v1.
- Simulation terminates under all generated valid setups tested.
- Renderer/playback state cannot alter the result hash.
```

### 26.2 System and Metamorphic Tests

Use scenario and property-style tests for directional behavior, without asserting simplistic balance outcomes:

```text
- Increasing open-field starting distance should not systematically help melee-only forces against otherwise identical rifle forces.
- Effective cover should reduce exposure and recorded unprotected firing time.
- A no-morale unit such as Combat Android never routes.
- Removing ammunition prevents additional ranged shots.
- Disabling grenades prevents grenade events and explosive friendly fire from that loadout.
- Stronger compatible armor should not increase expected incoming damage under controlled trials.
- A broken formation loses its documented cohesion benefits.
- Identical terrain seeds reproduce obstacles, cover nodes, and deployment.
- Stalemate is produced when neither side can affect the other.
```

Because battles are stochastic, calibration tests may assert ranges or aggregate directional relationships across a fixed seed suite rather than one exact winner—except the determinism corpus, which must assert exact hashes.

### 26.3 End-to-End Tests

Cover at least:

```text
- Build mixed armies, alter roles/loadouts/formations, and start a battle.
- Validation prevents empty or invalid armies.
- Loading progress appears without exposing the winner.
- Playback controls and camera controls operate.
- Unit inspection reflects the selected timeline time.
- Skip-to-report works.
- Final report matches authoritative outcome.
- Return-to-setup preserves the current in-memory setup for modification.
- Screenshot capture creates a local image.
- Developer mode activates by ~ and ?dev=true.
- Pages base-path build loads assets correctly.
- A representative battle runs in each of the three Playwright engines.
```

### 26.4 Manual and Visual Review

Automated tests do not replace visual review. The lead must inspect all four terrains, all 12 unit silhouettes, representative wounds/corpses/effects, camera usability, alert density, UI overflow, and large-battle degradation behavior.

---

## 27. Accuracy, Research, and Calibration Deliverables

Create and maintain:

```text
docs/simulation-model.md
docs/assumptions-and-sources.md
docs/calibration.md
```

Requirements:

- Prefer primary, official, academic, museum, military-manual, or otherwise reputable sources.
- Record source links/titles and the claim each source supports.
- Distinguish sourced physical values from normalized design abstractions.
- Document uncertainty and confidence rather than presenting invented precision as fact.
- Select representative eras and loadouts consistently; do not blend incompatible equipment without explanation.
- Do not tune every matchup toward 50/50 or equal entertainment value.
- Use a fixed seed suite for calibration so changes can be compared.
- Record expected qualitative or bounded outcomes for representative scenarios.
- When a tuning change intentionally changes a calibration result, document why.

The minimum calibration set must exercise:

```text
historical vs. modern at long and short range
historical formation vs. historical loose formation
modern infantry in open field vs. forest/urban cover
animals against isolated and cohesive targets
elephant morale/trample behavior
fictional projectile deflection and fear
powered armor range, missiles, armor, energy/cooldown limits
android no-morale behavior
ammo exhaustion
explosive friendly fire
stalemate and mutual elimination
```

---

## 28. Required Repository Documentation

The finished repository must include:

```text
README.md
- product summary
- prerequisites
- install/run/test/build commands
- controls
- developer mode
- Pages configuration
- limitations and non-goals

ARCHITECTURE / docs/architecture.md
- module boundaries
- worker protocol
- authoritative vs. cosmetic data flow
- timeline representation
- deterministic math/RNG/hash strategy

SIMULATION MODEL / docs/simulation-model.md
- stat semantics
- formulas and clamps
- state transitions
- outcome rules

ASSUMPTIONS AND SOURCES / docs/assumptions-and-sources.md
CALIBRATION / docs/calibration.md
PERFORMANCE / docs/performance.md
THIRD_PARTY_ASSETS.md
REQUIREMENTS TRACEABILITY / docs/requirements-traceability.md
DECISION LOG / docs/decisions.md
FINAL VALIDATION / docs/release-validation.md
```

---

## 29. Final Completion Report

The lead agent may declare completion only after independently reviewing the entire repository and satisfying Section 21. The final response must include:

```text
- concise release summary
- major architecture decisions
- complete feature checklist
- tests and commands run with outcomes
- cross-browser determinism evidence
- performance observations and test environment
- documentation produced
- third-party assets/licenses, if any
- known low-severity limitations
- exact local run/build commands
- GitHub Pages setup instructions
- confirmation that no critical/high defects, stubs, or hidden blockers remain
```

Do not call the project finished based solely on compilation, a screenshot, a partial demo, or a subagent's claim.

---

## 30. Explicitly Resolved Ambiguities

For implementation purposes, the following are settled:

```text
- Full v1, not the vertical slice, is mandatory.
- Cross-browser authoritative determinism is mandatory.
- Snapshot interval is 0.4 seconds, aligned to the 0.2-second tick.
- Health, morale, bleeding, and routing are independent state dimensions.
- Starting distance is measured between deployed front lines.
- Deployment roles are Front, Support, and Flank with player override.
- The default maximum simulated duration is 1,200 seconds.
- Inability to affect the opponent or reaching the duration cap produces stalemate.
- Odds do not read the hidden winner and use independent deterministic inputs.
- Powered armor flight is deterministic discrete repositioning, not authoritative rigid-body flight.
- Corpses do not block authoritative navigation in v1.
- Screenshot sharing means local image capture/download only.
- Gore is always on; there is no gore or reduced-effects toggle.
- Mobile 3D playback is not required.
- Rapier is excluded unless justified for cosmetic playback only.
- The repository must be deployment-ready; actual deployment is not required.
```
