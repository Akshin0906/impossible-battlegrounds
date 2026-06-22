import { describe, expect, it } from "vitest";
import type { ArmyId, BattleResult, BattleSetupDraft, SquadDraft } from "../../src/domain/battle";
import aiProfilesRaw from "../../src/data/aiProfiles.json";
import { CONTENT_VERSION } from "../../src/data/contentVersion";
import formationsRaw from "../../src/data/formations.json";
import loadoutsRaw from "../../src/data/loadouts.json";
import terrainsRaw from "../../src/data/terrains.json";
import unitsRaw from "../../src/data/units.json";
import weaponsRaw from "../../src/data/weapons.json";
import type { ContentRegistry } from "../../src/domain/content";
import { normalizeBattleSetup } from "../../src/simulation/normalizeSetup";
import { stableHash, stableStringify } from "../../src/simulation/resultHash";
import { simulateBattle } from "../../src/simulation/simulateBattle";

const MAX_DURATION_SECONDS = 1200;
const EXPECTED_EXTRA_AMMO_CARBINE_CAPACITY = 305;

type RegistryPatch = Partial<
  Pick<ContentRegistry, "units" | "weapons" | "loadouts" | "formations" | "terrains" | "aiProfiles">
>;

type SquadOverrides = Partial<Omit<SquadDraft, "toggles">> & {
  toggles?: SquadDraft["toggles"];
};

const buildMap = <T extends { id: string }>(items: T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]));

const createRegistry = (): ContentRegistry => {
  const units = unitsRaw as ContentRegistry["units"];
  const weapons = weaponsRaw as ContentRegistry["weapons"];
  const loadouts = loadoutsRaw as ContentRegistry["loadouts"];
  const formations = formationsRaw as ContentRegistry["formations"];
  const terrains = terrainsRaw as ContentRegistry["terrains"];
  const aiProfiles = aiProfilesRaw as ContentRegistry["aiProfiles"];
  const contentForHash = { units, weapons, loadouts, formations, terrains, aiProfiles };

  return {
    version: CONTENT_VERSION,
    hash: stableHash(stableStringify(contentForHash)),
    units,
    weapons,
    loadouts,
    formations,
    terrains,
    aiProfiles,
    unitMap: buildMap(units),
    weaponMap: buildMap(weapons),
    loadoutMap: buildMap(loadouts),
    formationMap: buildMap(formations),
    terrainMap: buildMap(terrains),
    aiProfileMap: buildMap(aiProfiles),
  };
};

const registry = createRegistry();

const rebuildRegistry = (patch: RegistryPatch): ContentRegistry => {
  const units = patch.units ?? registry.units;
  const weapons = patch.weapons ?? registry.weapons;
  const loadouts = patch.loadouts ?? registry.loadouts;
  const formations = patch.formations ?? registry.formations;
  const terrains = patch.terrains ?? registry.terrains;
  const aiProfiles = patch.aiProfiles ?? registry.aiProfiles;
  const contentForHash = { units, weapons, loadouts, formations, terrains, aiProfiles };

  return {
    ...registry,
    hash: stableHash(stableStringify(contentForHash)),
    units,
    weapons,
    loadouts,
    formations,
    terrains,
    aiProfiles,
    unitMap: buildMap(units),
    weaponMap: buildMap(weapons),
    loadoutMap: buildMap(loadouts),
    formationMap: buildMap(formations),
    terrainMap: buildMap(terrains),
    aiProfileMap: buildMap(aiProfiles),
  };
};

const infantrySquad = (id: string, overrides: SquadOverrides = {}): SquadDraft => {
  const base: SquadDraft = {
    id,
    unitTypeId: "us_army_infantry",
    count: 1,
    loadoutId: "army_rifleman_standard",
    formationId: "fireteam_spread",
    deploymentRole: "support",
    toggles: { grenades: true, extraAmmo: false, armor: "medium" },
  };
  return {
    ...base,
    ...overrides,
    toggles: { ...base.toggles, ...(overrides.toggles ?? {}) },
  };
};

const wolfSquad = (id: string, count = 1): SquadDraft => ({
  id,
  unitTypeId: "wolf",
  count,
  loadoutId: "wolf_natural",
  formationId: "direct_swarm",
  deploymentRole: "front",
  toggles: {},
});

const elephantSquad = (id: string, count: number): SquadDraft => ({
  id,
  unitTypeId: "african_elephant",
  count,
  loadoutId: "elephant_natural",
  formationId: "direct_line",
  deploymentRole: "front",
  toggles: {},
});

const warlordSquad = (id: string): SquadDraft => ({
  id,
  unitTypeId: "dark_space_warlord",
  count: 1,
  loadoutId: "warlord_fear",
  formationId: "solo_advance",
  deploymentRole: "front",
  toggles: {
    strongerFearAura: true,
    higherDeflection: false,
    slowerHeavier: false,
  },
});

const runBattle = (draft: BattleSetupDraft, content = registry): BattleResult =>
  simulateBattle(normalizeBattleSetup(draft, content), content);

const eventSignature = (result: BattleResult): string =>
  result.timeline.events
    .map((event) =>
      [
        event.time,
        event.tick,
        event.type,
        event.actorUnitId ?? "",
        event.targetUnitId ?? "",
        event.weaponId ?? "",
        event.damageCause ?? "",
        event.message ?? "",
      ].join(":"),
    )
    .join("\n");

const carbineCapacityForArmy = (result: BattleResult, armyId: ArmyId): number => {
  const carbineReport = result.report.armies[armyId].ammo.find(
    (entry) => entry.weaponId === "carbine",
  );
  const remaining = result.finalUnits
    .filter((unit) => unit.armyId === armyId)
    .reduce((total, unit) => total + (unit.ammo.carbine ?? 0), 0);
  return remaining + (carbineReport?.shotsFired ?? 0);
};

const extraAmmoToggleDraft = (extraAmmo: boolean): BattleSetupDraft => ({
  seed: "toggle-extra-ammo",
  terrainId: "open_field",
  startingDistance: 500,
  armyA: {
    squads: [infantrySquad("A-rifle", { toggles: { extraAmmo } })],
  },
  armyB: {
    squads: [wolfSquad("B-wolf")],
  },
});

const blockedLineOfSightDraft = (): BattleSetupDraft => ({
  seed: "stuck-check",
  terrainId: "urban_blocks",
  startingDistance: 500,
  armyA: {
    squads: [infantrySquad("A-hidden")],
  },
  armyB: {
    squads: [infantrySquad("B-hidden")],
  },
});

const hiddenIdentityDraft = (armyASquadId: string, armyBSquadId: string): BattleSetupDraft => ({
  seed: "hidden-id-check",
  terrainId: "open_field",
  startingDistance: 90,
  armyA: {
    squads: [
      infantrySquad(armyASquadId, {
        count: 4,
        loadoutId: "army_rifleman_no_grenades",
        toggles: { grenades: false },
      }),
    ],
  },
  armyB: {
    squads: [wolfSquad(armyBSquadId, 6)],
  },
});

const oneShotMirrorDraft = (): BattleSetupDraft => ({
  seed: "mirror-0",
  terrainId: "open_field",
  startingDistance: 10,
  armyA: {
    squads: [
      infantrySquad("A-mirror", {
        loadoutId: "army_rifleman_no_grenades",
        toggles: { grenades: false },
      }),
    ],
  },
  armyB: {
    squads: [
      infantrySquad("B-mirror", {
        loadoutId: "army_rifleman_no_grenades",
        toggles: { grenades: false },
      }),
    ],
  },
});

const oneShotMirrorRegistry = (): ContentRegistry =>
  rebuildRegistry({
    weapons: registry.weapons.map((weapon) =>
      weapon.id === "carbine"
        ? {
            ...weapon,
            damage: 10000,
            baseAccuracy: 10,
            rangeEffective: 500,
            rangeMax: 500,
            cooldown: 0.2,
          }
        : weapon,
    ),
  });

const moraleCollapseDraft = (): BattleSetupDraft => ({
  seed: "morale-collapse",
  terrainId: "open_field",
  startingDistance: 20,
  armyA: {
    squads: [warlordSquad("A-warlord")],
  },
  armyB: {
    squads: [
      infantrySquad("B-infantry", {
        count: 20,
        loadoutId: "army_rifleman_no_grenades",
        toggles: { grenades: false },
      }),
    ],
  },
});

const moraleCollapseRegistry = (): ContentRegistry =>
  rebuildRegistry({
    units: registry.units.map((unit) =>
      unit.id === "us_army_infantry"
        ? { ...unit, baseMorale: 20 }
        : unit.id === "dark_space_warlord"
          ? { ...unit, baseHealth: 5000 }
          : unit,
    ),
  });

const rangeReportDraft = (): BattleSetupDraft => ({
  seed: "range-report",
  terrainId: "open_field",
  startingDistance: 35,
  armyA: {
    squads: [elephantSquad("A-elephant", 2)],
  },
  armyB: {
    squads: [infantrySquad("B-infantry", { count: 60 })],
  },
});

const moraleCollapseAlerts = (result: BattleResult): Array<{ armyId: ArmyId; time: number }> =>
  result.timeline.events
    .filter(
      (event) =>
        event.type === "major_alert" &&
        event.message?.includes("morale collapse") &&
        event.armyId !== undefined,
    )
    .map((event) => ({ armyId: event.armyId!, time: event.time }));

describe("red-team simulation regressions", () => {
  it("applies per-squad loadout toggles to runtime weapon capacity", () => {
    const standard = runBattle(extraAmmoToggleDraft(false));
    const extraAmmo = runBattle(extraAmmoToggleDraft(true));
    const standardCapacity = carbineCapacityForArmy(standard, "A");
    const extraAmmoCapacity = carbineCapacityForArmy(extraAmmo, "A");

    expect(standard.normalizedSetup.armyA.squads[0]?.toggles.extraAmmo).toBe(false);
    expect(extraAmmo.normalizedSetup.armyA.squads[0]?.toggles.extraAmmo).toBe(true);
    expect(extraAmmoCapacity).toBe(EXPECTED_EXTRA_AMMO_CARBINE_CAPACITY);
    expect(extraAmmoCapacity).toBeGreaterThan(standardCapacity);
  });

  it("does not let blocked line-of-sight fights run until the maximum duration cap", () => {
    const result = runBattle(blockedLineOfSightDraft());

    expect(result.outcome.reason).not.toMatch(/Maximum simulated duration/i);
    expect(result.timeline.duration).toBeLessThan(MAX_DURATION_SECONDS);
  });

  it("keeps deterministic identity independent from hidden draft squad ids", () => {
    const first = runBattle(hiddenIdentityDraft("A-ui-random-1", "B-ui-random-1"));
    const second = runBattle(hiddenIdentityDraft("A-ui-random-2", "B-ui-random-2"));

    expect(second.normalizedSetup.setupHash).toBe(first.normalizedSetup.setupHash);
    expect(second.resultHash).toBe(first.resultHash);
    expect(second.timeline.unitIds).toEqual(first.timeline.unitIds);
    expect(eventSignature(second)).toBe(eventSignature(first));
  });

  it("treats mirrored same-tick lethal exchanges as mutual outcomes", () => {
    const result = runBattle(oneShotMirrorDraft(), oneShotMirrorRegistry());
    const deathEvents = result.timeline.events.filter((event) => event.type === "death");

    expect(result.outcome.kind).toBe("draw");
    expect(result.finalUnits.map((unit) => unit.healthState)).toEqual(["dead", "dead"]);
    expect(deathEvents.map((event) => event.targetUnitId).sort()).toEqual(
      [...result.timeline.unitIds].sort(),
    );
    expect(new Set(deathEvents.map((event) => event.time)).size).toBe(1);
  });

  it("keeps morale pressure from ending fights through collapse or routs", () => {
    const result = runBattle(moraleCollapseDraft(), moraleCollapseRegistry());
    const collapseAlerts = moraleCollapseAlerts(result);
    const routEvents = result.timeline.events.filter((event) => event.type === "rout");

    expect(collapseAlerts).toEqual([]);
    expect(routEvents).toEqual([]);
    expect(result.report.morale.armyCollapse).toBeUndefined();
    expect(result.report.morale.armyCollapses).toEqual([]);
    expect(result.report.morale.unitsRouted).toBe(0);
    expect(result.report.totalRouted).toBe(0);
    expect(result.report.armies.A.routed + result.report.armies.B.routed).toBe(0);
    expect(result.outcome.reason).toMatch(/no living units/i);
  });

  it("describes effective engagement range in report wording as distance, not an index", () => {
    const result = runBattle(rangeReportDraft());
    const rangeFactor = result.report.keyFactors.find((factor) =>
      factor.label.includes("effective-range"),
    );

    expect(rangeFactor).toBeDefined();
    expect(rangeFactor!.evidence).toMatch(/\bmeters?\b/i);
    expect(rangeFactor!.evidence).not.toMatch(/\bindex\b/i);
  });
});
