# Calibration

Calibration uses fixed seed suites and qualitative bounds. The goal is internally consistent behavior, not 50/50 balance.

## Seed Suite

| Scenario                                | Seed                | Expected Qualitative Behavior                                                                        |
| --------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| Historical vs modern, long range        | `481923`            | Rifle infantry should usually defeat Roman legionaries in open field before sustained melee.         |
| Historical vs modern, short range       | `cal-short-modern`  | Short distance should materially improve melee closing chances.                                      |
| Historical formation vs loose formation | `cal-formation`     | Shield wall/cohesive line should resist morale loss better than loose charge under similar pressure. |
| Modern in forest/urban cover            | `cal-cover`         | Cover terrain should reduce unprotected firing time and improve modern survivability.                |
| Animals vs isolated targets             | `cal-wolves`        | Wolves should punish isolated or routed units more than cohesive shield formations.                  |
| Elephant trample and morale             | `cal-elephant`      | Elephants should cause fear/trample events but remain vulnerable to concentrated modern fire.        |
| Fictional deflection/fear               | `cal-warlord`       | Warlord should deflect some incoming fire and cause rout pressure, but not be invincible.            |
| Powered armor limits                    | `cal-powered-armor` | Missiles and energy ammunition/cooldowns should matter.                                              |
| Android no morale                       | `android-check`     | Combat Androids must never rout.                                                                     |
| Ammo exhaustion                         | `cal-ammo`          | Removing ammunition should prevent further ranged shots.                                             |
| Explosive friendly fire                 | `cal-friendly-fire` | Explosives may harm allies; non-explosives do not cause friendly fire.                               |
| Stalemate/mutual elimination            | `cal-stalemate`     | Locked outcome rules should produce draw or stalemate without hidden score tiebreakers.              |

## Current Fixed Corpus

The default checkpoint is Roman Legionaries vs. U.S. Army Infantry, open field, 100m, seed `481923`.

- Result hash: `66adae9b`
- Expected outcome: Army B victory
- Purpose: cross-browser determinism and winner-leakage tests

## Tuning Notes

- Modern rifle troops should dominate long open approaches.
- Forest and urban terrain should reduce long-range rifle advantage.
- Animals and historical units need numbers, proximity, terrain, or morale shock to overcome modern ranged fire.
- Fictional units are allowed to be extreme but must expose limits through ammunition, cooldown, deflection caps, or vulnerability to concentrated fire.
