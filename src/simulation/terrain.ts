import type {
  CoverNode,
  NormalizedBattleSetup,
  RuntimeTerrain,
  TerrainDefinition,
  TerrainObstacle,
  Vec3,
} from "../domain/battle";
import type { ContentRegistry } from "../domain/content";
import { quantize, quantizeVec3 } from "./deterministicMath";
import { createRng } from "./rng";

export type TerrainAabb = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type TerrainPoint = Pick<Vec3, "x" | "z">;

const AABB_EPSILON = 1e-9;

const pushCoverForObstacle = (nodes: CoverNode[], obstacle: TerrainObstacle): void => {
  const offsets = [
    { x: obstacle.size.x / 2 + 1.4, z: 0, nx: 1, nz: 0 },
    { x: -obstacle.size.x / 2 - 1.4, z: 0, nx: -1, nz: 0 },
    { x: 0, z: obstacle.size.z / 2 + 1.4, nx: 0, nz: 1 },
    { x: 0, z: -obstacle.size.z / 2 - 1.4, nx: 0, nz: -1 },
  ];
  for (const [index, offset] of offsets.entries()) {
    nodes.push({
      id: `${obstacle.id}-cover-${index}`,
      position: quantizeVec3({
        x: obstacle.position.x + offset.x,
        y: obstacle.position.y,
        z: obstacle.position.z + offset.z,
      }),
      normal: { x: offset.nx, y: 0, z: offset.nz },
      coverQuality: obstacle.coverQuality,
      blocksLineOfSight: obstacle.blocksLineOfSight,
    });
  }
};

const randomPosition = (
  terrain: TerrainDefinition,
  rng: ReturnType<typeof createRng>,
  margin: number,
): Vec3 => ({
  x: quantize(rng.intInclusive(-terrain.size.x / 2 + margin, terrain.size.x / 2 - margin), 0.01),
  y: 0,
  z: quantize(rng.intInclusive(-terrain.size.z / 2 + margin, terrain.size.z / 2 - margin), 0.01),
});

export const terrainHeightAt = (terrain: TerrainDefinition, x: number, z: number): number => {
  if (terrain.id !== "rocky_hills") {
    return 0;
  }
  const bandX = Math.round((x + terrain.size.x / 2) / 24);
  const bandZ = Math.round((z + terrain.size.z / 2) / 18);
  const ridge = ((bandX * 17 + bandZ * 31) % 9) - 4;
  return quantize(ridge * terrain.elevationModifier, 0.05);
};

export const generateRuntimeTerrain = (
  setup: NormalizedBattleSetup,
  registry: ContentRegistry,
): RuntimeTerrain => {
  const definition = registry.terrainMap.get(setup.terrainId);
  if (!definition) {
    throw new Error(`Missing terrain '${setup.terrainId}'`);
  }
  const rng = createRng(`${setup.seed}:${setup.setupHash}`, `terrain:${definition.id}`);
  const obstacles: TerrainObstacle[] = [];
  const coverNodes: CoverNode[] = [];
  const warnings: string[] = [];

  if (definition.id === "open_field") {
    for (let index = 0; index < 8; index += 1) {
      const obstacle: TerrainObstacle = {
        id: `field-rock-${index}`,
        kind: "rock",
        position: randomPosition(definition, rng, 35),
        size: { x: 2.5, y: 1.2, z: 2.2 },
        blocksMovement: true,
        blocksLineOfSight: false,
        coverQuality: 0.22,
      };
      obstacles.push(obstacle);
      pushCoverForObstacle(coverNodes, obstacle);
    }
  }

  if (definition.id === "forest") {
    for (let index = 0; index < 72; index += 1) {
      const radius = rng.intInclusive(16, 34) / 10;
      const obstacle: TerrainObstacle = {
        id: `tree-${index}`,
        kind: "tree",
        position: randomPosition(definition, rng, 24),
        size: { x: radius, y: rng.intInclusive(55, 95) / 10, z: radius },
        blocksMovement: true,
        blocksLineOfSight: true,
        coverQuality: 0.58,
      };
      obstacles.push(obstacle);
      pushCoverForObstacle(coverNodes, obstacle);
    }
  }

  if (definition.id === "urban_blocks") {
    let index = 0;
    for (let x = -180; x <= 180; x += 90) {
      for (let z = -120; z <= 120; z += 80) {
        if ((x === 0 && z === 0) || rng.chance(0.12)) {
          continue;
        }
        const obstacle: TerrainObstacle = {
          id: `building-${index}`,
          kind: "building",
          position: { x: x + rng.intInclusive(-7, 7), y: 0, z: z + rng.intInclusive(-6, 6) },
          size: {
            x: rng.intInclusive(26, 42),
            y: rng.intInclusive(16, 34),
            z: rng.intInclusive(20, 36),
          },
          blocksMovement: true,
          blocksLineOfSight: true,
          coverQuality: 0.78,
        };
        obstacles.push(obstacle);
        pushCoverForObstacle(coverNodes, obstacle);
        index += 1;
      }
    }
  }

  if (definition.id === "rocky_hills") {
    for (let index = 0; index < 42; index += 1) {
      const position = randomPosition(definition, rng, 30);
      const obstacle: TerrainObstacle = {
        id: `rock-${index}`,
        kind: "rock",
        position: { ...position, y: terrainHeightAt(definition, position.x, position.z) },
        size: {
          x: rng.intInclusive(24, 58) / 10,
          y: rng.intInclusive(16, 45) / 10,
          z: rng.intInclusive(24, 58) / 10,
        },
        blocksMovement: true,
        blocksLineOfSight: rng.chance(0.65),
        coverQuality: 0.52,
      };
      obstacles.push(obstacle);
      pushCoverForObstacle(coverNodes, obstacle);
    }
  }

  if (coverNodes.length === 0 && definition.coverDensity > 0.1) {
    warnings.push(
      "Terrain requested cover but generated no cover nodes; units will use fallback movement.",
    );
  }

  return { definition, obstacles, coverNodes, warnings };
};

export const obstacleAabb = (obstacle: TerrainObstacle, padding = 0): TerrainAabb => {
  const halfX = Math.max(0, Math.abs(obstacle.size.x) / 2 + padding);
  const halfZ = Math.max(0, Math.abs(obstacle.size.z) / 2 + padding);
  return {
    minX: obstacle.position.x - halfX,
    maxX: obstacle.position.x + halfX,
    minZ: obstacle.position.z - halfZ,
    maxZ: obstacle.position.z + halfZ,
  };
};

export const pointInAabb = (point: TerrainPoint, aabb: TerrainAabb): boolean => {
  const minX = Math.min(aabb.minX, aabb.maxX);
  const maxX = Math.max(aabb.minX, aabb.maxX);
  const minZ = Math.min(aabb.minZ, aabb.maxZ);
  const maxZ = Math.max(aabb.minZ, aabb.maxZ);
  return (
    point.x >= minX - AABB_EPSILON &&
    point.x <= maxX + AABB_EPSILON &&
    point.z >= minZ - AABB_EPSILON &&
    point.z <= maxZ + AABB_EPSILON
  );
};

export const segmentIntersectsAabb = (
  a: TerrainPoint,
  b: TerrainPoint,
  aabb: TerrainAabb,
): boolean => {
  const minX = Math.min(aabb.minX, aabb.maxX);
  const maxX = Math.max(aabb.minX, aabb.maxX);
  const minZ = Math.min(aabb.minZ, aabb.maxZ);
  const maxZ = Math.max(aabb.minZ, aabb.maxZ);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let enter = 0;
  let exit = 1;

  if (Math.abs(dx) <= AABB_EPSILON) {
    if (a.x < minX - AABB_EPSILON || a.x > maxX + AABB_EPSILON) {
      return false;
    }
  } else {
    let axisEnter = (minX - a.x) / dx;
    let axisExit = (maxX - a.x) / dx;
    if (axisEnter > axisExit) {
      [axisEnter, axisExit] = [axisExit, axisEnter];
    }
    enter = Math.max(enter, axisEnter);
    exit = Math.min(exit, axisExit);
    if (enter > exit + AABB_EPSILON) {
      return false;
    }
  }

  if (Math.abs(dz) <= AABB_EPSILON) {
    if (a.z < minZ - AABB_EPSILON || a.z > maxZ + AABB_EPSILON) {
      return false;
    }
  } else {
    let axisEnter = (minZ - a.z) / dz;
    let axisExit = (maxZ - a.z) / dz;
    if (axisEnter > axisExit) {
      [axisEnter, axisExit] = [axisExit, axisEnter];
    }
    enter = Math.max(enter, axisEnter);
    exit = Math.min(exit, axisExit);
    if (enter > exit + AABB_EPSILON) {
      return false;
    }
  }

  return exit >= -AABB_EPSILON && enter <= 1 + AABB_EPSILON;
};

export const segmentIntersectsObstacle = (
  a: TerrainPoint,
  b: TerrainPoint,
  obstacle: TerrainObstacle,
  padding = 0,
): boolean => segmentIntersectsAabb(a, b, obstacleAabb(obstacle, padding));

export const obstacleOccupiesPoint = (
  obstacle: TerrainObstacle,
  point: TerrainPoint,
  padding = 0,
): boolean => pointInAabb(point, obstacleAabb(obstacle, padding));

export const lineOfSightBlockersBetween = (
  terrain: RuntimeTerrain,
  a: TerrainPoint,
  b: TerrainPoint,
): TerrainObstacle[] => {
  return terrain.obstacles.filter(
    (obstacle) => obstacle.blocksLineOfSight && segmentIntersectsObstacle(a, b, obstacle),
  );
};

export const hasLineOfSight = (terrain: RuntimeTerrain, a: Vec3, b: Vec3): boolean => {
  for (const obstacle of terrain.obstacles) {
    if (obstacle.blocksLineOfSight && segmentIntersectsObstacle(a, b, obstacle)) {
      return false;
    }
  }
  return true;
};

export const movementBlockersAt = (
  terrain: RuntimeTerrain,
  point: TerrainPoint,
  padding = 0,
): TerrainObstacle[] => {
  return terrain.obstacles.filter(
    (obstacle) => obstacle.blocksMovement && obstacleOccupiesPoint(obstacle, point, padding),
  );
};

export const movementBlockersBetween = (
  terrain: RuntimeTerrain,
  a: TerrainPoint,
  b: TerrainPoint,
  padding = 0,
): TerrainObstacle[] => {
  return terrain.obstacles.filter(
    (obstacle) => obstacle.blocksMovement && segmentIntersectsObstacle(a, b, obstacle, padding),
  );
};

export const isMovementBlockedAt = (
  terrain: RuntimeTerrain,
  point: TerrainPoint,
  padding = 0,
): boolean => {
  for (const obstacle of terrain.obstacles) {
    if (obstacle.blocksMovement && obstacleOccupiesPoint(obstacle, point, padding)) {
      return true;
    }
  }
  return false;
};

export const nearestCover = (
  terrain: RuntimeTerrain,
  position: Vec3,
  threat: Vec3,
  maxDistance: number,
): CoverNode | undefined => {
  let best: CoverNode | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const node of terrain.coverNodes) {
    const dx = node.position.x - position.x;
    const dz = node.position.z - position.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > maxDistance * maxDistance) {
      continue;
    }
    const threatDot =
      (threat.x - node.position.x) * node.normal.x + (threat.z - node.position.z) * node.normal.z;
    const score = distanceSq - node.coverQuality * 120 - (threatDot < 0 ? 50 : 0);
    if (score < bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
};
