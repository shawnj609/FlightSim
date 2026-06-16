import { describe, expect, test } from 'vitest';
import { Terrain } from './terrain';

describe('Terrain', () => {
  const terrain = new Terrain({ seed: 4242, size: 120, segments: 24 });

  test('heights are finite and bounded across the map', () => {
    for (let x = -60; x <= 60; x += 12) {
      for (let z = -60; z <= 60; z += 12) {
        const h = terrain.terrainHeightAt(x, z);
        expect(Number.isFinite(h)).toBe(true);
        expect(h).toBeGreaterThan(-30);
        expect(h).toBeLessThan(40);
      }
    }
  });

  test('water surface sits at the water line and is consistent', () => {
    for (let x = -60; x <= 60; x += 8) {
      for (let z = -60; z <= 60; z += 8) {
        const surface = terrain.surfaceHeightAt(x, z);
        if (terrain.isWaterAt(x, z)) {
          expect(surface).toBeCloseTo(terrain.waterLevel, 5);
        } else {
          expect(surface).toBeGreaterThanOrEqual(terrain.waterLevel - 1e-6);
        }
      }
    }
  });

  test('same seed reproduces the same height field', () => {
    const a = new Terrain({ seed: 7, size: 120, segments: 8 });
    const b = new Terrain({ seed: 7, size: 120, segments: 8 });
    expect(a.terrainHeightAt(12, -8)).toEqual(b.terrainHeightAt(12, -8));
  });
});
