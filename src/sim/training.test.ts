import { Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { createInitialBlimpState } from './physics';
import { TrainingSession } from './training';
import { type AxisValues } from './input';

const smoothControls: AxisValues = {
  vertical: 0,
  pitch: 0,
  forward: 0,
  yaw: 0
};

describe('training sessions', () => {
  test('hover box rewards staying near center with smooth sticks', () => {
    const session = new TrainingSession('hoverBox');
    const state = createInitialBlimpState();
    state.position.copy(session.targetPosition);

    for (let i = 0; i < 60; i += 1) {
      session.update(state, smoothControls, 1, 0, new Vector3(0, 1.6, 12));
    }

    expect(session.completed).toBe(true);
    expect(session.score).toBeGreaterThan(900);
  });

  test('precision stop penalizes arriving with too much velocity', () => {
    const session = new TrainingSession('precisionStop');
    const state = createInitialBlimpState();
    state.position.copy(session.targetPosition);
    state.velocity.set(2, 0, 0);

    session.update(state, smoothControls, 1 / 60, 0, new Vector3(0, 1.6, 12));

    expect(session.completed).toBe(true);
    expect(session.score).toBeLessThan(850);
  });
});
