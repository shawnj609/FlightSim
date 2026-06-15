import { describe, expect, test } from 'vitest';
import { defaultBlimpConfig, netEffectiveMassGrams } from './blimpConfig';

describe('real blimp default specs', () => {
  test('uses Dom notes for a roughly 30 ft by 5 ft by 8 ft blimp', () => {
    expect(defaultBlimpConfig.hullLength).toBeGreaterThan(9);
    expect(defaultBlimpConfig.hullLength).toBeLessThan(9.3);
    expect(defaultBlimpConfig.hullWidth).toBeGreaterThan(1.45);
    expect(defaultBlimpConfig.hullWidth).toBeLessThan(1.6);
    expect(defaultBlimpConfig.hullHeight).toBeGreaterThan(2.35);
    expect(defaultBlimpConfig.hullHeight).toBeLessThan(2.5);
  });

  test('keeps inertial mass near 18-20 lb with only a few hundred grams effective weight', () => {
    expect(defaultBlimpConfig.mass).toBeGreaterThan(8.1);
    expect(defaultBlimpConfig.mass).toBeLessThan(9.2);
    expect(netEffectiveMassGrams(defaultBlimpConfig)).toBeGreaterThan(20);
    expect(netEffectiveMassGrams(defaultBlimpConfig)).toBeLessThan(400);
  });
});
