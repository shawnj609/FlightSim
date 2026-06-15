import { describe, expect, test } from 'vitest';
import {
  createDefaultCalibration,
  defaultAxisMap,
  mapRawGamepadAxes,
  normalizeAxis,
  type AxisCalibration
} from './input';

describe('input calibration and mapping', () => {
  test('treats centered left vertical stick as motors-off after deadzone', () => {
    const calibration = createDefaultCalibration(4);
    calibration[1].center = 0.06;

    const value = normalizeAxis(0.08, calibration[1], 0.08);

    expect(value).toBe(0);
  });

  test('maps DJI-style left Y up to positive climb thrust by default', () => {
    const calibration = createDefaultCalibration(4);
    const controls = mapRawGamepadAxes([0, -1, 0, 0], defaultAxisMap, calibration, 0.08);

    expect(controls.vertical).toBeCloseTo(1, 3);
  });

  test('maps left stick left to positive nose-up pitch by default', () => {
    const calibration = createDefaultCalibration(4);
    const controls = mapRawGamepadAxes([-1, 0, 0, 0], defaultAxisMap, calibration, 0.08);

    expect(controls.pitch).toBeCloseTo(1, 3);
  });

  test('allows axis remap and inversion without changing callers', () => {
    const calibration: AxisCalibration[] = createDefaultCalibration(6);
    const controls = mapRawGamepadAxes(
      [0, 0, 0, 0, 0.75, 0],
      {
        ...defaultAxisMap,
        yaw: { sourceAxis: 4, inverted: true }
      },
      calibration,
      0.05
    );

    expect(controls.yaw).toBeLessThan(-0.7);
  });
});
