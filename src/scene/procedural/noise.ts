import { Rng } from '../../sim/rng';

/**
 * Seeded 2D value noise with fractal (fBm) summation. Deterministic from a seed,
 * smooth, and cheap — good enough for rolling terrain without external deps.
 */
export class ValueNoise2D {
  private readonly perm: Int32Array;
  private readonly grad: Float32Array;
  private readonly size = 256;
  private readonly mask = 255;

  constructor(seed: number) {
    const rng = new Rng(seed);
    this.grad = new Float32Array(this.size);
    for (let i = 0; i < this.size; i += 1) {
      this.grad[i] = rng.next() * 2 - 1;
    }
    // Fisher-Yates shuffle of a permutation table, then duplicated to avoid wrapping.
    const base = new Int32Array(this.size);
    for (let i = 0; i < this.size; i += 1) {
      base[i] = i;
    }
    for (let i = this.size - 1; i > 0; i -= 1) {
      const j = rng.int(0, i);
      const tmp = base[i];
      base[i] = base[j];
      base[j] = tmp;
    }
    this.perm = new Int32Array(this.size * 2);
    for (let i = 0; i < this.size * 2; i += 1) {
      this.perm[i] = base[i & this.mask];
    }
  }

  private valueAt(ix: number, iy: number): number {
    const h = this.perm[(this.perm[ix & this.mask] + iy) & this.mask];
    return this.grad[h];
  }

  /** Single-octave value noise in roughly [-1, 1]. */
  noise(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const u = smooth(fx);
    const v = smooth(fy);

    const n00 = this.valueAt(x0, y0);
    const n10 = this.valueAt(x0 + 1, y0);
    const n01 = this.valueAt(x0, y0 + 1);
    const n11 = this.valueAt(x0 + 1, y0 + 1);

    const nx0 = n00 + (n10 - n00) * u;
    const nx1 = n01 + (n11 - n01) * u;
    return nx0 + (nx1 - nx0) * v;
  }

  /** Fractal Brownian motion: layered octaves. Returns roughly [-1, 1]. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      sum += amplitude * this.noise(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }
}

function smooth(t: number): number {
  // 6t^5 - 15t^4 + 10t^3 — smoothstep with zero 1st/2nd derivatives at ends.
  return t * t * t * (t * (t * 6 - 15) + 10);
}
