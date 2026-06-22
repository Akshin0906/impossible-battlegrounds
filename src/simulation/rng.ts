import { stableHash } from "./resultHash";

export type RngStreamName =
  | "terrain"
  | "deployment"
  | "ai"
  | "combat"
  | "morale"
  | "wounds"
  | "odds";

export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextUint(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return (mixed ^ (mixed >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint() / 4294967296;
  }

  intInclusive(min: number, max: number): number {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return low + (this.nextUint() % (high - low + 1));
  }

  chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }

  fork(label: string): DeterministicRng {
    return new DeterministicRng(seedToUint(`${this.state}:${label}`));
  }
}

export const seedToUint = (seed: string): number => Number.parseInt(stableHash(seed), 16) >>> 0;

export const createRng = (seed: string, stream: string): DeterministicRng =>
  new DeterministicRng(seedToUint(`${seed}:${stream}`));

export const createRngStreams = (seed: string): Record<RngStreamName, DeterministicRng> => ({
  terrain: createRng(seed, "terrain"),
  deployment: createRng(seed, "deployment"),
  ai: createRng(seed, "ai"),
  combat: createRng(seed, "combat"),
  morale: createRng(seed, "morale"),
  wounds: createRng(seed, "wounds"),
  odds: createRng(seed, "odds"),
});
