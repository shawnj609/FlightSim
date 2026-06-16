import { describe, expect, test } from 'vitest';
import { Rng, deriveSeed } from './rng';

describe('Rng', () => {
  test('same seed produces the same sequence', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  test('different seeds diverge', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  test('next stays in [0, 1)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('range and int respect bounds', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i += 1) {
      const f = rng.range(-3, 5);
      expect(f).toBeGreaterThanOrEqual(-3);
      expect(f).toBeLessThan(5);
      const n = rng.int(2, 6);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(6);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  test('deriveSeed is deterministic and spreads values', () => {
    expect(deriveSeed(100, 0)).toEqual(deriveSeed(100, 0));
    expect(deriveSeed(100, 0)).not.toEqual(deriveSeed(100, 1));
  });
});
