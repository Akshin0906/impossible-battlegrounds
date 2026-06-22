import type { Vec3 } from "../domain/battle";

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const quantize = (value: number, step = 0.01): number => Math.round(value / step) * step;

export const quantizeVec3 = (value: Vec3, step = 0.01): Vec3 => ({
  x: quantize(value.x, step),
  y: quantize(value.y, step),
  z: quantize(value.z, step),
});

export const distanceSq2 = (a: Pick<Vec3, "x" | "z">, b: Pick<Vec3, "x" | "z">): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};

export const distance2 = (a: Pick<Vec3, "x" | "z">, b: Pick<Vec3, "x" | "z">): number =>
  Math.sqrt(distanceSq2(a, b));

export const moveToward = (
  current: Vec3,
  target: Vec3,
  maxDistance: number,
  terrainHeight: (x: number, z: number) => number,
): Vec3 => {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length <= 0.001 || length <= maxDistance) {
    return quantizeVec3({ x: target.x, y: terrainHeight(target.x, target.z), z: target.z });
  }
  const ratio = maxDistance / length;
  const x = current.x + dx * ratio;
  const z = current.z + dz * ratio;
  return quantizeVec3({ x, y: terrainHeight(x, z), z });
};

export const moveAway = (
  current: Vec3,
  threat: Vec3,
  maxDistance: number,
  terrainHeight: (x: number, z: number) => number,
): Vec3 => {
  const dx = current.x - threat.x;
  const dz = current.z - threat.z;
  const length = Math.sqrt(dx * dx + dz * dz) || 1;
  const x = current.x + (dx / length) * maxDistance;
  const z = current.z + (dz / length) * maxDistance;
  return quantizeVec3({ x, y: terrainHeight(x, z), z });
};

export const headingTo = (from: Pick<Vec3, "x" | "z">, to: Pick<Vec3, "x" | "z">): number =>
  quantize(Math.atan2(to.x - from.x, to.z - from.z), 0.001);

export const percent = (value: number, total: number): number =>
  total <= 0 ? 0 : quantize((value / total) * 100, 0.1);
