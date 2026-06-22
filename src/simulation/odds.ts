import type { BattleSetupDraft, NormalizedBattleSetup } from "../domain/battle";
import type { ContentRegistry } from "../domain/content";
import { normalizeBattleSetup } from "./normalizeSetup";
import { createRng } from "./rng";

export type VagueOddsLabel =
  | "Army A favored"
  | "Army B favored"
  | "Even matchup"
  | "Hopeless for Army A"
  | "Hopeless for Army B"
  | "Unstable / chaotic";

const squadScore = (
  setup: NormalizedBattleSetup,
  registry: ContentRegistry,
  army: "armyA" | "armyB",
): number => {
  const squads = setup[army].squads;
  return squads.reduce((total, squad) => {
    const unit = registry.unitMap.get(squad.unitTypeId)!;
    const loadout = registry.loadoutMap.get(squad.loadoutId)!;
    const weapons = loadout.weapons.map((weaponId) => registry.weaponMap.get(weaponId)!);
    const rangedPower = weapons
      .filter((weapon) => weapon.rangeMax > 2)
      .reduce(
        (sum, weapon) =>
          sum + weapon.damage * weapon.baseAccuracy * Math.max(1, weapon.rangeEffective / 45),
        0,
      );
    const meleePower = weapons
      .filter((weapon) => weapon.meleeReach > 0)
      .reduce(
        (sum, weapon) => sum + weapon.damage * weapon.baseAccuracy * Math.max(1, weapon.meleeReach),
        0,
      );
    const fictionMultiplier = unit.category === "fiction" ? 2.2 : 1;
    const animalShock = unit.category === "animal" ? 1.2 + unit.fear / 140 : 1;
    const durability = unit.baseHealth * (1 + (unit.armor.ballistic + unit.armor.melee) / 220);
    return (
      total +
      squad.count *
        (durability / 45 + rangedPower + meleePower * 0.72) *
        fictionMultiplier *
        animalShock
    );
  }, 0);
};

export const estimateVagueOdds = (
  draft: BattleSetupDraft,
  registry: ContentRegistry,
): VagueOddsLabel => {
  const setup = normalizeBattleSetup(draft, registry);
  const rng = createRng(`${setup.seed}:${setup.setupHash}:${setup.contentHash}`, "odds");
  const terrain = registry.terrainMap.get(setup.terrainId)!;
  const distanceFactor =
    setup.startingDistance >= 150 ? 1.25 : setup.startingDistance <= 25 ? 0.78 : 1;
  const visibilityFactor = terrain.visibilityModifier;
  const a = squadScore(setup, registry, "armyA");
  const b = squadScore(setup, registry, "armyB");
  const modernA = setup.armyA.squads.some(
    (squad) => registry.unitMap.get(squad.unitTypeId)!.category === "modern",
  );
  const modernB = setup.armyB.squads.some(
    (squad) => registry.unitMap.get(squad.unitTypeId)!.category === "modern",
  );
  const fictionDominates = [...setup.armyA.squads, ...setup.armyB.squads].some(
    (squad) => registry.unitMap.get(squad.unitTypeId)!.category === "fiction",
  );
  const adjustedA = a * (modernA ? distanceFactor * visibilityFactor : 1 / distanceFactor);
  const adjustedB = b * (modernB ? distanceFactor * visibilityFactor : 1 / distanceFactor);
  const wobble = 0.94 + rng.nextFloat() * 0.12;
  const ratio = adjustedA / Math.max(1, adjustedB * wobble);
  if (fictionDominates && ratio > 0.62 && ratio < 1.62) {
    return "Unstable / chaotic";
  }
  if (ratio > 4.2) {
    return "Hopeless for Army B";
  }
  if (ratio < 0.24) {
    return "Hopeless for Army A";
  }
  if (ratio > 1.28) {
    return "Army A favored";
  }
  if (ratio < 0.78) {
    return "Army B favored";
  }
  return "Even matchup";
};
