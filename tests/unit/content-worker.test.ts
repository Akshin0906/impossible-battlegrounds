import { describe, expect, it } from "vitest";
import type { BattleSetupDraft } from "../../src/domain/battle";
import { loadContentRegistry, type ContentRegistry } from "../../src/domain/content";
import { validateContentRegistry } from "../../src/data/validateContent";
import {
  normalizeBattleSetup,
  validateBattleSetupDraft,
} from "../../src/simulation/normalizeSetup";
import {
  handleSimulationWorkerRequest,
  type SimulationWorkerDependencies,
} from "../../src/workers/simulationWorker";
import {
  WORKER_PROTOCOL_VERSION,
  type SimulationWorkerRequest,
  type SimulationWorkerResponse,
} from "../../src/workers/workerProtocol";

const registry = loadContentRegistry();

type RegistryPatch = Partial<
  Pick<ContentRegistry, "units" | "weapons" | "loadouts" | "formations" | "terrains" | "aiProfiles">
>;

const rebuildRegistry = (patch: RegistryPatch): ContentRegistry => {
  const units = patch.units ?? registry.units;
  const weapons = patch.weapons ?? registry.weapons;
  const loadouts = patch.loadouts ?? registry.loadouts;
  const formations = patch.formations ?? registry.formations;
  const terrains = patch.terrains ?? registry.terrains;
  const aiProfiles = patch.aiProfiles ?? registry.aiProfiles;

  return {
    ...registry,
    units,
    weapons,
    loadouts,
    formations,
    terrains,
    aiProfiles,
    unitMap: new Map(units.map((unit) => [unit.id, unit])),
    weaponMap: new Map(weapons.map((weapon) => [weapon.id, weapon])),
    loadoutMap: new Map(loadouts.map((loadout) => [loadout.id, loadout])),
    formationMap: new Map(formations.map((formation) => [formation.id, formation])),
    terrainMap: new Map(terrains.map((terrain) => [terrain.id, terrain])),
    aiProfileMap: new Map(aiProfiles.map((profile) => [profile.id, profile])),
  };
};

const validDraft = (): BattleSetupDraft => ({
  seed: "worker-check",
  terrainId: "open_field",
  startingDistance: 90,
  armyA: {
    squads: [
      {
        id: "A-army",
        unitTypeId: "us_army_infantry",
        count: 4,
        loadoutId: "army_rifleman_standard",
        formationId: "fireteam_spread",
        deploymentRole: "support",
        toggles: { grenades: true, extraAmmo: false, armor: "medium" },
      },
    ],
  },
  armyB: {
    squads: [
      {
        id: "B-wolves",
        unitTypeId: "wolf",
        count: 4,
        loadoutId: "wolf_natural",
        formationId: "direct_swarm",
        deploymentRole: "front",
        toggles: {},
      },
    ],
  },
});

const makeRequest = (setup = validDraft()): SimulationWorkerRequest => ({
  protocolVersion: WORKER_PROTOCOL_VERSION,
  type: "start_simulation",
  requestId: "request-1",
  setup,
});

describe("content validation diagnostics", () => {
  const firstUnit = registry.units[0]!;
  const firstWeapon = registry.weapons[0]!;
  const firstLoadout = registry.loadouts[0]!;
  const firstFormation = registry.formations[0]!;
  const firstTerrain = registry.terrains[0]!;

  it.each([
    {
      name: "duplicate unit id",
      patch: () => ({ units: [...registry.units, { ...firstUnit }] }),
      expected: `units contains duplicate id '${firstUnit.id}'`,
    },
    {
      name: "empty weapon id",
      patch: () => ({ weapons: [{ ...firstWeapon, id: " " }, ...registry.weapons.slice(1)] }),
      expected: "weapons contains an empty id",
    },
    {
      name: "missing unit ai profile",
      patch: () => ({
        units: [{ ...firstUnit, aiProfile: "missing_ai_profile" }, ...registry.units.slice(1)],
      }),
      expected: `${firstUnit.id} references missing aiProfile 'missing_ai_profile'`,
    },
    {
      name: "nonpositive unit primitive",
      patch: () => ({ units: [{ ...firstUnit, baseHealth: 0 }, ...registry.units.slice(1)] }),
      expected: `${firstUnit.id} has nonpositive baseHealth, speed, or size`,
    },
    {
      name: "missing allowed loadout",
      patch: () => ({
        units: [{ ...firstUnit, allowedLoadouts: ["missing_loadout"] }, ...registry.units.slice(1)],
      }),
      expected: `${firstUnit.id} references missing loadout 'missing_loadout'`,
    },
    {
      name: "loadout assigned to another unit",
      patch: () => ({
        units: [{ ...firstUnit, allowedLoadouts: ["wolf_natural"] }, ...registry.units.slice(1)],
      }),
      expected: `${firstUnit.id} includes loadout 'wolf_natural' assigned to wolf`,
    },
    {
      name: "missing allowed formation",
      patch: () => ({
        units: [
          { ...firstUnit, allowedFormations: ["missing_formation"] },
          ...registry.units.slice(1),
        ],
      }),
      expected: `${firstUnit.id} references missing formation 'missing_formation'`,
    },
    {
      name: "loadout missing unit",
      patch: () => ({
        loadouts: [
          { ...firstLoadout, unitTypeId: "missing_unit_type" },
          ...registry.loadouts.slice(1),
        ],
      }),
      expected: `${firstLoadout.id} references missing unit 'missing_unit_type'`,
    },
    {
      name: "loadout missing weapon",
      patch: () => ({
        loadouts: [
          { ...firstLoadout, weapons: [...firstLoadout.weapons, "missing_weapon"] },
          ...registry.loadouts.slice(1),
        ],
      }),
      expected: `${firstLoadout.id} references missing weapon 'missing_weapon'`,
    },
    {
      name: "nonpositive formation spacing",
      patch: () => ({
        formations: [{ ...firstFormation, spacing: 0 }, ...registry.formations.slice(1)],
      }),
      expected: `${firstFormation.id} has nonpositive spacing`,
    },
    {
      name: "terrain invalid size",
      patch: () => ({
        terrains: [
          { ...firstTerrain, size: { ...firstTerrain.size, x: 0 } },
          ...registry.terrains.slice(1),
        ],
      }),
      expected: `${firstTerrain.id} has invalid size`,
    },
  ])("reports $name", ({ patch, expected }) => {
    expect(validateContentRegistry(rebuildRegistry(patch()))).toContain(expected);
  });
});

describe("simulation worker failure handling", () => {
  it("ignores messages for incompatible protocol versions", () => {
    const responses: SimulationWorkerResponse[] = [];
    const handled = handleSimulationWorkerRequest(
      { ...makeRequest(), protocolVersion: 999 as typeof WORKER_PROTOCOL_VERSION },
      (response) => responses.push(response),
    );

    expect(handled).toBe(false);
    expect(responses).toEqual([]);
  });

  it("posts validation diagnostics without running a simulation", () => {
    const responses: SimulationWorkerResponse[] = [];
    const handled = handleSimulationWorkerRequest(
      makeRequest({ ...validDraft(), seed: "", terrainId: "missing_terrain" }),
      (response) => responses.push(response),
    );

    expect(handled).toBe(true);
    expect(responses[0]).toMatchObject({ type: "progress", progress: 0.08 });
    expect(responses.at(-1)).toMatchObject({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: "validation_failure",
      requestId: "request-1",
      message: "Battle setup is invalid.",
      diagnostics: expect.arrayContaining([
        "Seed is required",
        "Unknown terrain 'missing_terrain'",
      ]),
    });
  });

  it("posts runtime failure details when simulation execution throws", () => {
    const responses: SimulationWorkerResponse[] = [];
    const dependencies: SimulationWorkerDependencies = {
      loadContentRegistry: () => registry,
      validateBattleSetupDraft,
      normalizeBattleSetup,
      simulateBattle: () => {
        throw new Error("forced simulation failure");
      },
    };

    const handled = handleSimulationWorkerRequest(
      makeRequest(),
      (response) => responses.push(response),
      dependencies,
    );

    expect(handled).toBe(true);
    expect(responses.map((response) => response.type)).toEqual([
      "progress",
      "progress",
      "progress",
      "progress",
      "runtime_failure",
    ]);
    const failure = responses.at(-1);
    expect(failure).toMatchObject({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: "runtime_failure",
      requestId: "request-1",
      message: "Simulation failed before a battle result could be produced.",
    });
    expect(failure?.type === "runtime_failure" ? failure.developerDetail : "").toContain(
      "Error: forced simulation failure",
    );
  });
});
