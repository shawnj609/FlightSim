/**
 * Tiny deterministic PRNG so procedural worlds reproduce exactly from a seed.
 * mulberry32: fast, good enough for terrain/scatter; not for cryptography.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force to a non-zero 32-bit integer.
    this.state = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p in [0, 1]. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a random element. */
  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }
}

/** Derive a fresh, well-spread seed (e.g. for a Regenerate press). */
export function deriveSeed(base: number, salt: number): number {
  let h = (Math.floor(base) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
