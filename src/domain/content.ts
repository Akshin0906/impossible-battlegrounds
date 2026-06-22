import aiProfilesRaw from "../data/aiProfiles.json";
import formationsRaw from "../data/formations.json";
import loadoutsRaw from "../data/loadouts.json";
import terrainsRaw from "../data/terrains.json";
import unitsRaw from "../data/units.json";
import weaponsRaw from "../data/weapons.json";
import type {
  AiProfileDefinition,
  FormationDefinition,
  LoadoutDefinition,
  TerrainDefinition,
  UnitDefinition,
  WeaponDefinition,
} from "./battle";
import { CONTENT_VERSION } from "../data/contentVersion";
import { stableHash, stableStringify } from "../simulation/resultHash";
import { validateContentRegistry } from "../data/validateContent";

export type ContentRegistry = {
  version: string;
  hash: string;
  units: UnitDefinition[];
  weapons: WeaponDefinition[];
  loadouts: LoadoutDefinition[];
  formations: FormationDefinition[];
  terrains: TerrainDefinition[];
  aiProfiles: AiProfileDefinition[];
  unitMap: Map<string, UnitDefinition>;
  weaponMap: Map<string, WeaponDefinition>;
  loadoutMap: Map<string, LoadoutDefinition>;
  formationMap: Map<string, FormationDefinition>;
  terrainMap: Map<string, TerrainDefinition>;
  aiProfileMap: Map<string, AiProfileDefinition>;
};

const buildMap = <T extends { id: string }>(items: T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]));

export const loadContentRegistry = (): ContentRegistry => {
  const units = unitsRaw as UnitDefinition[];
  const weapons = weaponsRaw as WeaponDefinition[];
  const loadouts = loadoutsRaw as LoadoutDefinition[];
  const formations = formationsRaw as FormationDefinition[];
  const terrains = terrainsRaw as TerrainDefinition[];
  const aiProfiles = aiProfilesRaw as AiProfileDefinition[];
  const contentForHash = { units, weapons, loadouts, formations, terrains, aiProfiles };
  const hash = stableHash(stableStringify(contentForHash));
  const registry: ContentRegistry = {
    version: CONTENT_VERSION,
    hash,
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
  const diagnostics = validateContentRegistry(registry);
  if (diagnostics.length > 0) {
    throw new Error(`Invalid content registry:\n${diagnostics.join("\n")}`);
  }
  return registry;
};
