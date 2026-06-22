import { describe, expect, it } from "vitest";
import {
  clamp,
  distance2,
  distanceSq2,
  headingTo,
  moveAway,
  moveToward,
  percent,
  quantize,
  quantizeVec3,
} from "../../src/simulation/deterministicMath";
import {
  DeterministicRng,
  createRng,
  createRngStreams,
  seedToUint,
} from "../../src/simulation/rng";
import { hashObject, stableHash, stableStringify } from "../../src/simulation/resultHash";

describe("deterministic result hashing primitives", () => {
  it("serializes objects in stable key order and omits undefined object fields", () => {
    const fixture = {
      b: 2,
      a: { d: 4, c: 3 },
      skip: undefined,
      list: [{ z: 1, y: 2 }, "unit"],
    };

    expect(stableStringify(fixture)).toBe(
      '{"a":{"c":3,"d":4},"b":2,"list":[{"y":2,"z":1},"unit"]}',
    );
    expect(hashObject(fixture)).toBe("c8e881ca");
  });

  it("pins representative FNV-1a hashes", () => {
    expect(stableHash("")).toBe("811c9dc5");
    expect(stableHash("abc")).toBe("1a47e90b");
    expect(stableHash("Impossible Battlegrounds")).toBe("756291ba");
    expect(
      hashObject({
        setup: { seed: "alpha", units: ["wolf", "knight"] },
        totals: { dead: 2, survivors: 5 },
      }),
    ).toBe("7c44092c");
  });
});

describe("deterministic RNG primitives", () => {
  it("pins the unsigned integer stream for fixed seeds", () => {
    const zeroSeed = new DeterministicRng(0);
    expect(Array.from({ length: 5 }, () => zeroSeed.nextUint())).toEqual([
      1144304738, 1416247, 958946056, 627933444, 2007157716,
    ]);

    const combatSeed = createRng("battle-seed", "combat");
    expect(Array.from({ length: 5 }, () => combatSeed.nextUint())).toEqual([
      3485091900, 476356173, 1269813817, 1217652699, 1809454890,
    ]);
  });

  it("uses stable seed hashing and independent named streams", () => {
    expect(seedToUint("battle-seed:combat")).toBe(1455907599);

    const streams = createRngStreams("stream-check");
    expect({
      terrain: streams.terrain.nextUint(),
      deployment: streams.deployment.nextUint(),
      ai: streams.ai.nextUint(),
      combat: streams.combat.nextUint(),
      morale: streams.morale.nextUint(),
      wounds: streams.wounds.nextUint(),
      odds: streams.odds.nextUint(),
    }).toEqual({
      terrain: 3148548211,
      deployment: 2261756500,
      ai: 128642083,
      combat: 2454568616,
      morale: 3554487928,
      wounds: 3790122760,
      odds: 3149872553,
    });
  });

  it("pins float, chance, and inclusive integer behavior", () => {
    const floatRng = createRng("battle-seed", "combat");
    expect(floatRng.nextFloat()).toBeCloseTo(0.8114361902698874, 15);
    expect(floatRng.nextFloat()).toBeCloseTo(0.11091031436808407, 15);
    expect(floatRng.nextFloat()).toBeCloseTo(0.295651568332687, 15);

    const rangeRng = createRng("range-check", "combat");
    expect(Array.from({ length: 10 }, () => rangeRng.intInclusive(-2.2, 2.2))).toEqual([
      2, 2, 1, -1, 0, 1, -2, 2, -1, 0,
    ]);

    expect(new DeterministicRng(0).chance(0)).toBe(false);
    expect(new DeterministicRng(0).chance(1)).toBe(true);
  });

  it("rejects inclusive integer ranges without an integer value", () => {
    expect(() => new DeterministicRng(1).intInclusive(2.2, 2.7)).toThrow(RangeError);
  });
});

describe("deterministic math primitives", () => {
  const terrainHeight = (x: number, z: number): number => x - z;

  it("clamps, quantizes, and computes percentages deterministically", () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-4, 0, 10)).toBe(0);
    expect(clamp(6, 0, 10)).toBe(6);
    expect(quantize(1.234, 0.05)).toBeCloseTo(1.25);
    expect(quantizeVec3({ x: 1.234, y: -2.236, z: 3.333 }, 0.05)).toEqual({
      x: 1.25,
      y: -2.25,
      z: 3.35,
    });
    expect(percent(3, 8)).toBe(37.5);
    expect(percent(3, 0)).toBe(0);
  });

  it("pins planar distance and heading helpers", () => {
    expect(distanceSq2({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(25);
    expect(distance2({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(headingTo({ x: 0, z: 0 }, { x: 1, z: 0 })).toBe(1.571);
    expect(headingTo({ x: 0, z: 0 }, { x: 0, z: 1 })).toBe(0);
  });

  it("moves toward or away on the x/z plane and requantizes terrain height", () => {
    expect(moveToward({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }, 2, terrainHeight)).toEqual({
      x: 1.2,
      y: -0.4,
      z: 1.6,
    });
    expect(moveToward({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }, 5, terrainHeight)).toEqual({
      x: 3,
      y: -1,
      z: 4,
    });
    expect(moveAway({ x: 2, y: 0, z: 0 }, { x: -1, y: 0, z: -4 }, 2.5, terrainHeight)).toEqual({
      x: 3.5,
      y: 1.5,
      z: 2,
    });
  });
});
