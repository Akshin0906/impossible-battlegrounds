export type ArmyId = "A" | "B";

export type DeploymentRole = "front" | "support" | "flank";

export type UnitCategory = "historical" | "modern" | "animal" | "fiction";

export type HealthState = "healthy" | "wounded" | "critically_wounded" | "downed" | "dead";

export type MoraleState = "steady" | "shaken" | "routing";

export type BleedingState = "none" | "light" | "severe";

export type UnitAction =
  | "advancing"
  | "seeking_cover"
  | "firing"
  | "reloading"
  | "melee"
  | "charging"
  | "routing"
  | "downed"
  | "dead"
  | "repositioning"
  | "waiting";

export type DamageCause =
  | "rifle_fire"
  | "melee"
  | "explosion"
  | "trampling"
  | "energy_weapon"
  | "telekinetic_attack"
  | "bleed_out"
  | "rout_combat_ineffective";

export type BattleOutcome =
  | { kind: "army_a_victory"; reason: string }
  | { kind: "army_b_victory"; reason: string }
  | { kind: "draw"; reason: string }
  | { kind: "stalemate"; reason: string };

export type Vec2 = {
  x: number;
  z: number;
};

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type ArmorValues = {
  melee: number;
  ballistic: number;
  explosive: number;
  energy: number;
};

export type UnitDefinition = {
  id: string;
  displayName: string;
  category: UnitCategory;
  role: string;
  description: string;
  representativeEra: string;
  confidence: "low" | "medium" | "high";
  baseHealth: number;
  baseMorale: number;
  training: number;
  awareness: number;
  speed: number;
  size: number;
  mass: number;
  armor: ArmorValues;
  fear: number;
  suppressionResistance: number;
  defaultDeploymentRole: DeploymentRole;
  traits: string[];
  allowedLoadouts: string[];
  allowedFormations: string[];
  aiProfile: string;
  visual: {
    archetype: "humanoid" | "quadruped" | "elephant" | "powered_armor" | "android" | "warlord";
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
};

export type WeaponDefinition = {
  id: string;
  displayName: string;
  type:
    | "rifle"
    | "sidearm"
    | "melee"
    | "thrown"
    | "explosive"
    | "trample"
    | "energy"
    | "telekinetic";
  damageCause: DamageCause;
  rangeEffective: number;
  rangeMax: number;
  meleeReach: number;
  magazineSize: number;
  defaultAmmo: number;
  reloadTime: number;
  fireRatePerMinute: number;
  baseAccuracy: number;
  damage: number;
  penetration: number;
  suppression: number;
  isExplosive: boolean;
  blastRadius: number;
  cooldown: number;
};

export type LoadoutDefinition = {
  id: string;
  displayName: string;
  unitTypeId: string;
  weapons: string[];
  toggles: Record<string, boolean | string>;
  toggleOptions?: Record<string, string[]>;
  notes: string;
};

export type FormationDefinition = {
  id: string;
  displayName: string;
  allowedUnitTypeIds?: string[];
  allowedCategories?: UnitCategory[];
  spacing: number;
  widthPreference: "tight" | "wide" | "column" | "wedge" | "loose";
  movementSpeedModifier: number;
  moraleModifier: number;
  frontDefenseModifier: number;
  flankVulnerabilityModifier: number;
  explosiveVulnerabilityModifier: number;
  cohesionModifier: number;
  roleBias?: DeploymentRole;
};

export type TerrainDefinition = {
  id: string;
  displayName: string;
  size: Vec2;
  movementModifier: number;
  visibilityModifier: number;
  coverDensity: number;
  elevationModifier: number;
  obstacleDensity: number;
  description: string;
};

export type AiProfileDefinition = {
  id: string;
  displayName: string;
  targetPriority: "nearest" | "wounded" | "cluster" | "threat" | "isolated";
  coverSeeking: number;
  aggression: number;
  flankPreference: number;
  moraleStyle: "normal" | "disciplined" | "animal" | "fearless";
  special: string[];
};

export type SquadDraft = {
  id: string;
  unitTypeId: string;
  count: number;
  loadoutId: string;
  formationId: string;
  deploymentRole: DeploymentRole;
  toggles: Record<string, boolean | string>;
};

export type ArmyDraft = {
  squads: SquadDraft[];
};

export type BattleSetupDraft = {
  seed: string;
  terrainId: string;
  startingDistance: number;
  armyA: ArmyDraft;
  armyB: ArmyDraft;
};

export type NormalizedSquad = SquadDraft & {
  armyId: ArmyId;
  normalizedId: string;
  sourceSquadId: string;
  chunkIndex: number;
};

export type NormalizedArmy = {
  armyId: ArmyId;
  squads: NormalizedSquad[];
};

export type NormalizedBattleSetup = {
  schemaVersion: 1;
  simulationVersion: string;
  contentVersion: string;
  contentHash: string;
  seed: string;
  terrainId: string;
  startingDistance: number;
  armyA: NormalizedArmy;
  armyB: NormalizedArmy;
  setupHash: string;
};

export type TerrainObstacle = {
  id: string;
  kind: "tree" | "rock" | "wall" | "building";
  position: Vec3;
  size: Vec3;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
  coverQuality: number;
};

export type CoverNode = {
  id: string;
  position: Vec3;
  normal: Vec3;
  coverQuality: number;
  blocksLineOfSight: boolean;
};

export type RuntimeTerrain = {
  definition: TerrainDefinition;
  obstacles: TerrainObstacle[];
  coverNodes: CoverNode[];
  warnings: string[];
};

export type WoundLocation = "head" | "torso" | "left_arm" | "right_arm" | "left_leg" | "right_leg";

export type WoundState = {
  location: WoundLocation;
  severity: "light" | "critical";
  bleeding: BleedingState;
  time: number;
  cause: DamageCause;
};

export type UnitFinalState = {
  index: number;
  id: string;
  armyId: ArmyId;
  squadId: string;
  unitTypeId: string;
  position: Vec3;
  rotationY: number;
  velocity: Vec3;
  healthState: HealthState;
  moraleState: MoraleState;
  bleedingState: BleedingState;
  health: number;
  morale: number;
  stamina: number;
  suppression: number;
  ammo: Record<string, number>;
  currentWeaponId: string;
  wounds: WoundState[];
  targetUnitIndex?: number;
  currentAction: UnitAction;
  isInFormation: boolean;
  formationCohesion: number;
  timeDowned?: number;
  timeOfDeath?: number;
  deathCause?: DamageCause;
  kills: number;
};

export type TimelineSample = {
  time: number;
  /**
   * Packed per-unit stride:
   * x, y, z, rotationY, health, morale, healthCode, moraleCode, actionCode, formationCohesion.
   */
  unitState: number[];
};

export type BattleEvent = {
  time: number;
  tick: number;
  type:
    | "shot_fired"
    | "projectile_hit"
    | "melee_attack"
    | "wound"
    | "death"
    | "explosion"
    | "rout"
    | "formation_break"
    | "ammo_low"
    | "unit_down"
    | "bleed_out"
    | "major_alert";
  actorUnitId?: string;
  targetUnitId?: string;
  squadId?: string;
  armyId?: ArmyId;
  position?: Vec3;
  weaponId?: string;
  damageCause?: DamageCause;
  message?: string;
};

export type BattleTimeline = {
  sampleInterval: number;
  unitIds: string[];
  unitMeta: Array<{
    id: string;
    armyId: ArmyId;
    squadId: string;
    unitTypeId: string;
    formationId: string;
    loadoutId: string;
  }>;
  samples: TimelineSample[];
  events: BattleEvent[];
  duration: number;
};

export type CasualtySummary = Record<DamageCause, number>;

export type AmmoWeaponReport = {
  weaponId: string;
  displayName: string;
  shotsFired: number;
  hits: number;
  hitRate: number;
  ammoRemaining: number;
  reloads: number;
  explosivesUsed: number;
  friendlyCasualties: number;
};

export type ArmyReport = {
  armyId: ArmyId;
  startingUnits: number;
  survivors: number;
  dead: number;
  wounded: number;
  routed: number;
  downed: number;
  casualtiesByCause: CasualtySummary;
  ammo: AmmoWeaponReport[];
};

export type MoraleReport = {
  firstRout?: { squadId: string; time: number };
  armyCollapse?: { armyId: ArmyId; time: number };
  armyCollapses: Array<{ armyId: ArmyId; time: number }>;
  unitsRouted: number;
  formationBreaks: number;
  fearEvents: number;
};

export type KeyFactor = {
  label: string;
  value: string;
  evidence: string;
};

export type BattleReport = {
  outcome: BattleOutcome;
  duration: number;
  terrain: string;
  startingDistance: number;
  seed: string;
  simulationVersion: string;
  contentVersion: string;
  contentHash: string;
  resultHash: string;
  totalStartingUnits: number;
  totalSurvivors: number;
  totalDead: number;
  totalWounded: number;
  totalRouted: number;
  armies: Record<ArmyId, ArmyReport>;
  morale: MoraleReport;
  keyFactors: KeyFactor[];
  metrics: Record<string, number | string>;
};

export type BattleResult = {
  normalizedSetup: NormalizedBattleSetup;
  outcome: BattleOutcome;
  resultHash: string;
  timeline: BattleTimeline;
  report: BattleReport;
  finalUnits: UnitFinalState[];
  runtimeTerrain: RuntimeTerrain;
  warnings: string[];
};

export const TIMELINE_STRIDE = 10;

export const healthStateCode: Record<HealthState, number> = {
  healthy: 0,
  wounded: 1,
  critically_wounded: 2,
  downed: 3,
  dead: 4,
};

export const moraleStateCode: Record<MoraleState, number> = {
  steady: 0,
  shaken: 1,
  routing: 2,
};

export const actionCode: Record<UnitAction, number> = {
  advancing: 0,
  seeking_cover: 1,
  firing: 2,
  reloading: 3,
  melee: 4,
  charging: 5,
  routing: 6,
  downed: 7,
  dead: 8,
  repositioning: 9,
  waiting: 10,
};

export const codeToHealthState = Object.fromEntries(
  Object.entries(healthStateCode).map(([state, code]) => [code, state]),
) as Record<number, HealthState>;

export const codeToMoraleState = Object.fromEntries(
  Object.entries(moraleStateCode).map(([state, code]) => [code, state]),
) as Record<number, MoraleState>;

export const codeToAction = Object.fromEntries(
  Object.entries(actionCode).map(([state, code]) => [code, state]),
) as Record<number, UnitAction>;
