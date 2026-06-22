import type { ContentRegistry } from "../domain/content";

const uniqueIds = <T extends { id: string }>(label: string, items: T[], diagnostics: string[]) => {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id.trim()) {
      diagnostics.push(`${label} contains an empty id`);
    }
    if (seen.has(item.id)) {
      diagnostics.push(`${label} contains duplicate id '${item.id}'`);
    }
    seen.add(item.id);
  }
};

export const validateContentRegistry = (registry: ContentRegistry): string[] => {
  const diagnostics: string[] = [];
  uniqueIds("units", registry.units, diagnostics);
  uniqueIds("weapons", registry.weapons, diagnostics);
  uniqueIds("loadouts", registry.loadouts, diagnostics);
  uniqueIds("formations", registry.formations, diagnostics);
  uniqueIds("terrains", registry.terrains, diagnostics);
  uniqueIds("aiProfiles", registry.aiProfiles, diagnostics);

  for (const unit of registry.units) {
    if (!registry.aiProfileMap.has(unit.aiProfile)) {
      diagnostics.push(`${unit.id} references missing aiProfile '${unit.aiProfile}'`);
    }
    if (unit.baseHealth <= 0 || unit.speed <= 0 || unit.size <= 0) {
      diagnostics.push(`${unit.id} has nonpositive baseHealth, speed, or size`);
    }
    for (const loadoutId of unit.allowedLoadouts) {
      const loadout = registry.loadoutMap.get(loadoutId);
      if (!loadout) {
        diagnostics.push(`${unit.id} references missing loadout '${loadoutId}'`);
      } else if (loadout.unitTypeId !== unit.id) {
        diagnostics.push(
          `${unit.id} includes loadout '${loadoutId}' assigned to ${loadout.unitTypeId}`,
        );
      }
    }
    for (const formationId of unit.allowedFormations) {
      if (!registry.formationMap.has(formationId)) {
        diagnostics.push(`${unit.id} references missing formation '${formationId}'`);
      }
    }
  }

  for (const loadout of registry.loadouts) {
    if (!registry.unitMap.has(loadout.unitTypeId)) {
      diagnostics.push(`${loadout.id} references missing unit '${loadout.unitTypeId}'`);
    }
    for (const weaponId of loadout.weapons) {
      if (!registry.weaponMap.has(weaponId)) {
        diagnostics.push(`${loadout.id} references missing weapon '${weaponId}'`);
      }
    }
  }

  for (const formation of registry.formations) {
    if (formation.spacing <= 0) {
      diagnostics.push(`${formation.id} has nonpositive spacing`);
    }
  }

  for (const terrain of registry.terrains) {
    if (terrain.size.x <= 0 || terrain.size.z <= 0) {
      diagnostics.push(`${terrain.id} has invalid size`);
    }
  }

  return diagnostics;
};
