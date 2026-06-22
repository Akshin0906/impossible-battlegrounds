import type {
  AiProfileDefinition,
  ArmyId,
  BattleEvent,
  BattleOutcome,
  BattleReport,
  BattleResult,
  BattleTimeline,
  CasualtySummary,
  DamageCause,
  FormationDefinition,
  HealthState,
  LoadoutDefinition,
  NormalizedBattleSetup,
  NormalizedSquad,
  RuntimeTerrain,
  UnitDefinition,
  UnitFinalState,
  Vec3,
  WeaponDefinition,
  WoundLocation,
  WoundState,
} from "../domain/battle";
import { actionCode, healthStateCode, moraleStateCode } from "../domain/battle";
import type { ContentRegistry } from "../domain/content";
import { DAMAGE_CAUSE_LABEL } from "../domain/report";
import {
  clamp,
  distance2,
  distanceSq2,
  headingTo,
  percent,
  quantize,
  quantizeVec3,
} from "./deterministicMath";
import { hashObject } from "./resultHash";
import { createRngStreams, type DeterministicRng } from "./rng";
import {
  generateRuntimeTerrain,
  hasLineOfSight,
  isMovementBlockedAt,
  movementBlockersBetween,
  nearestCover,
  obstacleAabb,
  terrainHeightAt,
} from "./terrain";

const TICK_SECONDS = 0.2;
const SAMPLE_INTERVAL = 0.4;
const SAMPLE_TICKS = 2;
const MAX_TICKS = 6000;
const NO_PROGRESS_CHECK_TICKS = 50;
const NO_PROGRESS_CHECK_LIMIT = 8;
const NO_TACTICAL_PROGRESS_CHECK_LIMIT = 36;
const NO_MEANINGFUL_PROGRESS_TICKS = NO_PROGRESS_CHECK_TICKS * NO_PROGRESS_CHECK_LIMIT;
const NO_TACTICAL_PROGRESS_TICKS = NO_PROGRESS_CHECK_TICKS * NO_TACTICAL_PROGRESS_CHECK_LIMIT;
const keyFactorNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const formatKeyFactorNumber = (value: number): string => keyFactorNumberFormatter.format(value);

type WeaponRuntime = {
  weapon: WeaponDefinition;
  ammoRemaining: number;
  magazineRemaining: number;
  reloadUntil: number;
  cooldownUntil: number;
  shotsFired: number;
  hits: number;
  reloads: number;
  explosivesUsed: number;
  friendlyCasualties: number;
  ammoLowEmitted: boolean;
};

type SimUnit = UnitFinalState & {
  definition: UnitDefinition;
  loadout: LoadoutDefinition;
  formation: FormationDefinition;
  aiProfile: AiProfileDefinition;
  weaponRuntimes: WeaponRuntime[];
  coverQuality: number;
  desiredCover?: Vec3;
  lastDamageTime: number;
  actionLockUntil: number;
  deflectionBoost: number;
  fearBoost: number;
  speedBoost: number;
  armorBoost: number;
  initialHealth: number;
  squadInitialCount: number;
  rampageAlerted: boolean;
};

type SquadRuntime = {
  id: string;
  armyId: ArmyId;
  unitTypeId: string;
  formationId: string;
  initialCount: number;
  formationBroken: boolean;
};

type AmmoMetric = {
  armyId: ArmyId;
  weaponId: string;
  shotsFired: number;
  hits: number;
  reloads: number;
  explosivesUsed: number;
  friendlyCasualties: number;
};

type SimulationMetrics = {
  firstMeleeContactTime?: number;
  casualtiesBeforeMelee: number;
  effectiveRangeTicks: Record<ArmyId, number>;
  coverFireTicks: Record<ArmyId, number>;
  effectiveRangeSum: Record<ArmyId, number>;
  effectiveRangeSamples: Record<ArmyId, number>;
  formationBreaks: number;
  fearEvents: number;
  suppressionApplied: Record<ArmyId, number>;
  preventedDamage: Record<ArmyId, number>;
  damageByCause: Record<DamageCause, number>;
  ammo: Map<string, AmmoMetric>;
  firstRout?: { squadId: string; time: number };
  armyCollapse: Partial<Record<ArmyId, { armyId: ArmyId; time: number }>>;
};

type RngStreams = ReturnType<typeof createRngStreams>;

const oppositeArmy = (armyId: ArmyId): ArmyId => (armyId === "A" ? "B" : "A");

const emptyCasualtySummary = (): CasualtySummary => ({
  rifle_fire: 0,
  melee: 0,
  explosion: 0,
  trampling: 0,
  energy_weapon: 0,
  telekinetic_attack: 0,
  bleed_out: 0,
  rout_combat_ineffective: 0,
});

const createMetrics = (): SimulationMetrics => ({
  casualtiesBeforeMelee: 0,
  effectiveRangeTicks: { A: 0, B: 0 },
  coverFireTicks: { A: 0, B: 0 },
  effectiveRangeSum: { A: 0, B: 0 },
  effectiveRangeSamples: { A: 0, B: 0 },
  formationBreaks: 0,
  fearEvents: 0,
  suppressionApplied: { A: 0, B: 0 },
  preventedDamage: { A: 0, B: 0 },
  damageByCause: emptyCasualtySummary(),
  ammo: new Map(),
  armyCollapse: {},
});

const metricKey = (armyId: ArmyId, weaponId: string): string => `${armyId}:${weaponId}`;

const getAmmoMetric = (
  metrics: SimulationMetrics,
  armyId: ArmyId,
  weaponId: string,
): AmmoMetric => {
  const key = metricKey(armyId, weaponId);
  const existing = metrics.ammo.get(key);
  if (existing) {
    return existing;
  }
  const created: AmmoMetric = {
    armyId,
    weaponId,
    shotsFired: 0,
    hits: 0,
    reloads: 0,
    explosivesUsed: 0,
    friendlyCasualties: 0,
  };
  metrics.ammo.set(key, created);
  return created;
};

const isAlive = (unit: SimUnit): boolean => unit.healthState !== "dead";

const isCombatEffective = (unit: SimUnit): boolean =>
  unit.healthState !== "dead" && unit.healthState !== "downed";

const hasCombatEffectiveArmy = (units: SimUnit[], armyId: ArmyId): boolean =>
  units.some((unit) => unit.armyId === armyId && isCombatEffective(unit));

const hasLivingArmy = (units: SimUnit[], armyId: ArmyId): boolean =>
  units.some((unit) => unit.armyId === armyId && isAlive(unit));

const canAct = (unit: SimUnit): boolean => isCombatEffective(unit);

const hasNoMorale = (unit: SimUnit): boolean => unit.definition.traits.includes("no_morale");

const armorForCause = (unit: SimUnit, cause: DamageCause): number => {
  const armor = unit.definition.armor;
  if (cause === "rifle_fire") {
    return armor.ballistic + unit.armorBoost;
  }
  if (cause === "explosion") {
    return armor.explosive + unit.armorBoost * 0.6;
  }
  if (cause === "energy_weapon" || cause === "telekinetic_attack") {
    return armor.energy + unit.armorBoost * 0.45;
  }
  return armor.melee + unit.armorBoost * 0.7;
};

const healthStateForHealth = (health: number, wounds: WoundState[]): HealthState => {
  if (health <= 0) {
    return "downed";
  }
  if (wounds.some((wound) => wound.severity === "critical")) {
    return "critically_wounded";
  }
  if (health < 72 || wounds.length > 0) {
    return "wounded";
  }
  return "healthy";
};

const uniqueWeaponIds = (weaponIds: string[]): string[] => [...new Set(weaponIds)];

const withoutWeapon = (weaponIds: string[], weaponId: string): string[] =>
  weaponIds.filter((candidate) => candidate !== weaponId);

const withWeapon = (weaponIds: string[], weaponId: string): string[] =>
  uniqueWeaponIds([...weaponIds, weaponId]);

const resolveRuntimeLoadout = (
  loadout: LoadoutDefinition,
  squad: NormalizedSquad,
): LoadoutDefinition => {
  const toggles = { ...loadout.toggles, ...squad.toggles };
  let weapons = [...loadout.weapons];
  if ("grenades" in toggles) {
    weapons =
      toggles.grenades === true
        ? withWeapon(weapons, "grenade_m67")
        : withoutWeapon(weapons, "grenade_m67");
  }
  if ("bow" in toggles) {
    weapons =
      toggles.bow === true ? withWeapon(weapons, "yumi_bow") : withoutWeapon(weapons, "yumi_bow");
  }
  if ("spear" in toggles) {
    weapons = toggles.spear === true ? withWeapon(weapons, "yari") : withoutWeapon(weapons, "yari");
  }
  if ("lanceCharge" in toggles) {
    weapons =
      toggles.lanceCharge === true ? withWeapon(weapons, "lance") : withoutWeapon(weapons, "lance");
  }
  if ("heavyWeapon" in toggles) {
    weapons = withoutWeapon(withoutWeapon(weapons, "android_rifle"), "android_heavy_rifle");
    weapons.unshift(toggles.heavyWeapon === true ? "android_heavy_rifle" : "android_rifle");
  }
  return { ...loadout, weapons: uniqueWeaponIds(weapons), toggles };
};

const initialAmmoForWeapon = (weapon: WeaponDefinition, loadout: LoadoutDefinition): number => {
  if (weapon.magazineSize <= 0) {
    return 0;
  }
  const extraAmmo = loadout.toggles.extraAmmo === true ? 1.45 : 1;
  const moreMissiles =
    loadout.toggles.moreMissiles === true && weapon.id === "micro_missiles" ? 1.75 : 1;
  return Math.round(weapon.defaultAmmo * extraAmmo * moreMissiles);
};

const buildWeaponRuntime = (
  weapon: WeaponDefinition,
  loadout: LoadoutDefinition,
): WeaponRuntime => {
  const ammoRemaining = initialAmmoForWeapon(weapon, loadout);
  return {
    weapon,
    ammoRemaining,
    magazineRemaining: weapon.magazineSize > 0 ? Math.min(weapon.magazineSize, ammoRemaining) : 0,
    reloadUntil: 0,
    cooldownUntil: 0,
    shotsFired: 0,
    hits: 0,
    reloads: 0,
    explosivesUsed: 0,
    friendlyCasualties: 0,
    ammoLowEmitted: false,
  };
};

const formationColumns = (count: number, formation: FormationDefinition): number => {
  if (formation.widthPreference === "column") {
    return Math.max(1, Math.min(3, count));
  }
  if (formation.widthPreference === "tight") {
    return Math.max(1, Math.ceil(Math.sqrt(count)));
  }
  if (formation.widthPreference === "wedge") {
    return Math.max(1, Math.ceil(Math.sqrt(count * 1.4)));
  }
  if (formation.widthPreference === "loose") {
    return Math.max(1, Math.ceil(Math.sqrt(count * 2.2)));
  }
  return Math.max(1, Math.ceil(Math.sqrt(count * 2)));
};

const formationOffset = (
  indexInSquad: number,
  count: number,
  formation: FormationDefinition,
  directionToEnemy: number,
): Vec3 => {
  const columns = formationColumns(count, formation);
  const row = Math.floor(indexInSquad / columns);
  const column = indexInSquad % columns;
  const centeredColumn = column - (Math.min(columns, count) - 1) / 2;
  const spacing = formation.spacing;
  if (formation.widthPreference === "wedge") {
    const rowWidth = row + 1;
    const localColumn = (indexInSquad - (row * (row + 1)) / 2) % Math.max(1, rowWidth);
    return {
      x: -directionToEnemy * row * spacing,
      y: 0,
      z: (localColumn - (rowWidth - 1) / 2) * spacing,
    };
  }
  return {
    x: -directionToEnemy * row * spacing,
    y: 0,
    z: centeredColumn * spacing,
  };
};

const roleDepth = (role: NormalizedSquad["deploymentRole"]): number => {
  if (role === "support") {
    return 22;
  }
  if (role === "flank") {
    return 10;
  }
  return 0;
};

const roleLane = (
  role: NormalizedSquad["deploymentRole"],
  squadOrdinal: number,
  armyId: ArmyId,
): number => {
  if (role === "flank") {
    const side = squadOrdinal % 2 === 0 ? -1 : 1;
    return side * (72 + Math.floor(squadOrdinal / 2) * 18) * (armyId === "A" ? 1 : -1);
  }
  if (role === "support") {
    return ((squadOrdinal % 5) - 2) * 15;
  }
  return ((squadOrdinal % 7) - 3) * 10;
};

const clampToTerrain = (terrain: RuntimeTerrain, position: Vec3, margin = 4): Vec3 => {
  const halfX = terrain.definition.size.x / 2 - margin;
  const halfZ = terrain.definition.size.z / 2 - margin;
  const x = clamp(position.x, -halfX, halfX);
  const z = clamp(position.z, -halfZ, halfZ);
  return quantizeVec3({ x, y: terrainHeightAt(terrain.definition, x, z), z });
};

const findOpenPosition = (terrain: RuntimeTerrain, desired: Vec3, padding = 0.8): Vec3 => {
  const clamped = clampToTerrain(terrain, desired);
  if (!isMovementBlockedAt(terrain, clamped, padding)) {
    return clamped;
  }
  for (let ring = 1; ring <= 12; ring += 1) {
    const radius = ring * 2.5;
    const samples = 8 + ring * 4;
    for (let sample = 0; sample < samples; sample += 1) {
      const angle = (Math.PI * 2 * sample) / samples;
      const candidate = clampToTerrain(terrain, {
        x: desired.x + Math.cos(angle) * radius,
        y: desired.y,
        z: desired.z + Math.sin(angle) * radius,
      });
      if (!isMovementBlockedAt(terrain, candidate, padding)) {
        return candidate;
      }
    }
  }
  return clamped;
};

const movementPathClear = (
  terrain: RuntimeTerrain,
  current: Vec3,
  destination: Vec3,
  padding = 0.6,
): boolean =>
  !isMovementBlockedAt(terrain, destination, padding) &&
  movementBlockersBetween(terrain, current, destination, padding).length === 0;

const MOVEMENT_FALLBACK_ANGLES = [
  0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 120, -120, 150, -150, 180,
] as const;

const moveDirectionalOpen = (
  terrain: RuntimeTerrain,
  current: Vec3,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  scoreCandidate: (candidate: Vec3) => number,
): Vec3 => {
  const length = Math.hypot(directionX, directionZ);
  if (length <= 0.001 || maxDistance <= 0) {
    return current;
  }
  const unitX = directionX / length;
  const unitZ = directionZ / length;
  let best: Vec3 | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const angle of MOVEMENT_FALLBACK_ANGLES) {
    const radians = (angle * Math.PI) / 180;
    const rotatedX = unitX * Math.cos(radians) - unitZ * Math.sin(radians);
    const rotatedZ = unitX * Math.sin(radians) + unitZ * Math.cos(radians);
    const candidate = clampToTerrain(terrain, {
      x: current.x + rotatedX * maxDistance,
      y: current.y,
      z: current.z + rotatedZ * maxDistance,
    });
    if (
      distanceSq2(candidate, current) < 0.01 ||
      !movementPathClear(terrain, current, candidate, 0.6)
    ) {
      continue;
    }
    const score = scoreCandidate(candidate) + Math.abs(angle) * 0.015;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best ?? current;
};

const cornerWaypointAroundBlocker = (
  terrain: RuntimeTerrain,
  current: Vec3,
  target: Vec3,
  padding = 0.6,
): Vec3 | undefined => {
  let best: Vec3 | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const blocker of movementBlockersBetween(terrain, current, target, padding)) {
    const bounds = obstacleAabb(blocker, padding + 4);
    const corners = [
      { x: bounds.minX, z: bounds.minZ },
      { x: bounds.minX, z: bounds.maxZ },
      { x: bounds.maxX, z: bounds.minZ },
      { x: bounds.maxX, z: bounds.maxZ },
    ];
    for (const corner of corners) {
      const candidate = clampToTerrain(terrain, { ...corner, y: current.y });
      if (
        distanceSq2(candidate, current) < 1 ||
        !movementPathClear(terrain, current, candidate, padding)
      ) {
        continue;
      }
      const score = distanceSq2(candidate, target) + distanceSq2(candidate, current) * 0.05;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best;
};

const moveTowardOpen = (
  terrain: RuntimeTerrain,
  current: Vec3,
  target: Vec3,
  maxDistance: number,
): Vec3 => {
  const directDistance = distance2(current, target);
  const step = Math.min(maxDistance, directDistance);
  const waypoint = cornerWaypointAroundBlocker(terrain, current, target);
  if (waypoint) {
    return moveDirectionalOpen(
      terrain,
      current,
      waypoint.x - current.x,
      waypoint.z - current.z,
      step,
      (candidate) => distanceSq2(candidate, waypoint) + distanceSq2(candidate, target) * 0.1,
    );
  }
  return moveDirectionalOpen(
    terrain,
    current,
    target.x - current.x,
    target.z - current.z,
    step,
    (candidate) => distanceSq2(candidate, target),
  );
};

const instantiateArmy = (
  setup: NormalizedBattleSetup,
  registry: ContentRegistry,
  terrain: RuntimeTerrain,
  armyId: ArmyId,
  unitStartIndex: number,
): { units: SimUnit[]; squads: SquadRuntime[] } => {
  const normalizedArmy = armyId === "A" ? setup.armyA : setup.armyB;
  const directionToEnemy = armyId === "A" ? 1 : -1;
  const frontX = (armyId === "A" ? -1 : 1) * (setup.startingDistance / 2);
  const roleOrder = { front: 0, support: 1, flank: 2 };
  const sortedSquads = [...normalizedArmy.squads].sort(
    (a, b) =>
      roleOrder[a.deploymentRole] - roleOrder[b.deploymentRole] ||
      a.normalizedId.localeCompare(b.normalizedId),
  );
  const units: SimUnit[] = [];
  const squads: SquadRuntime[] = [];
  let currentIndex = unitStartIndex;
  sortedSquads.forEach((squad, squadOrdinal) => {
    const definition = registry.unitMap.get(squad.unitTypeId)!;
    const loadout = resolveRuntimeLoadout(registry.loadoutMap.get(squad.loadoutId)!, squad);
    const formation = registry.formationMap.get(squad.formationId)!;
    const aiProfile = registry.aiProfileMap.get(definition.aiProfile)!;
    const squadRuntime: SquadRuntime = {
      id: squad.normalizedId,
      armyId,
      unitTypeId: squad.unitTypeId,
      formationId: squad.formationId,
      initialCount: squad.count,
      formationBroken: false,
    };
    squads.push(squadRuntime);
    const baseX = frontX - directionToEnemy * roleDepth(squad.deploymentRole);
    const baseZ = roleLane(squad.deploymentRole, squadOrdinal, armyId);
    for (let index = 0; index < squad.count; index += 1) {
      const offset = formationOffset(index, squad.count, formation, directionToEnemy);
      const x = baseX + offset.x;
      const z = baseZ + offset.z;
      const position = findOpenPosition(terrain, {
        x,
        y: terrainHeightAt(terrain.definition, x, z),
        z,
      });
      const weaponRuntimes = loadout.weapons.map((weaponId) =>
        buildWeaponRuntime(registry.weaponMap.get(weaponId)!, loadout),
      );
      const armorBoost =
        loadout.toggles.heavyArmor === true || loadout.toggles.heavierArmor === true
          ? 10
          : loadout.toggles.armor === "heavy"
            ? 8
            : loadout.toggles.armor === "light"
              ? -6
              : loadout.toggles.moreArmor === true
                ? 18
                : 0;
      const speedBoost =
        loadout.toggles.fasterMobility === true || loadout.toggles.moreMobility === true
          ? 0.7
          : loadout.toggles.slowerHeavier === true || loadout.toggles.moreArmor === true
            ? -0.45
            : loadout.toggles.heavyArmor === true
              ? -0.25
              : 0;
      const id = `${armyId}-U${String(currentIndex).padStart(4, "0")}`;
      units.push({
        index: currentIndex,
        id,
        armyId,
        squadId: squadRuntime.id,
        unitTypeId: definition.id,
        position,
        rotationY: armyId === "A" ? Math.PI / 2 : -Math.PI / 2,
        velocity: { x: 0, y: 0, z: 0 },
        healthState: "healthy",
        moraleState: "steady",
        bleedingState: "none",
        health: definition.baseHealth,
        morale: definition.traits.includes("no_morale") ? 100 : definition.baseMorale,
        stamina: 100,
        suppression: 0,
        ammo: Object.fromEntries(
          weaponRuntimes.map((runtime) => [runtime.weapon.id, runtime.ammoRemaining]),
        ),
        currentWeaponId: weaponRuntimes[0]?.weapon.id ?? "unarmed",
        wounds: [],
        currentAction: "waiting",
        isInFormation: true,
        formationCohesion: clamp(82 * formation.cohesionModifier, 0, 100),
        kills: 0,
        definition,
        loadout,
        formation,
        aiProfile,
        weaponRuntimes,
        coverQuality: 0,
        lastDamageTime: -999,
        actionLockUntil: 0,
        deflectionBoost: loadout.toggles.higherDeflection === true ? 0.18 : 0,
        fearBoost: loadout.toggles.strongerFearAura === true ? 18 : 0,
        speedBoost,
        armorBoost,
        initialHealth: definition.baseHealth,
        squadInitialCount: squad.count,
        rampageAlerted: false,
      });
      currentIndex += 1;
    }
  });
  return { units, squads };
};

const createInitialState = (
  setup: NormalizedBattleSetup,
  registry: ContentRegistry,
  terrain: RuntimeTerrain,
): { units: SimUnit[]; squads: Map<string, SquadRuntime> } => {
  const armyA = instantiateArmy(setup, registry, terrain, "A", 0);
  const armyB = instantiateArmy(setup, registry, terrain, "B", armyA.units.length);
  const units = [...armyA.units, ...armyB.units].sort((a, b) => a.index - b.index);
  const squads = new Map([...armyA.squads, ...armyB.squads].map((squad) => [squad.id, squad]));
  return { units, squads };
};

const updateReloads = (unit: SimUnit, time: number, metrics: SimulationMetrics): void => {
  for (const runtime of unit.weaponRuntimes) {
    if (
      runtime.weapon.magazineSize > 0 &&
      runtime.magazineRemaining === 0 &&
      runtime.ammoRemaining > 0 &&
      runtime.reloadUntil === 0
    ) {
      runtime.reloadUntil = quantize(time + runtime.weapon.reloadTime, 0.01);
      unit.currentAction = "reloading";
    }
    if (runtime.reloadUntil > 0 && runtime.reloadUntil <= time) {
      runtime.magazineRemaining = Math.min(runtime.weapon.magazineSize, runtime.ammoRemaining);
      runtime.reloadUntil = 0;
      runtime.reloads += 1;
      getAmmoMetric(metrics, unit.armyId, runtime.weapon.id).reloads += 1;
    }
  }
};

const canUseWeapon = (runtime: WeaponRuntime, distance: number, time: number): boolean => {
  const weapon = runtime.weapon;
  if (time < runtime.cooldownUntil || time < runtime.reloadUntil) {
    return false;
  }
  if (weapon.magazineSize > 0 && runtime.magazineRemaining <= 0) {
    return false;
  }
  if (weapon.magazineSize > 0 && runtime.ammoRemaining <= 0) {
    return false;
  }
  if (weapon.meleeReach > 0 && distance <= weapon.meleeReach + 0.25) {
    return true;
  }
  return distance <= weapon.rangeMax && weapon.rangeMax > 0 && weapon.magazineSize > 0;
};

const hasUsableRangedWeapon = (unit: SimUnit): boolean =>
  unit.weaponRuntimes.some(
    (runtime) =>
      runtime.weapon.rangeMax > 2 && runtime.weapon.magazineSize > 0 && runtime.ammoRemaining > 0,
  );

const chooseWeapon = (
  unit: SimUnit,
  target: SimUnit,
  units: SimUnit[],
  distance: number,
  time: number,
): WeaponRuntime | undefined => {
  const usable = unit.weaponRuntimes.filter((runtime) => canUseWeapon(runtime, distance, time));
  if (usable.length === 0) {
    return undefined;
  }
  const enemiesNearTarget = units.filter(
    (candidate) =>
      candidate.armyId !== unit.armyId &&
      isAlive(candidate) &&
      distanceSq2(candidate.position, target.position) <= 16 * 16,
  ).length;
  const explosive = usable.find(
    (runtime) => runtime.weapon.isExplosive && enemiesNearTarget >= 3 && distance > 8,
  );
  if (explosive) {
    return explosive;
  }
  const ranged = usable
    .filter((runtime) => runtime.weapon.rangeMax > 2)
    .sort((a, b) => b.weapon.rangeEffective - a.weapon.rangeEffective)[0];
  if (ranged && distance > 2.2) {
    return ranged;
  }
  return usable
    .filter((runtime) => runtime.weapon.meleeReach > 0)
    .sort((a, b) => b.weapon.damage - a.weapon.damage)[0];
};

const targetScore = (
  unit: SimUnit,
  candidate: SimUnit,
  distanceSquared: number,
  profile: AiProfileDefinition,
): number => {
  let score = distanceSquared;
  if (profile.targetPriority === "wounded" && candidate.healthState !== "healthy") {
    score -= 900;
  }
  if (profile.targetPriority === "threat" && hasUsableRangedWeapon(candidate)) {
    score -= 600 + unit.definition.awareness * 9;
  }
  if (profile.targetPriority === "cluster") {
    score -= candidate.definition.size * (110 + unit.definition.awareness);
  }
  if (profile.targetPriority === "isolated") {
    score -= candidate.isInFormation ? 0 : 1400;
  }
  return score;
};

const findTarget = (
  unit: SimUnit,
  units: SimUnit[],
  terrain: RuntimeTerrain,
): SimUnit | undefined => {
  let best: SimUnit | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of units) {
    if (candidate.armyId === unit.armyId || !isAlive(candidate)) {
      continue;
    }
    const distanceSquared = distanceSq2(unit.position, candidate.position);
    if (distanceSquared > 700 * 700) {
      continue;
    }
    if (
      hasUsableRangedWeapon(unit) &&
      !hasLineOfSight(terrain, unit.position, candidate.position)
    ) {
      continue;
    }
    const score = targetScore(unit, candidate, distanceSquared, unit.aiProfile);
    if (
      score < bestScore ||
      (score === bestScore && candidate.index < (best?.index ?? Number.POSITIVE_INFINITY))
    ) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
};

const findNearestAliveEnemy = (unit: SimUnit, units: SimUnit[]): SimUnit | undefined => {
  let best: SimUnit | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of units) {
    if (candidate.armyId === unit.armyId || !isAlive(candidate)) {
      continue;
    }
    const distanceSquared = distanceSq2(unit.position, candidate.position);
    if (
      distanceSquared < bestDistance ||
      (distanceSquared === bestDistance &&
        candidate.index < (best?.index ?? Number.POSITIVE_INFINITY))
    ) {
      best = candidate;
      bestDistance = distanceSquared;
    }
  }
  return best;
};

const pickWoundLocation = (rng: DeterministicRng): WoundLocation => {
  const roll = rng.intInclusive(0, 99);
  if (roll < 8) {
    return "head";
  }
  if (roll < 42) {
    return "torso";
  }
  if (roll < 56) {
    return "left_arm";
  }
  if (roll < 70) {
    return "right_arm";
  }
  if (roll < 85) {
    return "left_leg";
  }
  return "right_leg";
};

const applyMoraleLoss = (
  unit: SimUnit,
  amount: number,
  time: number,
  events: BattleEvent[],
): void => {
  if (hasNoMorale(unit) || unit.healthState === "dead" || unit.healthState === "downed") {
    return;
  }
  const styleModifier =
    unit.aiProfile.moraleStyle === "fearless"
      ? 0.28
      : unit.aiProfile.moraleStyle === "disciplined"
        ? 0.72
        : unit.aiProfile.moraleStyle === "animal"
          ? 1.08
          : 1;
  const resistanceModifier = clamp(1 - unit.definition.suppressionResistance / 185, 0.32, 1);
  const formationModifier = unit.isInFormation ? 1 / unit.formation.moraleModifier : 1;
  const adjustedAmount = amount * styleModifier * resistanceModifier * formationModifier;
  const routeThreshold = unit.aiProfile.moraleStyle === "fearless" ? 8 : 18;
  unit.morale = quantize(clamp(unit.morale - adjustedAmount, 0, 100), 0.01);
  if (unit.morale < 42 && unit.moraleState === "steady") {
    unit.moraleState = "shaken";
  }
  if (unit.morale <= routeThreshold && unit.definition.traits.includes("rampage")) {
    unit.morale = Math.max(unit.morale, routeThreshold + 6);
    unit.moraleState = "shaken";
    unit.currentAction = "charging";
    unit.actionLockUntil = Math.max(unit.actionLockUntil, time + 8);
    if (!unit.rampageAlerted) {
      unit.rampageAlerted = true;
      events.push({
        time,
        tick: Math.round(time / TICK_SECONDS),
        type: "major_alert",
        actorUnitId: unit.id,
        squadId: unit.squadId,
        armyId: unit.armyId,
        position: unit.position,
        message: `${unit.definition.displayName} rampaged under morale pressure.`,
      });
    }
    return;
  }
  if (unit.morale <= routeThreshold) {
    unit.moraleState = "shaken";
  }
};

const moraleShockNearby = (
  source: SimUnit,
  units: SimUnit[],
  amount: number,
  time: number,
  events: BattleEvent[],
): void => {
  for (const unit of units) {
    if (unit.armyId === source.armyId || !isAlive(unit)) {
      continue;
    }
    const range = source.definition.fear > 40 ? 38 : 22;
    if (distanceSq2(source.position, unit.position) <= range * range) {
      applyMoraleLoss(unit, amount, time, events);
    }
  }
};

const setDead = (
  unit: SimUnit,
  cause: DamageCause,
  time: number,
  events: BattleEvent[],
  actor?: SimUnit,
): void => {
  if (unit.healthState === "dead") {
    return;
  }
  unit.health = 0;
  unit.healthState = "dead";
  unit.currentAction = "dead";
  unit.timeOfDeath = time;
  unit.deathCause = cause;
  actor && (actor.kills += 1);
  events.push({
    time,
    tick: Math.round(time / TICK_SECONDS),
    type: "death",
    actorUnitId: actor?.id,
    targetUnitId: unit.id,
    armyId: unit.armyId,
    squadId: unit.squadId,
    position: unit.position,
    damageCause: cause,
    message: `${unit.definition.displayName} killed by ${DAMAGE_CAUSE_LABEL[cause]}.`,
  });
};

const formationDamageMultiplier = (
  target: SimUnit,
  cause: DamageCause,
  actor?: SimUnit,
): number => {
  if (!target.isInFormation) {
    return 1;
  }
  let multiplier = cause === "explosion" ? target.formation.explosiveVulnerabilityModifier : 1;
  if (actor) {
    const dx = Math.abs(actor.position.x - target.position.x);
    const dz = Math.abs(actor.position.z - target.position.z);
    if (dz > dx * 0.85) {
      multiplier *= target.formation.flankVulnerabilityModifier;
    }
  }
  return multiplier;
};

const applyDamage = (
  target: SimUnit,
  rawDamage: number,
  cause: DamageCause,
  penetration: number,
  time: number,
  events: BattleEvent[],
  metrics: SimulationMetrics,
  rng: DeterministicRng,
  actor?: SimUnit,
): void => {
  if (!isAlive(target)) {
    return;
  }
  const adjustedRawDamage = rawDamage * formationDamageMultiplier(target, cause, actor);
  const armor = armorForCause(target, cause);
  const effectiveArmor = armor * clamp(1 - penetration / 140, 0.25, 1);
  const reduction = clamp((effectiveArmor - adjustedRawDamage * 0.24) / 135, 0, 0.72);
  const coverReduction =
    cause === "rifle_fire" || cause === "explosion" ? target.coverQuality * 0.44 : 0;
  const formationReduction = target.isInFormation
    ? (target.formation.frontDefenseModifier - 1) * 0.22
    : 0;
  const prevented =
    adjustedRawDamage * clamp(reduction + coverReduction + formationReduction, 0, 0.82);
  metrics.preventedDamage[target.armyId] += prevented;
  const damage = quantize(
    Math.max(1, adjustedRawDamage - prevented) * (0.86 + rng.nextFloat() * 0.28),
    0.01,
  );
  metrics.damageByCause[cause] = quantize(metrics.damageByCause[cause] + damage, 0.01);
  target.health = quantize(clamp(target.health - damage, -100, target.initialHealth), 0.01);
  target.lastDamageTime = time;
  const suppressionTaken =
    damage * 0.28 * clamp(1 - target.definition.suppressionResistance / 180, 0.32, 1);
  target.suppression = clamp(target.suppression + suppressionTaken, 0, 100);

  if (damage > 14 && rng.chance(clamp(damage / 130, 0.08, 0.8))) {
    const location = pickWoundLocation(rng);
    const critical = damage > 45 || location === "head" || rng.chance(0.18);
    const bleeding =
      location === "torso" || critical
        ? critical
          ? "severe"
          : "light"
        : rng.chance(0.22)
          ? "light"
          : "none";
    const wound: WoundState = {
      location,
      severity: critical ? "critical" : "light",
      bleeding,
      time,
      cause,
    };
    target.wounds.push(wound);
    target.bleedingState =
      target.bleedingState === "severe" || bleeding === "severe"
        ? "severe"
        : target.bleedingState === "light" || bleeding === "light"
          ? "light"
          : "none";
    events.push({
      time,
      tick: Math.round(time / TICK_SECONDS),
      type: "wound",
      actorUnitId: actor?.id,
      targetUnitId: target.id,
      armyId: target.armyId,
      squadId: target.squadId,
      position: target.position,
      damageCause: cause,
      message: `${target.definition.displayName} suffered a ${critical ? "critical" : "light"} ${location.replace("_", " ")} wound.`,
    });
    if (location.includes("leg")) {
      target.stamina = clamp(target.stamina - 18, 0, 100);
    }
  }

  if (
    target.health <= 0 ||
    target.wounds.some((wound) => wound.location === "head" && wound.severity === "critical")
  ) {
    setDead(target, cause, time, events, actor);
  } else {
    target.healthState = healthStateForHealth(target.health, target.wounds);
  }
  applyMoraleLoss(target, damage * 0.16 + target.suppression * 0.025, time, events);
};

const applyBleeding = (
  unit: SimUnit,
  time: number,
  events: BattleEvent[],
  metrics: SimulationMetrics,
): void => {
  if (!isAlive(unit) || unit.bleedingState === "none") {
    return;
  }
  const loss = unit.bleedingState === "severe" ? 0.52 : 0.12;
  unit.health = quantize(unit.health - loss, 0.01);
  if (unit.health <= 0) {
    const bleedDamage = Math.abs(unit.health);
    setDead(unit, "bleed_out", time, events);
    metrics.damageByCause.bleed_out += bleedDamage;
    events.push({
      time,
      tick: Math.round(time / TICK_SECONDS),
      type: "bleed_out",
      targetUnitId: unit.id,
      armyId: unit.armyId,
      squadId: unit.squadId,
      position: unit.position,
      damageCause: "bleed_out",
      message: `${unit.definition.displayName} died from bleeding.`,
    });
  } else {
    unit.healthState = healthStateForHealth(unit.health, unit.wounds);
  }
};

const hitChance = (
  attacker: SimUnit,
  target: SimUnit,
  weapon: WeaponDefinition,
  distance: number,
  terrain: RuntimeTerrain,
): number => {
  const rangeModifier =
    distance <= weapon.rangeEffective
      ? 1
      : clamp(
          1 -
            ((distance - weapon.rangeEffective) /
              Math.max(1, weapon.rangeMax - weapon.rangeEffective)) *
              0.78,
          0.12,
          1,
        );
  const moraleModifier = attacker.moraleState === "steady" ? 1 : 0.72;
  const woundModifier =
    attacker.healthState === "healthy" ? 1 : attacker.healthState === "wounded" ? 0.82 : 0.62;
  const suppressionModifier = clamp(1 - attacker.suppression / 150, 0.35, 1);
  const coverModifier = clamp(1 - target.coverQuality * 0.55, 0.32, 1);
  const visibilityRangeWeight = clamp(distance / Math.max(1, weapon.rangeMax), 0.2, 1);
  const visibilityModifier =
    weapon.rangeMax > 3
      ? 1 - (1 - terrain.definition.visibilityModifier) * visibilityRangeWeight
      : clamp(0.9 + terrain.definition.visibilityModifier * 0.1, 0.8, 1);
  const targetMovementModifier =
    target.currentAction === "charging" || target.currentAction === "advancing" ? 0.82 : 1;
  const targetSizeModifier = clamp(target.definition.size, 0.55, 2.4);
  const elevationModifier =
    terrain.definition.id === "rocky_hills" && attacker.position.y > target.position.y ? 1.12 : 1;
  const trainingModifier = clamp(attacker.definition.training / 72, 0.35, 1.38);
  return clamp(
    weapon.baseAccuracy *
      trainingModifier *
      moraleModifier *
      woundModifier *
      rangeModifier *
      visibilityModifier *
      coverModifier *
      targetMovementModifier *
      targetSizeModifier *
      suppressionModifier *
      elevationModifier,
    0.01,
    0.95,
  );
};

const consumeShot = (
  runtime: WeaponRuntime,
  attacker: SimUnit,
  metrics: SimulationMetrics,
  time: number,
  events: BattleEvent[],
): void => {
  const weapon = runtime.weapon;
  runtime.cooldownUntil = quantize(
    time + Math.max(weapon.cooldown, 60 / Math.max(1, weapon.fireRatePerMinute)),
    0.01,
  );
  if (weapon.magazineSize > 0) {
    runtime.magazineRemaining = Math.max(0, runtime.magazineRemaining - 1);
    runtime.ammoRemaining = Math.max(0, runtime.ammoRemaining - 1);
    attacker.ammo[weapon.id] = runtime.ammoRemaining;
  }
  runtime.shotsFired += 1;
  getAmmoMetric(metrics, attacker.armyId, weapon.id).shotsFired += 1;
  if (
    weapon.magazineSize > 0 &&
    !runtime.ammoLowEmitted &&
    runtime.ammoRemaining <= Math.max(0, weapon.magazineSize)
  ) {
    runtime.ammoLowEmitted = true;
    events.push({
      time,
      tick: Math.round(time / TICK_SECONDS),
      type: "ammo_low",
      actorUnitId: attacker.id,
      armyId: attacker.armyId,
      squadId: attacker.squadId,
      position: attacker.position,
      weaponId: weapon.id,
      message:
        runtime.ammoRemaining === 0
          ? `${attacker.definition.displayName} exhausted ${weapon.displayName}.`
          : `${attacker.definition.displayName} is low on ${weapon.displayName} ammunition.`,
    });
  }
};

const alliesInsideBlast = (
  attacker: SimUnit,
  target: SimUnit,
  units: SimUnit[],
  blastRadius: number,
): SimUnit[] =>
  units.filter(
    (unit) =>
      unit.armyId === attacker.armyId &&
      unit.id !== attacker.id &&
      isAlive(unit) &&
      distanceSq2(unit.position, target.position) <= blastRadius * blastRadius,
  );

const fireExplosive = (
  attacker: SimUnit,
  target: SimUnit,
  runtime: WeaponRuntime,
  units: SimUnit[],
  time: number,
  events: BattleEvent[],
  metrics: SimulationMetrics,
  rng: DeterministicRng,
): boolean => {
  const weapon = runtime.weapon;
  const unsafeAllies = alliesInsideBlast(attacker, target, units, weapon.blastRadius);
  if (unsafeAllies.length > 0 && attacker.morale > 35 && rng.chance(0.88)) {
    attacker.currentAction = "firing";
    return false;
  }
  consumeShot(runtime, attacker, metrics, time, events);
  runtime.explosivesUsed += 1;
  getAmmoMetric(metrics, attacker.armyId, weapon.id).explosivesUsed += 1;
  attacker.currentWeaponId = weapon.id;
  attacker.currentAction = "firing";
  events.push({
    time,
    tick: Math.round(time / TICK_SECONDS),
    type: "explosion",
    actorUnitId: attacker.id,
    targetUnitId: target.id,
    armyId: attacker.armyId,
    position: target.position,
    weaponId: weapon.id,
    damageCause: "explosion",
    message: `${attacker.definition.displayName} detonated ${weapon.displayName}.`,
  });
  if (weapon.id === "micro_missiles") {
    events.push({
      time,
      tick: Math.round(time / TICK_SECONDS),
      type: "major_alert",
      actorUnitId: attacker.id,
      armyId: attacker.armyId,
      position: target.position,
      weaponId: weapon.id,
      message: "Powered Armor Champion missile strike.",
    });
  }
  for (const unit of units) {
    if (!isAlive(unit)) {
      continue;
    }
    const distance = distance2(unit.position, target.position);
    if (distance <= weapon.blastRadius) {
      const beforeDead = unit.healthState === "dead";
      const falloff = clamp(1 - distance / (weapon.blastRadius * 1.2), 0.18, 1);
      applyDamage(
        unit,
        weapon.damage * falloff,
        "explosion",
        weapon.penetration,
        time,
        events,
        metrics,
        rng,
        attacker,
      );
      unit.suppression = clamp(unit.suppression + weapon.suppression * falloff, 0, 100);
      metrics.suppressionApplied[attacker.armyId] += weapon.suppression * falloff;
      if (unit.armyId === attacker.armyId && !beforeDead && unit.healthState === "dead") {
        runtime.friendlyCasualties += 1;
        getAmmoMetric(metrics, attacker.armyId, weapon.id).friendlyCasualties += 1;
      }
    }
  }
  return true;
};

const fireWeapon = (
  attacker: SimUnit,
  target: SimUnit,
  runtime: WeaponRuntime,
  units: SimUnit[],
  terrain: RuntimeTerrain,
  time: number,
  events: BattleEvent[],
  metrics: SimulationMetrics,
  rngs: RngStreams,
): boolean => {
  const weapon = runtime.weapon;
  const distance = distance2(attacker.position, target.position);
  if (weapon.isExplosive) {
    return fireExplosive(attacker, target, runtime, units, time, events, metrics, rngs.combat);
  }
  consumeShot(runtime, attacker, metrics, time, events);
  const actionBeforeAttack = attacker.currentAction;
  attacker.currentWeaponId = weapon.id;
  attacker.currentAction =
    weapon.meleeReach > 0 && distance <= weapon.meleeReach + 0.3 ? "melee" : "firing";
  if (attacker.currentAction === "melee" && metrics.firstMeleeContactTime === undefined) {
    metrics.firstMeleeContactTime = time;
    metrics.casualtiesBeforeMelee = units.filter((unit) => unit.healthState === "dead").length;
  }
  events.push({
    time,
    tick: Math.round(time / TICK_SECONDS),
    type: attacker.currentAction === "melee" ? "melee_attack" : "shot_fired",
    actorUnitId: attacker.id,
    targetUnitId: target.id,
    armyId: attacker.armyId,
    position: attacker.position,
    weaponId: weapon.id,
    damageCause: weapon.damageCause,
    message: `${attacker.definition.displayName} used ${weapon.displayName}.`,
  });

  const deflectionChance =
    target.definition.traits.includes("deflection") && weapon.damageCause !== "explosion"
      ? clamp(0.32 + target.deflectionBoost - target.suppression / 220, 0.08, 0.68)
      : 0;
  if (deflectionChance > 0 && rngs.combat.chance(deflectionChance)) {
    metrics.preventedDamage[target.armyId] += weapon.damage;
    events.push({
      time,
      tick: Math.round(time / TICK_SECONDS),
      type: "major_alert",
      actorUnitId: target.id,
      targetUnitId: attacker.id,
      armyId: target.armyId,
      position: target.position,
      weaponId: weapon.id,
      message: "Dark Space Warlord deflected incoming fire.",
    });
    return true;
  }

  const chance = hitChance(attacker, target, weapon, distance, terrain);
  const hit =
    weapon.meleeReach > 0 && distance <= weapon.meleeReach + 0.3
      ? rngs.combat.chance(chance + 0.08)
      : rngs.combat.chance(chance);
  if (hit) {
    runtime.hits += 1;
    getAmmoMetric(metrics, attacker.armyId, weapon.id).hits += 1;
    let damage = weapon.damage;
    if (weapon.meleeReach > 0) {
      const chargeModifier = actionBeforeAttack === "charging" ? 1.25 : 1;
      const formationModifier = attacker.isInFormation ? attacker.formation.cohesionModifier : 0.88;
      damage *= chargeModifier * formationModifier;
    }
    if (weapon.damageCause === "trampling" && target.definition.size < attacker.definition.size) {
      damage *= 1.25;
    }
    events.push({
      time,
      tick: Math.round(time / TICK_SECONDS),
      type: "projectile_hit",
      actorUnitId: attacker.id,
      targetUnitId: target.id,
      armyId: attacker.armyId,
      position: target.position,
      weaponId: weapon.id,
      damageCause: weapon.damageCause,
      message: `${weapon.displayName} hit ${target.definition.displayName}.`,
    });
    applyDamage(
      target,
      damage,
      weapon.damageCause,
      weapon.penetration,
      time,
      events,
      metrics,
      rngs.wounds,
      attacker,
    );
    metrics.suppressionApplied[attacker.armyId] += weapon.suppression;
    target.suppression = clamp(
      target.suppression +
        weapon.suppression *
          0.32 *
          clamp(1 - target.definition.suppressionResistance / 180, 0.32, 1),
      0,
      100,
    );
    if (attacker.definition.fear + attacker.fearBoost > 30 && distance < 18) {
      metrics.fearEvents += 1;
      moraleShockNearby(
        attacker,
        units,
        (attacker.definition.fear + attacker.fearBoost) * 0.035,
        time,
        events,
      );
      events.push({
        time,
        tick: Math.round(time / TICK_SECONDS),
        type: "major_alert",
        actorUnitId: attacker.id,
        armyId: attacker.armyId,
        position: attacker.position,
        message:
          attacker.definition.id === "dark_space_warlord"
            ? "Dark Space Warlord fear aura shook nearby enemies."
            : `${attacker.definition.displayName} caused a fear shock.`,
      });
    }
  }
  return true;
};

const movementSpeed = (unit: SimUnit, terrain: RuntimeTerrain): number => {
  const woundPenalty = unit.wounds.some((wound) => wound.location.includes("leg")) ? 0.62 : 1;
  const moralePenalty = unit.moraleState === "shaken" ? 0.88 : 1;
  const armorPenalty = unit.armorBoost > 8 ? 0.9 : 1;
  return Math.max(
    0.5,
    (unit.definition.speed + unit.speedBoost) *
      terrain.definition.movementModifier *
      unit.formation.movementSpeedModifier *
      woundPenalty *
      moralePenalty *
      armorPenalty,
  );
};

const preferredEngagementRange = (unit: SimUnit): number => {
  const ranged = unit.weaponRuntimes
    .filter(
      (runtime) =>
        runtime.weapon.rangeMax > 2 && runtime.weapon.magazineSize > 0 && runtime.ammoRemaining > 0,
    )
    .sort((a, b) => b.weapon.rangeEffective - a.weapon.rangeEffective)[0];
  if (!ranged) {
    return 1.4;
  }
  const aggressionCloseFactor = clamp(0.9 - unit.aiProfile.aggression * 0.22, 0.62, 0.9);
  return clamp(
    ranged.weapon.rangeEffective * aggressionCloseFactor,
    Math.min(8, ranged.weapon.rangeMax),
    ranged.weapon.rangeMax * 0.88,
  );
};

const updateMovement = (
  unit: SimUnit,
  target: SimUnit,
  terrain: RuntimeTerrain,
  options: { forceContact?: boolean } = {},
): void => {
  const distance = distance2(unit.position, target.position);
  const hasRanged = hasUsableRangedWeapon(unit);
  const preferredRange = preferredEngagementRange(unit);
  const forceContact = options.forceContact === true;
  const speed = movementSpeed(unit, terrain) * TICK_SECONDS;
  const coverWanted =
    unit.aiProfile.coverSeeking > 0.4 &&
    hasRanged &&
    !forceContact &&
    terrain.coverNodes.length > 0 &&
    distance < 260;
  if (coverWanted) {
    const cover = nearestCover(
      terrain,
      unit.position,
      target.position,
      34 + unit.aiProfile.coverSeeking * 34,
    );
    if (cover && distance2(unit.position, cover.position) > 2.2) {
      unit.position = moveTowardOpen(terrain, unit.position, cover.position, speed * 0.95);
      unit.rotationY = headingTo(unit.position, target.position);
      unit.coverQuality = Math.max(0, unit.coverQuality - 0.02);
      unit.currentAction = "seeking_cover";
      return;
    }
    if (cover) {
      unit.coverQuality = clamp(cover.coverQuality, 0, 0.85);
    }
  } else {
    unit.coverQuality = Math.max(0, unit.coverQuality - 0.02);
  }
  if (
    forceContact ||
    !hasRanged ||
    distance > preferredRange ||
    unit.definition.category === "animal"
  ) {
    unit.position = moveTowardOpen(terrain, unit.position, target.position, speed);
    unit.rotationY = headingTo(unit.position, target.position);
    unit.currentAction =
      unit.definition.traits.includes("charge") ||
      unit.definition.traits.includes("shock_charge") ||
      unit.definition.traits.includes("trample")
        ? "charging"
        : "advancing";
    return;
  }
  unit.rotationY = headingTo(unit.position, target.position);
  unit.currentAction = "firing";
  if (unit.coverQuality > 0.2) {
    const key = unit.armyId;
    void key;
  }
};

const processUnit = (
  unit: SimUnit,
  units: SimUnit[],
  terrain: RuntimeTerrain,
  time: number,
  events: BattleEvent[],
  metrics: SimulationMetrics,
  rngs: RngStreams,
  wasCombatEffectiveAtTickStart: boolean,
): void => {
  const wasDeadAtTurnStart = unit.healthState === "dead";
  const suppressionRecovery = 2.2 * (1 + unit.definition.suppressionResistance / 140);
  unit.suppression = quantize(
    clamp(unit.suppression - suppressionRecovery * TICK_SECONDS, 0, 100),
    0.01,
  );
  if (unit.moraleState === "shaken" && unit.suppression < 12 && time - unit.lastDamageTime > 12) {
    unit.morale = clamp(unit.morale + 0.25, 0, 100);
    if (unit.morale > 52) {
      unit.moraleState = "steady";
    }
  }
  if (isAlive(unit)) {
    applyBleeding(unit, time, events, metrics);
  }
  if (!wasCombatEffectiveAtTickStart && !canAct(unit)) {
    if (unit.healthState === "downed") {
      unit.currentAction = "downed";
    }
    if (unit.healthState === "dead") {
      unit.currentAction = "dead";
    }
    return;
  }
  updateReloads(unit, time, metrics);
  const target = findTarget(unit, units, terrain);
  const contactTarget = target ?? findNearestAliveEnemy(unit, units);
  unit.targetUnitIndex = contactTarget?.index;
  if (!target) {
    if (contactTarget) {
      updateMovement(unit, contactTarget, terrain, { forceContact: true });
    } else {
      unit.currentAction = "waiting";
    }
    if (wasDeadAtTurnStart) {
      unit.currentAction = "dead";
    }
    return;
  }
  const distance = distance2(unit.position, target.position);
  const nearbyFear = target.definition.fear + target.fearBoost;
  if (nearbyFear > 30 && distance < 34) {
    metrics.fearEvents += nearbyFear > 60 ? 1 : 0;
    applyMoraleLoss(unit, nearbyFear * 0.012, time, events);
  }
  const weapon = chooseWeapon(unit, target, units, distance, time);
  if (weapon) {
    const fired = fireWeapon(unit, target, weapon, units, terrain, time, events, metrics, rngs);
    if (fired) {
      if (weapon.weapon.rangeMax > 2 && distance <= weapon.weapon.rangeEffective) {
        metrics.effectiveRangeTicks[unit.armyId] += 1;
        metrics.effectiveRangeSum[unit.armyId] += distance;
        metrics.effectiveRangeSamples[unit.armyId] += 1;
      }
      if (unit.coverQuality > 0.15 && weapon.weapon.rangeMax > 2) {
        metrics.coverFireTicks[unit.armyId] += 1;
      }
      if (wasDeadAtTurnStart) {
        unit.currentAction = "dead";
      }
      return;
    }
  }
  updateMovement(unit, target, terrain);
  if (wasDeadAtTurnStart) {
    unit.currentAction = "dead";
  }
};

const updateFormationBreaks = (
  squads: Map<string, SquadRuntime>,
  units: SimUnit[],
  time: number,
  events: BattleEvent[],
  metrics: SimulationMetrics,
): void => {
  for (const squad of squads.values()) {
    if (squad.formationBroken) {
      continue;
    }
    const squadUnits = units.filter((unit) => unit.squadId === squad.id);
    const effective = squadUnits.filter(isCombatEffective).length;
    const casualtyRatio = 1 - effective / Math.max(1, squad.initialCount);
    const averageCohesion =
      squadUnits.reduce((total, unit) => total + unit.formationCohesion, 0) /
      Math.max(1, squadUnits.length);
    if (casualtyRatio >= 0.45 || averageCohesion < 38) {
      squad.formationBroken = true;
      metrics.formationBreaks += 1;
      for (const unit of squadUnits) {
        unit.isInFormation = false;
        unit.formationCohesion = clamp(unit.formationCohesion * 0.52, 0, 100);
        applyMoraleLoss(unit, 8, time, events);
      }
      events.push({
        time,
        tick: Math.round(time / TICK_SECONDS),
        type: "formation_break",
        squadId: squad.id,
        armyId: squad.armyId,
        message: `${squad.armyId === "A" ? "Army A" : "Army B"} formation is breaking.`,
      });
      events.push({
        time,
        tick: Math.round(time / TICK_SECONDS),
        type: "major_alert",
        squadId: squad.id,
        armyId: squad.armyId,
        message: `${squad.armyId === "A" ? "Army A" : "Army B"} formation is breaking.`,
      });
    }
  }
};

const battleProgressSignature = (units: SimUnit[]): string =>
  units
    .map((unit) =>
      [
        unit.id,
        unit.healthState,
        unit.moraleState === "routing" ? "routing" : "not_routing",
        unit.bleedingState,
        quantize(unit.position.x, 1),
        quantize(unit.position.z, 1),
        Object.entries(unit.ammo)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([weaponId, amount]) => `${weaponId}:${amount}`)
          .join(","),
      ].join(":"),
    )
    .join("|");

const battleTacticalProgressSignature = (units: SimUnit[]): string =>
  units
    .map((unit) =>
      [
        unit.id,
        unit.healthState,
        unit.moraleState === "routing" ? "routing" : "not_routing",
        unit.bleedingState,
        Object.entries(unit.ammo)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([weaponId, amount]) => `${weaponId}:${amount}`)
          .join(","),
      ].join(":"),
    )
    .join("|");

const meaningfulProgressEventCount = (events: BattleEvent[]): number =>
  events.filter((event) => event.type !== "major_alert" && event.type !== "melee_attack").length;

const closestContestingDistance = (units: SimUnit[]): number => {
  const armyA = units.filter((unit) => unit.armyId === "A" && isCombatEffective(unit));
  const armyB = units.filter((unit) => unit.armyId === "B" && isCombatEffective(unit));
  if (armyA.length === 0 || armyB.length === 0) {
    return 0;
  }
  let closest = Number.POSITIVE_INFINITY;
  for (const unitA of armyA) {
    for (const unitB of armyB) {
      closest = Math.min(closest, distance2(unitA.position, unitB.position));
    }
  }
  return quantize(closest, 0.1);
};

const evaluateOutcome = (units: SimUnit[], time: number): BattleOutcome | undefined => {
  const livingA = hasLivingArmy(units, "A");
  const livingB = hasLivingArmy(units, "B");
  if (!livingA && !livingB) {
    return {
      kind: "draw",
      reason: `Mutual elimination at ${quantize(time, 0.1)} seconds.`,
    };
  }
  if (!livingA) {
    return { kind: "army_b_victory", reason: "Army A has no living units." };
  }
  if (!livingB) {
    return { kind: "army_a_victory", reason: "Army B has no living units." };
  }
  const canAffect = (armyId: ArmyId): boolean =>
    units
      .filter((unit) => unit.armyId === armyId && isCombatEffective(unit))
      .some((unit) =>
        unit.weaponRuntimes.some(
          (runtime) =>
            runtime.weapon.meleeReach > 0 ||
            runtime.ammoRemaining > 0 ||
            runtime.weapon.type === "telekinetic",
        ),
      );
  if (!canAffect("A") && !canAffect("B")) {
    return {
      kind: "stalemate",
      reason: "Neither surviving army has a viable means to affect the other.",
    };
  }
  return undefined;
};

const normalizeTerminalActions = (units: SimUnit[]): void => {
  for (const unit of units) {
    if (unit.healthState === "dead") {
      unit.currentAction = "dead";
    } else if (unit.healthState === "downed") {
      unit.currentAction = "downed";
    }
  }
};

const packSample = (units: SimUnit[], time: number) => ({
  time: quantize(time, 0.01),
  unitState: units.flatMap((unit) => [
    quantize(unit.position.x, 0.01),
    quantize(unit.position.y, 0.01),
    quantize(unit.position.z, 0.01),
    quantize(unit.rotationY, 0.001),
    quantize(unit.health, 0.01),
    quantize(unit.morale, 0.01),
    healthStateCode[unit.healthState],
    moraleStateCode[unit.moraleState],
    actionCode[unit.currentAction],
    quantize(unit.formationCohesion, 0.01),
  ]),
});

const cloneFinalUnit = (unit: SimUnit): UnitFinalState => ({
  index: unit.index,
  id: unit.id,
  armyId: unit.armyId,
  squadId: unit.squadId,
  unitTypeId: unit.unitTypeId,
  position: quantizeVec3(unit.position),
  rotationY: quantize(unit.rotationY, 0.001),
  velocity: quantizeVec3(unit.velocity),
  healthState: unit.healthState,
  moraleState: unit.moraleState,
  bleedingState: unit.bleedingState,
  health: quantize(unit.health, 0.01),
  morale: quantize(unit.morale, 0.01),
  stamina: quantize(unit.stamina, 0.01),
  suppression: quantize(unit.suppression, 0.01),
  ammo: Object.fromEntries(
    Object.entries(unit.ammo).map(([key, value]) => [key, Math.max(0, value)]),
  ),
  currentWeaponId: unit.currentWeaponId,
  wounds: unit.wounds,
  targetUnitIndex: unit.targetUnitIndex,
  currentAction: unit.currentAction,
  isInFormation: unit.isInFormation,
  formationCohesion: quantize(unit.formationCohesion, 0.01),
  timeDowned: unit.timeDowned,
  timeOfDeath: unit.timeOfDeath,
  deathCause: unit.deathCause,
  kills: unit.kills,
});

const buildArmyReport = (
  armyId: ArmyId,
  units: UnitFinalState[],
  registry: ContentRegistry,
  metrics: SimulationMetrics,
) => {
  const armyUnits = units.filter((unit) => unit.armyId === armyId);
  const casualtiesByCause = emptyCasualtySummary();
  for (const unit of armyUnits) {
    if (unit.healthState === "dead" && unit.deathCause) {
      casualtiesByCause[unit.deathCause] += 1;
    }
    if (unit.moraleState === "routing" && unit.healthState !== "dead") {
      casualtiesByCause.rout_combat_ineffective += 1;
    }
  }
  const metricByWeapon = new Map(
    [...metrics.ammo.values()]
      .filter((metric) => metric.armyId === armyId)
      .map((metric) => [metric.weaponId, metric]),
  );
  const ammoWeaponIds = new Set([
    ...metricByWeapon.keys(),
    ...armyUnits.flatMap((unit) => Object.keys(unit.ammo)),
  ]);
  const ammo = [...ammoWeaponIds]
    .map((weaponId) => registry.weaponMap.get(weaponId)!)
    .filter((weapon) => weapon.magazineSize > 0)
    .map((weapon) => {
      const metric = metricByWeapon.get(weapon.id);
      const ammoRemaining = armyUnits
        .filter((unit) => unit.healthState !== "dead")
        .reduce((total, unit) => total + (unit.ammo[weapon.id] ?? 0), 0);
      return {
        weaponId: weapon.id,
        displayName: weapon.displayName,
        shotsFired: metric?.shotsFired ?? 0,
        hits: metric?.hits ?? 0,
        hitRate: percent(metric?.hits ?? 0, metric?.shotsFired ?? 0),
        ammoRemaining,
        reloads: metric?.reloads ?? 0,
        explosivesUsed: metric?.explosivesUsed ?? 0,
        friendlyCasualties: metric?.friendlyCasualties ?? 0,
      };
    });
  return {
    armyId,
    startingUnits: armyUnits.length,
    survivors: armyUnits.filter((unit) => unit.healthState !== "dead").length,
    dead: armyUnits.filter((unit) => unit.healthState === "dead").length,
    wounded: armyUnits.filter(
      (unit) => unit.healthState === "wounded" || unit.healthState === "critically_wounded",
    ).length,
    routed: armyUnits.filter(
      (unit) => unit.moraleState === "routing" && unit.healthState !== "dead",
    ).length,
    downed: armyUnits.filter((unit) => unit.healthState === "downed").length,
    casualtiesByCause,
    ammo,
  };
};

const buildKeyFactors = (
  outcome: BattleOutcome,
  units: UnitFinalState[],
  metrics: SimulationMetrics,
  terrain: RuntimeTerrain,
) => {
  const winner: ArmyId | undefined =
    outcome.kind === "army_a_victory" ? "A" : outcome.kind === "army_b_victory" ? "B" : undefined;
  const loser: ArmyId | undefined = winner ? oppositeArmy(winner) : undefined;
  const factors = [];
  if (metrics.firstMeleeContactTime !== undefined) {
    factors.push({
      label: "Casualties before first melee contact",
      value: `${metrics.casualtiesBeforeMelee} units`,
      evidence: `First melee contact occurred at ${formatKeyFactorNumber(
        quantize(metrics.firstMeleeContactTime, 0.1),
      )} seconds.`,
    });
  }
  if (winner) {
    const rangeTicks = metrics.effectiveRangeTicks[winner];
    if (rangeTicks > 0) {
      const averageRange = quantize(
        metrics.effectiveRangeSum[winner] / Math.max(1, metrics.effectiveRangeSamples[winner]),
        0.1,
      );
      factors.push({
        label: `Army ${winner} effective-range pressure`,
        value: `${rangeTicks} firing ticks`,
        evidence: `Average recorded engagement distance was ${formatKeyFactorNumber(
          averageRange,
        )} meters.`,
      });
    }
    if (metrics.coverFireTicks[winner] > 0) {
      factors.push({
        label: `Army ${winner} fire from cover`,
        value: `${metrics.coverFireTicks[winner]} ticks`,
        evidence: `${terrain.definition.displayName} generated cover nodes used during firing.`,
      });
    }
    if (loser) {
      const loserRouted = units.filter(
        (unit) =>
          unit.armyId === loser && unit.moraleState === "routing" && unit.healthState !== "dead",
      ).length;
      if (loserRouted > 0) {
        factors.push({
          label: `Army ${loser} morale loss`,
          value: `${loserRouted} routed units`,
          evidence: "Routed units counted as combat ineffective under the locked outcome rules.",
        });
      }
    }
  }
  if (metrics.formationBreaks > 0) {
    factors.push({
      label: "Formation cohesion failure",
      value: `${metrics.formationBreaks} breaks`,
      evidence: "Formation breaks removed cohesion benefits and triggered morale penalties.",
    });
  }
  if (metrics.fearEvents > 0) {
    factors.push({
      label: "Fear and shock effects",
      value: `${metrics.fearEvents} fear checks`,
      evidence: "Large animals or supernatural units applied recorded morale pressure.",
    });
  }
  if (factors.length === 0) {
    factors.push({
      label: "Attrition balance",
      value: "No single factor dominated",
      evidence: "Outcome followed aggregate health, morale, and ammunition state at termination.",
    });
  }
  return factors.slice(0, 5);
};

const buildReport = (
  setup: NormalizedBattleSetup,
  outcome: BattleOutcome,
  duration: number,
  finalUnits: UnitFinalState[],
  registry: ContentRegistry,
  terrain: RuntimeTerrain,
  metrics: SimulationMetrics,
  resultHash: string,
): BattleReport => {
  const armyA = buildArmyReport("A", finalUnits, registry, metrics);
  const armyB = buildArmyReport("B", finalUnits, registry, metrics);
  return {
    outcome,
    duration: quantize(duration, 0.01),
    terrain: terrain.definition.displayName,
    startingDistance: setup.startingDistance,
    seed: setup.seed,
    simulationVersion: setup.simulationVersion,
    contentVersion: setup.contentVersion,
    contentHash: setup.contentHash,
    resultHash,
    totalStartingUnits: finalUnits.length,
    totalSurvivors: finalUnits.filter((unit) => unit.healthState !== "dead").length,
    totalDead: finalUnits.filter((unit) => unit.healthState === "dead").length,
    totalWounded: finalUnits.filter(
      (unit) => unit.healthState === "wounded" || unit.healthState === "critically_wounded",
    ).length,
    totalRouted: finalUnits.filter(
      (unit) => unit.moraleState === "routing" && unit.healthState !== "dead",
    ).length,
    armies: { A: armyA, B: armyB },
    morale: {
      firstRout: metrics.firstRout,
      armyCollapse: metrics.armyCollapse.A ?? metrics.armyCollapse.B,
      armyCollapses: (["A", "B"] as const).flatMap((armyId) =>
        metrics.armyCollapse[armyId] ? [metrics.armyCollapse[armyId]] : [],
      ),
      unitsRouted: finalUnits.filter(
        (unit) => unit.moraleState === "routing" && unit.healthState !== "dead",
      ).length,
      formationBreaks: metrics.formationBreaks,
      fearEvents: metrics.fearEvents,
    },
    keyFactors: buildKeyFactors(outcome, finalUnits, metrics, terrain),
    metrics: {
      firstMeleeContactTime: metrics.firstMeleeContactTime ?? "none",
      casualtiesBeforeMelee: metrics.casualtiesBeforeMelee,
      armyAEffectiveRangeTicks: metrics.effectiveRangeTicks.A,
      armyBEffectiveRangeTicks: metrics.effectiveRangeTicks.B,
      armyACoverFireTicks: metrics.coverFireTicks.A,
      armyBCoverFireTicks: metrics.coverFireTicks.B,
      armyAPreventedDamage: quantize(metrics.preventedDamage.A, 0.1),
      armyBPreventedDamage: quantize(metrics.preventedDamage.B, 0.1),
    },
  };
};

const updateArmyCollapse = (
  units: SimUnit[],
  time: number,
  events: BattleEvent[],
  metrics: SimulationMetrics,
): void => {
  for (const armyId of ["A", "B"] as const) {
    if (metrics.armyCollapse[armyId]) {
      continue;
    }
    const armyUnits = units.filter(
      (unit) => unit.armyId === armyId && unit.healthState !== "dead" && !hasNoMorale(unit),
    );
    if (armyUnits.length === 0) {
      continue;
    }
    const routing = armyUnits.filter((unit) => unit.moraleState === "routing").length;
    if (routing / armyUnits.length >= 0.65) {
      metrics.armyCollapse[armyId] = { armyId, time };
      events.push({
        time,
        tick: Math.round(time / TICK_SECONDS),
        type: "major_alert",
        armyId,
        message: `${armyId === "A" ? "Army A" : "Army B"} morale collapse.`,
      });
    }
  }
};

export const simulateBattle = (
  setup: NormalizedBattleSetup,
  registry: ContentRegistry,
): BattleResult => {
  const rngs = createRngStreams(`${setup.seed}:${setup.setupHash}`);
  const runtimeTerrain = generateRuntimeTerrain(setup, registry);
  const { units, squads } = createInitialState(setup, registry, runtimeTerrain);
  const metrics = createMetrics();
  const events: BattleEvent[] = [];
  const samples = [packSample(units, 0)];
  let outcome: BattleOutcome | undefined;
  let finalTick = 0;
  let lastProgressTick = 0;
  let lastProgressSignature = battleProgressSignature(units);
  let lastTacticalProgressTick = 0;
  let lastTacticalProgressSignature = battleTacticalProgressSignature(units);
  let lastProgressEventCount = meaningfulProgressEventCount(events);
  let bestContestingDistance = closestContestingDistance(units);

  for (let tick = 1; tick <= MAX_TICKS; tick += 1) {
    const time = quantize(tick * TICK_SECONDS, 0.01);
    finalTick = tick;
    const stableUnits = [...units].sort((a, b) => a.index - b.index);
    const tickStartEffective = new Set(
      stableUnits.filter(isCombatEffective).map((unit) => unit.id),
    );
    for (const unit of stableUnits) {
      processUnit(
        unit,
        stableUnits,
        runtimeTerrain,
        time,
        events,
        metrics,
        rngs,
        tickStartEffective.has(unit.id),
      );
    }
    updateFormationBreaks(squads, units, time, events, metrics);
    updateArmyCollapse(units, time, events, metrics);
    normalizeTerminalActions(units);
    if (tick % NO_PROGRESS_CHECK_TICKS === 0) {
      const currentProgressSignature = battleProgressSignature(units);
      const currentTacticalProgressSignature = battleTacticalProgressSignature(units);
      const currentContestingDistance = closestContestingDistance(units);
      const currentProgressEventCount = meaningfulProgressEventCount(events);
      const recordedCombatEvent = currentProgressEventCount !== lastProgressEventCount;
      const changedCombatState = currentTacticalProgressSignature !== lastTacticalProgressSignature;
      const moved = currentProgressSignature !== lastProgressSignature;
      const closedDistance = currentContestingDistance < bestContestingDistance - 1;
      if (recordedCombatEvent || changedCombatState || closedDistance || moved) {
        lastProgressTick = tick;
      }
      if (recordedCombatEvent || changedCombatState || closedDistance) {
        lastTacticalProgressTick = tick;
        lastTacticalProgressSignature = currentTacticalProgressSignature;
        lastProgressEventCount = currentProgressEventCount;
        bestContestingDistance = Math.min(bestContestingDistance, currentContestingDistance);
      }
      lastProgressSignature = currentProgressSignature;
    }
    if (tick % SAMPLE_TICKS === 0) {
      samples.push(packSample(units, time));
    }
    outcome = evaluateOutcome(units, time);
    if (
      !outcome &&
      (tick - lastProgressTick >= NO_MEANINGFUL_PROGRESS_TICKS ||
        tick - lastTacticalProgressTick >= NO_TACTICAL_PROGRESS_TICKS) &&
      hasCombatEffectiveArmy(units, "A") &&
      hasCombatEffectiveArmy(units, "B")
    ) {
      outcome = {
        kind: "stalemate",
        reason: "No meaningful battle progress; surviving armies could not establish contact.",
      };
    }
    if (outcome) {
      break;
    }
  }

  const duration = quantize(finalTick * TICK_SECONDS, 0.01);
  outcome ??= {
    kind: "stalemate",
    reason: "Maximum simulated duration reached without victory or draw.",
  };
  if (samples[samples.length - 1]?.time !== duration) {
    samples.push(packSample(units, duration));
  }
  const finalUnits = units.map(cloneFinalUnit).sort((a, b) => a.index - b.index);
  const timeline: BattleTimeline = {
    sampleInterval: SAMPLE_INTERVAL,
    unitIds: finalUnits.map((unit) => unit.id),
    unitMeta: finalUnits.map((unit) => ({
      id: unit.id,
      armyId: unit.armyId,
      squadId: unit.squadId,
      unitTypeId: unit.unitTypeId,
      formationId: units[unit.index]!.formation.id,
      loadoutId: units[unit.index]!.loadout.id,
    })),
    samples,
    events,
    duration,
  };
  const reportWithoutHash = buildReport(
    setup,
    outcome,
    duration,
    finalUnits,
    registry,
    runtimeTerrain,
    metrics,
    "",
  );
  const resultHash = hashObject({
    setup,
    outcome,
    finalUnits,
    timeline,
    reportTotals: {
      totalStartingUnits: reportWithoutHash.totalStartingUnits,
      totalSurvivors: reportWithoutHash.totalSurvivors,
      totalDead: reportWithoutHash.totalDead,
      totalWounded: reportWithoutHash.totalWounded,
      totalRouted: reportWithoutHash.totalRouted,
      armies: reportWithoutHash.armies,
    },
  });
  const report = buildReport(
    setup,
    outcome,
    duration,
    finalUnits,
    registry,
    runtimeTerrain,
    metrics,
    resultHash,
  );
  return {
    normalizedSetup: setup,
    outcome,
    resultHash,
    timeline,
    report,
    finalUnits,
    runtimeTerrain,
    warnings: runtimeTerrain.warnings,
  };
};
