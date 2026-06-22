import { performance } from "node:perf_hooks";
import { loadContentRegistry } from "../src/domain/content";
import type { BattleSetupDraft, SquadDraft } from "../src/domain/battle";
import { normalizeBattleSetup } from "../src/simulation/normalizeSetup";
import { simulateBattle } from "../src/simulation/simulateBattle";

const registry = loadContentRegistry();

const squad = (
  id: string,
  unitTypeId: string,
  count: number,
  loadoutId: string,
  formationId: string,
  deploymentRole: SquadDraft["deploymentRole"],
): SquadDraft => ({
  id,
  unitTypeId,
  count,
  loadoutId,
  formationId,
  deploymentRole,
  toggles: registry.loadoutMap.get(loadoutId)?.toggles ?? {},
});

const scenarios: Array<{ name: string; setup: BattleSetupDraft }> = [
  {
    name: "20v20 baseline",
    setup: {
      seed: "perf-20",
      terrainId: "open_field",
      startingDistance: 100,
      armyA: {
        squads: [squad("A-roman", "roman_legionary", 20, "roman_standard", "shield_wall", "front")],
      },
      armyB: {
        squads: [
          squad(
            "B-army",
            "us_army_infantry",
            20,
            "army_rifleman_standard",
            "fireteam_spread",
            "support",
          ),
        ],
      },
    },
  },
  {
    name: "100v100 primary",
    setup: {
      seed: "perf-100",
      terrainId: "open_field",
      startingDistance: 150,
      armyA: {
        squads: [squad("A-samurai", "samurai", 100, "samurai_spear", "charge_group", "front")],
      },
      armyB: {
        squads: [
          squad(
            "B-army",
            "us_army_infantry",
            100,
            "army_rifleman_standard",
            "fireteam_spread",
            "support",
          ),
        ],
      },
    },
  },
  {
    name: "250-unit threshold",
    setup: {
      seed: "perf-250",
      terrainId: "rocky_hills",
      startingDistance: 80,
      armyA: { squads: [squad("A-wolves", "wolf", 180, "wolf_natural", "pack_spread", "flank")] },
      armyB: {
        squads: [
          squad(
            "B-marines",
            "us_marine",
            70,
            "marine_rifleman_standard",
            "assault_line",
            "support",
          ),
        ],
      },
    },
  },
  {
    name: "Dense urban",
    setup: {
      seed: "perf-urban",
      terrainId: "urban_blocks",
      startingDistance: 60,
      armyA: {
        squads: [squad("A-knights", "medieval_knight", 80, "knight_lance", "wedge", "front")],
      },
      armyB: {
        squads: [
          squad(
            "B-sof",
            "special_operations_soldier",
            24,
            "sof_standard",
            "defensive_overwatch",
            "support",
          ),
        ],
      },
    },
  },
  {
    name: "Forest blockers",
    setup: {
      seed: "perf-forest",
      terrainId: "forest",
      startingDistance: 70,
      armyA: { squads: [squad("A-wolves", "wolf", 120, "wolf_natural", "flank_left", "flank")] },
      armyB: {
        squads: [
          squad(
            "B-army",
            "us_army_infantry",
            45,
            "army_rifleman_standard",
            "defensive_line",
            "support",
          ),
        ],
      },
    },
  },
  {
    name: "Longer mixed battle",
    setup: {
      seed: "perf-long",
      terrainId: "rocky_hills",
      startingDistance: 200,
      armyA: {
        squads: [
          squad("A-elephants", "african_elephant", 4, "elephant_natural", "loose_herd", "front"),
          squad("A-romans", "roman_legionary", 60, "roman_standard", "shield_wall", "support"),
        ],
      },
      armyB: {
        squads: [
          squad("B-android", "combat_android", 16, "android_standard", "machine_line", "support"),
          squad(
            "B-armor",
            "powered_armor_champion",
            1,
            "powered_armor_standard",
            "rear_support",
            "support",
          ),
        ],
      },
    },
  },
];

for (const scenario of scenarios) {
  const normalized = normalizeBattleSetup(scenario.setup, registry);
  const started = performance.now();
  const result = simulateBattle(normalized, registry);
  const elapsed = performance.now() - started;
  console.log(
    JSON.stringify({
      scenario: scenario.name,
      units: result.finalUnits.length,
      terrain: result.report.terrain,
      simulatedDurationSeconds: result.timeline.duration,
      samples: result.timeline.samples.length,
      events: result.timeline.events.length,
      resultHash: result.resultHash,
      nodePrecomputeMs: Math.round(elapsed),
      outcome: result.outcome.kind,
    }),
  );
}
