import { describe, expect, test } from 'vitest';
import { defaultBlimpConfig } from '../config/blimpConfig';
import { createInitialBlimpState, getForwardVector, stepBlimp } from './physics';
import { type AxisValues } from './input';

const zeroControls: AxisValues = {
  vertical: 0,
  pitch: 0,
  forward: 0,
  yaw: 0
};

describe('blimp physics', () => {
  test('near-neutral buoyancy drifts slowly with vertical motors centered off', () => {
    const config = { ...defaultBlimpConfig, windStrength: 0, buoyancyRatio: 1 };
    const state = createInitialBlimpState();
    const startY = state.position.y;

    for (let i = 0; i < 120; i += 1) {
      stepBlimp(state, zeroControls, config, 1 / 60);
    }

    expect(Math.abs(state.position.y - startY)).toBeLessThan(0.05);
    expect(Math.abs(state.motors.vertical)).toBe(0);
  });

  test('forward motor spools up slowly before reaching command', () => {
    const config = { ...defaultBlimpConfig, windStrength: 0, motorLag: 1.2 };
    const state = createInitialBlimpState();

    stepBlimp(state, { ...zeroControls, forward: 1 }, config, 1 / 60);

    expect(state.motors.forward).toBeGreaterThan(0);
    expect(state.motors.forward).toBeLessThan(0.05);
  });

  test('keeps drifting after forward input is released', () => {
    const config = { ...defaultBlimpConfig, windStrength: 0 };
    const state = createInitialBlimpState();

    for (let i = 0; i < 180; i += 1) {
      stepBlimp(state, { ...zeroControls, forward: 1 }, config, 1 / 60);
    }
    const speedAtRelease = state.velocity.length();

    for (let i = 0; i < 12; i += 1) {
      stepBlimp(state, zeroControls, config, 1 / 60);
    }

    expect(speedAtRelease).toBeGreaterThan(0.8);
    expect(state.velocity.length()).toBeGreaterThan(0.45);
  });

  test('positive pitch raises the nose direction over time', () => {
    const config = { ...defaultBlimpConfig, windStrength: 0 };
    const state = createInitialBlimpState();

    for (let i = 0; i < 120; i += 1) {
      stepBlimp(state, { ...zeroControls, pitch: 1 }, config, 1 / 60);
    }

    expect(getForwardVector(state).y).toBeGreaterThan(0.08);
  });

  test('climb thrust pitches the nose down unless the pilot compensates', () => {
    const config = { ...defaultBlimpConfig, windStrength: 0 };
    const uncorrected = createInitialBlimpState();
    const corrected = createInitialBlimpState();

    for (let i = 0; i < 180; i += 1) {
      stepBlimp(uncorrected, { ...zeroControls, vertical: 1 }, config, 1 / 60);
      stepBlimp(corrected, { ...zeroControls, vertical: 1, pitch: 0.35 }, config, 1 / 60);
    }

    expect(getForwardVector(uncorrected).y).toBeLessThan(-0.05);
    expect(getForwardVector(corrected).y).toBeGreaterThan(getForwardVector(uncorrected).y + 0.08);
  });

  test('yawing creates a nose dip that needs pitch discipline', () => {
    const config = { ...defaultBlimpConfig, windStrength: 0 };
    const state = createInitialBlimpState();

    for (let i = 0; i < 180; i += 1) {
      stepBlimp(state, { ...zeroControls, yaw: 1 }, config, 1 / 60);
    }

    expect(getForwardVector(state).y).toBeLessThan(-0.03);
    expect(Math.abs(state.swing.z)).toBeGreaterThan(0.01);
  });
});
