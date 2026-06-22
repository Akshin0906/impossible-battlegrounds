import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ArmyReport,
  BattleReport,
  BattleResult,
  BattleSetupDraft,
  UnitFinalState,
} from "../../src/domain/battle";
import { TIMELINE_STRIDE } from "../../src/domain/battle";
import { loadContentRegistry, type ContentRegistry } from "../../src/domain/content";
import { validateContentRegistry } from "../../src/data/validateContent";
import { normalizeBattleSetup } from "../../src/simulation/normalizeSetup";
import { simulateBattle } from "../../src/simulation/simulateBattle";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const registry = loadContentRegistry();

const REQUIRED_UNIT_IDS = [
  "roman_legionary",
  "medieval_knight",
  "samurai",
  "us_army_infantry",
  "us_marine",
  "special_operations_soldier",
  "wolf",
  "grizzly_bear",
  "african_elephant",
  "dark_space_warlord",
  "powered_armor_champion",
  "combat_android",
] as const;

const REQUIRED_TERRAIN_IDS = ["open_field", "forest", "urban_blocks", "rocky_hills"] as const;

const EXPECTED_RESULT_HASHES = {
  infantryVsWolvesAlpha: "27c872fc",
  infantryVsWolvesBeta: "a7301369",
  androidVsBears: "806ff47f",
} as const;

const infantryVsWolvesDraft = (
  seed: string,
  loadoutId: "army_rifleman_standard" | "army_rifleman_no_grenades" = "army_rifleman_standard",
): BattleSetupDraft => ({
  seed,
  terrainId: "open_field",
  startingDistance: 90,
  armyA: {
    squads: [
      {
        id: "A-army",
        unitTypeId: "us_army_infantry",
        count: 12,
        loadoutId,
        formationId: "fireteam_spread",
        deploymentRole: "support",
        toggles: {
          grenades: loadoutId !== "army_rifleman_no_grenades",
          extraAmmo: false,
          armor: "medium",
        },
      },
    ],
  },
  armyB: {
    squads: [
      {
        id: "B-wolves",
        unitTypeId: "wolf",
        count: 24,
        loadoutId: "wolf_natural",
        formationId: "direct_swarm",
        deploymentRole: "front",
        toggles: {},
      },
    ],
  },
});

const androidVsBearsDraft = (): BattleSetupDraft => ({
  seed: "android-check",
  terrainId: "urban_blocks",
  startingDistance: 70,
  armyA: {
    squads: [
      {
        id: "A-androids",
        unitTypeId: "combat_android",
        count: 6,
        loadoutId: "android_standard",
        formationId: "machine_line",
        deploymentRole: "support",
        toggles: { heavyWeapon: false, heavyArmor: false, fasterMobility: false },
      },
    ],
  },
  armyB: {
    squads: [
      {
        id: "B-bears",
        unitTypeId: "grizzly_bear",
        count: 6,
        loadoutId: "bear_natural",
        formationId: "direct_charge",
        deploymentRole: "front",
        toggles: {},
      },
    ],
  },
});

const runBattle = (draft: BattleSetupDraft): BattleResult => {
  const setup = normalizeBattleSetup(draft, registry);
  return simulateBattle(setup, registry);
};

const reportTotals = (report: BattleReport) => ({
  totalStartingUnits: report.totalStartingUnits,
  totalSurvivors: report.totalSurvivors,
  totalDead: report.totalDead,
  totalWounded: report.totalWounded,
  totalRouted: report.totalRouted,
  armies: {
    A: armyTotals(report.armies.A),
    B: armyTotals(report.armies.B),
  },
  moraleUnitsRouted: report.morale.unitsRouted,
});

const armyTotals = (army: ArmyReport) => ({
  startingUnits: army.startingUnits,
  survivors: army.survivors,
  dead: army.dead,
  wounded: army.wounded,
  routed: army.routed,
  downed: army.downed,
  casualtiesByCause: army.casualtiesByCause,
});

const isWounded = (unit: UnitFinalState): boolean =>
  unit.healthState === "wounded" || unit.healthState === "critically_wounded";

const countUnits = (units: UnitFinalState[]) => ({
  startingUnits: units.length,
  survivors: units.filter((unit) => unit.healthState !== "dead").length,
  dead: units.filter((unit) => unit.healthState === "dead").length,
  wounded: units.filter(isWounded).length,
  routed: units.filter((unit) => unit.moraleState === "routing").length,
  downed: units.filter((unit) => unit.healthState === "downed").length,
});

const expectArmyReportToReconcile = (armyReport: ArmyReport, units: UnitFinalState[]) => {
  const counts = countUnits(units);
  expect(armyReport.startingUnits).toBe(counts.startingUnits);
  expect(armyReport.survivors).toBe(counts.survivors);
  expect(armyReport.dead).toBe(counts.dead);
  expect(armyReport.wounded).toBe(counts.wounded);
  expect(armyReport.routed).toBe(counts.routed);
  expect(armyReport.downed).toBe(counts.downed);

  const expectedCasualtiesByCause = Object.fromEntries(
    Object.keys(armyReport.casualtiesByCause).map((cause) => [cause, 0]),
  ) as Record<string, number>;
  for (const unit of units) {
    if (unit.healthState === "dead" && unit.deathCause) {
      expectedCasualtiesByCause[unit.deathCause] += 1;
    }
    if (unit.moraleState === "routing" && unit.healthState !== "dead") {
      expectedCasualtiesByCause.rout_combat_ineffective += 1;
    }
  }
  expect(armyReport.casualtiesByCause).toEqual(expectedCasualtiesByCause);
};

const expectReportToReconcile = (result: BattleResult) => {
  const counts = countUnits(result.finalUnits);
  expect(result.report.totalStartingUnits).toBe(counts.startingUnits);
  expect(result.report.totalSurvivors).toBe(counts.survivors);
  expect(result.report.totalDead).toBe(counts.dead);
  expect(result.report.totalWounded).toBe(counts.wounded);
  expect(result.report.totalRouted).toBe(counts.routed);
  expect(result.report.morale.unitsRouted).toBe(counts.routed);

  expectArmyReportToReconcile(
    result.report.armies.A,
    result.finalUnits.filter((unit) => unit.armyId === "A"),
  );
  expectArmyReportToReconcile(
    result.report.armies.B,
    result.finalUnits.filter((unit) => unit.armyId === "B"),
  );
};

const expectCoreInvariants = (result: BattleResult) => {
  expect(result.report.resultHash).toBe(result.resultHash);
  expect(result.report.seed).toBe(result.normalizedSetup.seed);
  expect(result.report.contentHash).toBe(registry.hash);
  expect(result.timeline.unitIds).toEqual(result.finalUnits.map((unit) => unit.id));
  expect(result.timeline.unitMeta).toHaveLength(result.finalUnits.length);
  expect(result.timeline.samples.length).toBeGreaterThan(0);
  expect(result.timeline.samples.at(-1)?.time).toBe(result.timeline.duration);
  for (const sample of result.timeline.samples) {
    expect(sample.unitState).toHaveLength(result.finalUnits.length * TIMELINE_STRIDE);
  }
  expectReportToReconcile(result);
};

const listSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(absolutePath);
    }
    return [".ts", ".tsx", ".js", ".jsx"].includes(extname(entry.name)) ? [absolutePath] : [];
  });

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

describe("simulation core verification", () => {
  it("registers the required units and terrains", () => {
    expect(registry.units.map((unit) => unit.id).sort()).toEqual([...REQUIRED_UNIT_IDS].sort());
    expect(registry.terrains.map((terrain) => terrain.id).sort()).toEqual(
      [...REQUIRED_TERRAIN_IDS].sort(),
    );
  });

  it("reports a targeted invalid content reference", () => {
    const invalidLoadouts = registry.loadouts.map((loadout) =>
      loadout.id === "army_rifleman_no_grenades"
        ? { ...loadout, weapons: [...loadout.weapons, "missing_test_weapon"] }
        : loadout,
    );
    const invalidRegistry: ContentRegistry = {
      ...registry,
      loadouts: invalidLoadouts,
      loadoutMap: new Map(invalidLoadouts.map((loadout) => [loadout.id, loadout])),
    };

    expect(validateContentRegistry(invalidRegistry)).toContain(
      "army_rifleman_no_grenades references missing weapon 'missing_test_weapon'",
    );
  });

  it("produces identical hashes and report totals for the same normalized setup and seed", () => {
    const setup = normalizeBattleSetup(infantryVsWolvesDraft("verify-alpha"), registry);
    const first = simulateBattle(setup, registry);
    const second = simulateBattle(setup, registry);

    expect(second.normalizedSetup).toEqual(first.normalizedSetup);
    expect(second.resultHash).toBe(first.resultHash);
    expect(first.resultHash).toBe(EXPECTED_RESULT_HASHES.infantryVsWolvesAlpha);
    expect(reportTotals(second.report)).toEqual(reportTotals(first.report));
  });

  it("lets a different seed change representative battle events or hash while preserving invariants", () => {
    const alpha = runBattle(infantryVsWolvesDraft("verify-alpha"));
    const beta = runBattle(infantryVsWolvesDraft("verify-beta"));

    expectCoreInvariants(alpha);
    expectCoreInvariants(beta);
    expect(alpha.resultHash).toBe(EXPECTED_RESULT_HASHES.infantryVsWolvesAlpha);
    expect(beta.resultHash).toBe(EXPECTED_RESULT_HASHES.infantryVsWolvesBeta);
    expect(
      alpha.resultHash !== beta.resultHash || eventSignature(alpha) !== eventSignature(beta),
    ).toBe(true);
  });

  it("does not reference Math.random in the simulation source tree", () => {
    const offenders = listSourceFiles(join(repoRoot, "src", "simulation")).flatMap((filePath) =>
      readFileSync(filePath, "utf8").includes("Math.random") ? [relative(repoRoot, filePath)] : [],
    );

    expect(offenders).toEqual([]);
  });

  it("reconciles report totals with final unit states", () => {
    expectReportToReconcile(runBattle(infantryVsWolvesDraft("verify-alpha")));
  });

  it("keeps Combat Android units from routing in a representative battle", () => {
    const result = runBattle(androidVsBearsDraft());
    const androidIds = new Set(
      result.finalUnits
        .filter((unit) => unit.unitTypeId === "combat_android")
        .map((unit) => unit.id),
    );

    expect(androidIds.size).toBeGreaterThan(0);
    expect(result.resultHash).toBe(EXPECTED_RESULT_HASHES.androidVsBears);
    expect(
      result.finalUnits
        .filter((unit) => unit.unitTypeId === "combat_android")
        .map((unit) => unit.moraleState),
    ).not.toContain("routing");
    expect(
      result.timeline.events.filter(
        (event) => event.type === "rout" && event.actorUnitId && androidIds.has(event.actorUnitId),
      ),
    ).toEqual([]);
  });

  it("prevents grenade_m67 explosion events when using the no-grenades loadout", () => {
    const result = runBattle(infantryVsWolvesDraft("verify-alpha", "army_rifleman_no_grenades"));

    expect(
      result.timeline.events.filter(
        (event) => event.type === "explosion" && event.weaponId === "grenade_m67",
      ),
    ).toEqual([]);
    expect(result.report.armies.A.ammo.map((weapon) => weapon.weaponId)).not.toContain(
      "grenade_m67",
    );
  });
});
