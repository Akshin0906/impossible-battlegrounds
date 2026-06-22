import type {
  ArmyDraft,
  ArmyId,
  BattleSetupDraft,
  DeploymentRole,
  NormalizedArmy,
  NormalizedBattleSetup,
  NormalizedSquad,
  SquadDraft,
} from "../domain/battle";
import type { ContentRegistry } from "../domain/content";
import { hashObject } from "./resultHash";

export const SIMULATION_VERSION = "ib-sim-v1.0.0";

const MAX_SQUAD_SIZE_BY_ROLE: Record<string, number> = {
  roman_legionary: 10,
  medieval_knight: 8,
  samurai: 10,
  us_army_infantry: 8,
  us_marine: 8,
  special_operations_soldier: 6,
  wolf: 12,
  grizzly_bear: 3,
  african_elephant: 2,
  dark_space_warlord: 1,
  powered_armor_champion: 1,
  combat_android: 6,
};

export const createDefaultSetup = (registry: ContentRegistry): BattleSetupDraft => {
  const roman = registry.unitMap.get("roman_legionary")!;
  const army = registry.unitMap.get("us_army_infantry")!;
  return {
    seed: "481923",
    terrainId: "open_field",
    startingDistance: 100,
    armyA: {
      squads: [
        {
          id: "A-roman-1",
          unitTypeId: roman.id,
          count: 100,
          loadoutId: roman.allowedLoadouts[0]!,
          formationId: roman.allowedFormations[0]!,
          deploymentRole: roman.defaultDeploymentRole,
          toggles: { shield: true },
        },
      ],
    },
    armyB: {
      squads: [
        {
          id: "B-army-1",
          unitTypeId: army.id,
          count: 20,
          loadoutId: army.allowedLoadouts[0]!,
          formationId: army.allowedFormations[0]!,
          deploymentRole: army.defaultDeploymentRole,
          toggles: { grenades: true, extraAmmo: false, armor: "medium" },
        },
      ],
    },
  };
};

const validateDraftSquad = (squad: SquadDraft, registry: ContentRegistry): string[] => {
  const diagnostics: string[] = [];
  const unit = registry.unitMap.get(squad.unitTypeId);
  if (!unit) {
    diagnostics.push(`Unknown unit '${squad.unitTypeId}'`);
    return diagnostics;
  }
  if (!Number.isInteger(squad.count) || squad.count < 1 || squad.count > 2000) {
    diagnostics.push(`${unit.displayName} count must be between 1 and 2000`);
  }
  if (!unit.allowedLoadouts.includes(squad.loadoutId)) {
    diagnostics.push(`${unit.displayName} cannot use loadout '${squad.loadoutId}'`);
  }
  if (!unit.allowedFormations.includes(squad.formationId)) {
    diagnostics.push(`${unit.displayName} cannot use formation '${squad.formationId}'`);
  }
  if (!["front", "support", "flank"].includes(squad.deploymentRole)) {
    diagnostics.push(`${unit.displayName} has invalid deployment role '${squad.deploymentRole}'`);
  }
  return diagnostics;
};

export const validateBattleSetupDraft = (
  draft: BattleSetupDraft,
  registry: ContentRegistry,
): string[] => {
  const diagnostics: string[] = [];
  if (!draft.seed.trim()) {
    diagnostics.push("Seed is required");
  }
  if (!registry.terrainMap.has(draft.terrainId)) {
    diagnostics.push(`Unknown terrain '${draft.terrainId}'`);
  }
  if (draft.startingDistance < 10 || draft.startingDistance > 500) {
    diagnostics.push("Starting distance must be between 10m and 500m");
  }
  if (draft.armyA.squads.length === 0) {
    diagnostics.push("Army A needs at least one squad");
  }
  if (draft.armyB.squads.length === 0) {
    diagnostics.push("Army B needs at least one squad");
  }
  for (const squad of [...draft.armyA.squads, ...draft.armyB.squads]) {
    diagnostics.push(...validateDraftSquad(squad, registry));
  }
  return diagnostics;
};

const normalizeRole = (
  role: DeploymentRole | undefined,
  fallback: DeploymentRole,
): DeploymentRole => role ?? fallback;

const normalizeArmy = (
  army: ArmyDraft,
  armyId: ArmyId,
  registry: ContentRegistry,
): NormalizedArmy => {
  const squads: NormalizedSquad[] = [];
  army.squads.forEach((squad, squadIndex) => {
    const unit = registry.unitMap.get(squad.unitTypeId)!;
    const loadout = registry.loadoutMap.get(squad.loadoutId)!;
    const maxSquadSize = MAX_SQUAD_SIZE_BY_ROLE[squad.unitTypeId] ?? 10;
    let remaining = squad.count;
    let chunkIndex = 0;
    while (remaining > 0) {
      const count = Math.min(maxSquadSize, remaining);
      squads.push({
        ...squad,
        armyId,
        id: `${armyId}-${squadIndex + 1}-${chunkIndex + 1}`,
        normalizedId: `${armyId}-${squadIndex + 1}-${chunkIndex + 1}`,
        sourceSquadId: squad.id,
        chunkIndex,
        count,
        loadoutId: loadout.id,
        deploymentRole: normalizeRole(squad.deploymentRole, unit.defaultDeploymentRole),
        toggles: { ...loadout.toggles, ...squad.toggles },
      });
      remaining -= count;
      chunkIndex += 1;
    }
  });
  return { armyId, squads };
};

export const normalizeBattleSetup = (
  draft: BattleSetupDraft,
  registry: ContentRegistry,
): NormalizedBattleSetup => {
  const diagnostics = validateBattleSetupDraft(draft, registry);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join("\n"));
  }
  const partial = {
    schemaVersion: 1 as const,
    simulationVersion: SIMULATION_VERSION,
    contentVersion: registry.version,
    contentHash: registry.hash,
    seed: draft.seed.trim(),
    terrainId: draft.terrainId,
    startingDistance: Math.round(draft.startingDistance),
    armyA: normalizeArmy(draft.armyA, "A", registry),
    armyB: normalizeArmy(draft.armyB, "B", registry),
  };
  return { ...partial, setupHash: hashObject(partial) };
};

export const totalUnitsInDraft = (draft: BattleSetupDraft): number =>
  [...draft.armyA.squads, ...draft.armyB.squads].reduce((total, squad) => total + squad.count, 0);

export const performanceWarningForCount = (count: number): string | undefined => {
  if (count >= 1000) {
    return `Extreme warning: This battle has ${count} units. Best effort only above 1000 units.`;
  }
  if (count >= 500) {
    return `Strong warning: This battle has ${count} units. Playback will use aggressive simplification.`;
  }
  if (count >= 250) {
    return `Warning: This battle has ${count} units. Large battles may simulate slowly or use reduced distant detail.`;
  }
  return undefined;
};
