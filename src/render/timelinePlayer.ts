import {
  TIMELINE_STRIDE,
  codeToAction,
  codeToHealthState,
  codeToMoraleState,
  type BattleResult,
  type UnitFinalState,
  type Vec3,
} from "../domain/battle";

export type PlaybackUnitState = Pick<
  UnitFinalState,
  | "id"
  | "armyId"
  | "squadId"
  | "unitTypeId"
  | "position"
  | "rotationY"
  | "health"
  | "morale"
  | "healthState"
  | "moraleState"
  | "currentAction"
  | "formationCohesion"
> & {
  formationId: string;
  loadoutId: string;
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const unpack = (
  result: BattleResult,
  sampleIndex: number,
  unitIndex: number,
): PlaybackUnitState => {
  const sample = result.timeline.samples[sampleIndex] ?? result.timeline.samples[0]!;
  const offset = unitIndex * TIMELINE_STRIDE;
  const meta = result.timeline.unitMeta[unitIndex]!;
  return {
    id: meta.id,
    armyId: meta.armyId,
    squadId: meta.squadId,
    unitTypeId: meta.unitTypeId,
    formationId: meta.formationId,
    loadoutId: meta.loadoutId,
    position: {
      x: sample.unitState[offset] ?? 0,
      y: sample.unitState[offset + 1] ?? 0,
      z: sample.unitState[offset + 2] ?? 0,
    },
    rotationY: sample.unitState[offset + 3] ?? 0,
    health: sample.unitState[offset + 4] ?? 0,
    morale: sample.unitState[offset + 5] ?? 0,
    healthState: codeToHealthState[sample.unitState[offset + 6] ?? 0] ?? "healthy",
    moraleState: codeToMoraleState[sample.unitState[offset + 7] ?? 0] ?? "steady",
    currentAction: codeToAction[sample.unitState[offset + 8] ?? 0] ?? "waiting",
    formationCohesion: sample.unitState[offset + 9] ?? 0,
  };
};

export const unitStateAt = (
  result: BattleResult,
  unitId: string,
  time: number,
): PlaybackUnitState | undefined => {
  const unitIndex = result.timeline.unitIds.indexOf(unitId);
  if (unitIndex < 0) {
    return undefined;
  }
  return unitStateByIndexAt(result, unitIndex, time);
};

export const unitStateByIndexAt = (
  result: BattleResult,
  unitIndex: number,
  time: number,
): PlaybackUnitState => {
  const samples = result.timeline.samples;
  if (samples.length === 1 || time <= samples[0]!.time) {
    return unpack(result, 0, unitIndex);
  }
  const lastIndex = samples.length - 1;
  if (time >= samples[lastIndex]!.time) {
    return unpack(result, lastIndex, unitIndex);
  }
  const sampleIndex = Math.min(lastIndex - 1, Math.floor(time / result.timeline.sampleInterval));
  const current = samples[sampleIndex]!;
  const next = samples[sampleIndex + 1]!;
  const t = Math.max(0, Math.min(1, (time - current.time) / (next.time - current.time)));
  const a = unpack(result, sampleIndex, unitIndex);
  const b = unpack(result, sampleIndex + 1, unitIndex);
  const position: Vec3 = {
    x: lerp(a.position.x, b.position.x, t),
    y: lerp(a.position.y, b.position.y, t),
    z: lerp(a.position.z, b.position.z, t),
  };
  return {
    ...b,
    position,
    rotationY: lerp(a.rotationY, b.rotationY, t),
    health: lerp(a.health, b.health, t),
    morale: lerp(a.morale, b.morale, t),
    formationCohesion: lerp(a.formationCohesion, b.formationCohesion, t),
  };
};

export const allUnitStatesAt = (result: BattleResult, time: number): PlaybackUnitState[] =>
  result.timeline.unitIds.map((_, index) => unitStateByIndexAt(result, index, time));
