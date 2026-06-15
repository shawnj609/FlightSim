import { Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { defaultBlimpConfig } from '../config/blimpConfig';
import { createInitialBlimpState } from './physics';
import { resolveArenaCollisions, type AabbCollider } from './collisions';

describe('collision resolution', () => {
  test('bounces lightly off the floor and records a fault', () => {
    const state = createInitialBlimpState();
    state.position.y = 0.2;
    state.velocity.y = -1;

    const result = resolveArenaCollisions(state, defaultBlimpConfig, []);

    expect(state.position.y).toBeGreaterThanOrEqual(defaultBlimpConfig.hullHeight / 2);
    expect(state.velocity.y).toBeGreaterThan(0);
    expect(result.faults).toBe(1);
  });

  test('pushes away from obstacle boxes and marks the obstacle id', () => {
    const state = createInitialBlimpState();
    state.position.set(0, 2, 0);
    state.velocity.set(1, 0, 0);
    const collider: AabbCollider = {
      id: 'stage-edge',
      center: new Vector3(0, 2, 0),
      halfSize: new Vector3(1, 1, 1),
      restitution: 0.25
    };

    const result = resolveArenaCollisions(state, defaultBlimpConfig, [collider], 0.8);

    expect(result.hitIds).toContain('stage-edge');
    expect(result.faults).toBe(1);
    expect(state.position.distanceTo(collider.center)).toBeGreaterThan(1);
  });
});
