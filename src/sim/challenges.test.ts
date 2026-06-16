import { Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { createInitialBlimpState } from './physics';
import { createChallenge } from './challenges';
import { Tutorial } from './tutorial';
import { defaultAxisValues } from './input';
import { type MissionContext } from './missionTypes';

const baseCtx: MissionContext = {
  spawn: new Vector3(0, 4.2, 16),
  ringAnchors: [],
  pilotCameraPosition: new Vector3(0, 1.55, 42),
  groundHeightAt: () => 0
};

describe('challenges', () => {
  test('station keeping completes with gold when held dead centre', () => {
    const mission = createChallenge('stationKeeping', baseCtx);
    const state = createInitialBlimpState();
    state.position.set(0, 5, 16); // mission centre = (spawn.x, max(4, ground+5), spawn.z)

    let view = mission.update(state, defaultAxisValues, 0.1, 0, baseCtx.pilotCameraPosition);
    for (let i = 0; i < 160; i += 1) {
      view = mission.update(state, defaultAxisValues, 0.1, 0, baseCtx.pilotCameraPosition);
    }

    expect(view.state).toBe('complete');
    expect(view.result?.medal).toBe('gold');
  });

  test('ring run clears every ring and reports a medal', () => {
    const ctx: MissionContext = {
      ...baseCtx,
      ringAnchors: [
        { position: new Vector3(0, 5, 10), radius: 3 },
        { position: new Vector3(0, 5, 0), radius: 3 },
        { position: new Vector3(0, 5, -10), radius: 3 }
      ]
    };
    const mission = createChallenge('ringRun', ctx);
    const state = createInitialBlimpState();

    let view = mission.update(state, defaultAxisValues, 0.05, 0, ctx.pilotCameraPosition);
    for (const ring of ctx.ringAnchors) {
      state.position.copy(ring.position);
      view = mission.update(state, defaultAxisValues, 0.05, 0, ctx.pilotCameraPosition);
    }

    expect(view.state).toBe('complete');
    expect(['gold', 'silver', 'bronze']).toContain(view.result?.medal);
  });

  test('spot landing completes after settling on the ring', () => {
    const mission = createChallenge('spotLanding', baseCtx);
    const state = createInitialBlimpState();
    // Target = (spawn.x + 14, ground, spawn.z - 24) = (14, 0, -8)
    state.position.set(14, 1, -8);
    state.velocity.set(0, 0, 0);

    let view = mission.update(state, defaultAxisValues, 0.1, 0, baseCtx.pilotCameraPosition);
    for (let i = 0; i < 30; i += 1) {
      view = mission.update(state, defaultAxisValues, 0.1, 0, baseCtx.pilotCameraPosition);
    }

    expect(view.state).toBe('complete');
    expect(view.result?.medal).toBe('gold');
  });
});

describe('tutorial', () => {
  test('advances past the altitude step when the band is held', () => {
    const tutorial = new Tutorial(baseCtx);
    const state = createInitialBlimpState();
    // baseY = max(4, ground+4) = 4; holdAlt = 7. Band is centred on spawn x/z.
    state.position.set(0, 7, 16);

    let view = tutorial.update(state, defaultAxisValues, 0.1, 0, baseCtx.pilotCameraPosition);
    for (let i = 0; i < 40; i += 1) {
      view = tutorial.update(state, defaultAxisValues, 0.1, 0, baseCtx.pilotCameraPosition);
    }

    expect(view.progress.startsWith('Step 2')).toBe(true);
  });
});
