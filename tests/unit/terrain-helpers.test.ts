import { describe, expect, it } from "vitest";
import type { RuntimeTerrain, TerrainObstacle } from "../../src/domain/battle";
import {
  hasLineOfSight,
  isMovementBlockedAt,
  lineOfSightBlockersBetween,
  movementBlockersAt,
  movementBlockersBetween,
  obstacleAabb,
  obstacleOccupiesPoint,
  segmentIntersectsAabb,
} from "../../src/simulation/terrain";

const testTerrain = (obstacles: TerrainObstacle[]): RuntimeTerrain => ({
  definition: {
    id: "test_terrain",
    displayName: "Test Terrain",
    size: { x: 100, z: 100 },
    movementModifier: 1,
    visibilityModifier: 1,
    coverDensity: 0,
    elevationModifier: 0,
    obstacleDensity: 0,
    description: "Unit-test terrain",
  },
  obstacles,
  coverNodes: [],
  warnings: [],
});

const obstacle = (patch: Partial<TerrainObstacle> = {}): TerrainObstacle => ({
  id: "blocker",
  kind: "building",
  position: { x: 0, y: 0, z: 0 },
  size: { x: 4, y: 4, z: 4 },
  blocksMovement: true,
  blocksLineOfSight: true,
  coverQuality: 0.6,
  ...patch,
});

describe("terrain helper geometry", () => {
  it("intersects thin AABBs that fall between legacy line samples", () => {
    const start = { x: 0, y: 0, z: 0 };
    const end = { x: 80, y: 0, z: 0 };
    const thinWall = obstacle({
      id: "thin-wall",
      position: { x: 40.5, y: 0, z: 0 },
      size: { x: 0.4, y: 4, z: 8 },
    });
    const terrain = testTerrain([thinWall]);

    expect(segmentIntersectsAabb(start, end, obstacleAabb(thinWall))).toBe(true);
    expect(lineOfSightBlockersBetween(terrain, start, end).map((entry) => entry.id)).toEqual([
      "thin-wall",
    ]);
    expect(hasLineOfSight(terrain, start, end)).toBe(false);
  });

  it("keeps clear segments and non-LOS obstacles from blocking visibility", () => {
    const start = { x: 0, y: 0, z: 3 };
    const end = { x: 80, y: 0, z: 3 };
    const solidWall = obstacle({
      id: "solid-wall",
      position: { x: 40, y: 0, z: 0 },
      size: { x: 4, y: 4, z: 2 },
    });
    const coverOnly = obstacle({
      id: "cover-only",
      position: { x: 40, y: 0, z: 3 },
      size: { x: 4, y: 4, z: 2 },
      blocksLineOfSight: false,
    });

    expect(segmentIntersectsAabb(start, end, obstacleAabb(solidWall))).toBe(false);
    expect(hasLineOfSight(testTerrain([solidWall, coverOnly]), start, end)).toBe(true);
  });

  it("treats edge touches and zero-length occupied segments as intersections", () => {
    const bounds = { minX: -2, maxX: 2, minZ: -1, maxZ: 1 };

    expect(segmentIntersectsAabb({ x: -4, z: 1 }, { x: 4, z: 1 }, bounds)).toBe(true);
    expect(segmentIntersectsAabb({ x: 0, z: 0 }, { x: 0, z: 0 }, bounds)).toBe(true);
    expect(segmentIntersectsAabb({ x: 0, z: 2 }, { x: 0, z: 2 }, bounds)).toBe(false);
  });

  it("reports terrain movement blockers occupying a point with optional padding", () => {
    const wall = obstacle({
      id: "movement-wall",
      position: { x: 10, y: 0, z: -3 },
      size: { x: 4, y: 3, z: 6 },
      blocksLineOfSight: false,
    });
    const nonMovement = obstacle({
      id: "visual-only",
      position: { x: 10, y: 0, z: -3 },
      size: { x: 4, y: 3, z: 6 },
      blocksMovement: false,
      blocksLineOfSight: false,
    });
    const terrain = testTerrain([nonMovement, wall]);

    expect(obstacleAabb(wall)).toEqual({ minX: 8, maxX: 12, minZ: -6, maxZ: 0 });
    expect(obstacleOccupiesPoint(wall, { x: 12, z: 0 })).toBe(true);
    expect(obstacleOccupiesPoint(wall, { x: 13, z: -3 })).toBe(false);
    expect(obstacleOccupiesPoint(wall, { x: 13, z: -3 }, 1)).toBe(true);
    expect(movementBlockersAt(terrain, { x: 10, z: -3 }).map((entry) => entry.id)).toEqual([
      "movement-wall",
    ]);
    expect(
      movementBlockersBetween(terrain, { x: 6, z: -3 }, { x: 14, z: -3 }).map((entry) => entry.id),
    ).toEqual(["movement-wall"]);
    expect(movementBlockersBetween(terrain, { x: 6, z: 4 }, { x: 14, z: 4 })).toEqual([]);
    expect(isMovementBlockedAt(terrain, { x: 0, z: 0 })).toBe(false);
  });
});
