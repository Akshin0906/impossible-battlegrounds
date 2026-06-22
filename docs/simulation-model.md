# Simulation Model

## Scope

The simulator is an evidence-informed abstraction for ridiculous what-if battles. It uses SI-style units where practical and normalized values where direct physical modeling would overstate precision.

## Fixed Step

- Authoritative tick: `0.2` seconds.
- Timeline sample interval: `0.4` seconds.
- Maximum simulated duration: `1,200` seconds.
- Termination: Army A victory, Army B victory, draw, or stalemate.

## Unit State

Health, morale, and bleeding are independent dimensions.

- Dead and downed units cannot move or attack.
- Routing units are alive but combat ineffective.
- Combat Androids use the `no_morale` trait and do not rout.
- Downed units can later bleed out.

## Stats

- `baseHealth`: durability before wounds and armor effects.
- `baseMorale`: starting willingness to remain combat effective.
- `training`: weapon handling, melee skill, and stress resistance.
- `awareness`: target selection and threat response.
- `speed`: meters per second before terrain, formation, wounds, and armor modifiers.
- `armor`: normalized protection against melee, ballistic, explosive, and energy damage.
- `fear`: morale pressure caused at close range.
- `suppressionResistance`: resistance to combat stress and incoming fire.

Normalized fields are reference values, not exact measurements. `50` means competent baseline; values above `80` mean elite or extreme within the v1 roster.

## Ranged Combat

Ranged attacks are probability-based event records. Hit chance combines:

- weapon base accuracy
- shooter training
- shooter morale
- wound state
- range
- terrain visibility
- target cover
- target movement
- target size
- suppression
- elevation

The final chance is clamped to `0.01` through `0.95`. Guns are never perfectly accurate.

## Melee Combat

Melee attacks account for reach, damage, armor, formation cohesion, charge state, target size, morale, and wounds. Once contact occurs, damage is intentionally fast and dangerous.

## Ammo and Explosives

Weapons with magazines track remaining ammunition, magazine state, reload time, and cooldown. Explosive friendly fire is allowed only for explosive weapons. Modern units avoid explosives when allies are inside the blast radius unless stress or visibility creates a deterministic mistake.

## Wounds and Bleeding

Wounds can affect head, torso, left arm, right arm, left leg, or right leg. Torso and critical wounds can cause bleeding. Severe bleeding can kill downed units.

## Morale and Formations

Morale falls from damage, suppression, nearby fear, and formation breaks. Cohesive formations improve morale and defense until enough casualties or cohesion loss breaks them. Routed units flee away from enemy concentration and count as combat ineffective.

## Terrain

- Open field: sparse cover, long sight lines.
- Forest: tree blockers, movement penalty, reduced visibility.
- Urban blocks: building blockers, high cover density, close-range sight lines.
- Rocky hills: rocks, movement penalty, elevation modifiers.

Line of sight is a deterministic simplified obstacle check rather than physical projectile collision.

## Outcome Rules

An army loses when it has no combat-effective units. Mutual elimination in the same tick is a draw. If neither army can affect the other, or the maximum duration is reached, the result is a stalemate.
