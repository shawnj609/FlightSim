import { Vector3 } from 'three';
import { type AxisValues } from './input';
import { type BlimpState, getForwardVector } from './physics';
import { signedAngleDifference } from './math';
import { type Mission, type MissionContext, type MissionResult, type MissionView, type RingAnchor } from './missionTypes';

interface TutorialStep {
  instruction: string;
  hint: string;
  hold: number;
  test: (state: BlimpState) => boolean;
  beacon?: Vector3;
  box?: { center: Vector3; half: Vector3 };
  ring?: boolean;
}

const TUTORIAL_CYAN = 0x65d9ff;

/** A coached, step-by-step introduction to the controls. Auto-advances on hold. */
export class Tutorial implements Mission {
  readonly usesRingCourse = true;
  readonly ringAnchors: RingAnchor[];
  private readonly steps: TutorialStep[];
  private step = 0;
  private holdTimer = 0;
  private elapsed = 0;
  private result?: MissionResult;

  constructor(ctx: MissionContext) {
    const { spawn } = ctx;
    const groundY = ctx.groundHeightAt(spawn.x, spawn.z);
    const baseY = Math.max(4, groundY + 4);
    const holdAlt = baseY + 3;

    const band = { center: new Vector3(spawn.x, holdAlt, spawn.z), half: new Vector3(4, 1.2, 4) };
    const beacon2 = new Vector3(spawn.x - 14, holdAlt, spawn.z - 6);
    const beacon3 = new Vector3(spawn.x, holdAlt, spawn.z - 18);
    const beacon4 = new Vector3(spawn.x + 14, holdAlt, spawn.z - 30);
    const ring = new Vector3(spawn.x, holdAlt, spawn.z - 44);
    this.ringAnchors = [{ position: ring, radius: 3 }];

    this.steps = [
      {
        instruction: 'Climb with vertical thrust and hold the highlighted altitude band.',
        hint: 'W / S (or left stick up–down). Centre the stick to stop climbing — buoyancy holds you.',
        hold: 3,
        box: band,
        test: (s) => Math.abs(s.position.y - holdAlt) < 1.2
      },
      {
        instruction: 'Yaw to point the red nose at the beacon.',
        hint: 'Left / Right arrows (or right stick X). The blimp turns slowly — be patient.',
        hold: 2.5,
        beacon: beacon2,
        test: (s) => yawErrorTo(s, beacon2) < 0.22
      },
      {
        instruction: 'Ease forward to the beacon, then centre the stick and let it coast to a stop.',
        hint: 'Up / Down arrows (or right stick Y). It drifts — back off early.',
        hold: 1.2,
        beacon: beacon3,
        test: (s) => s.position.distanceTo(beacon3) < 3 && s.velocity.length() < 0.7
      },
      {
        instruction: 'Combine yaw and forward to reach the offset beacon.',
        hint: 'Turn toward it, add a little forward, then straighten up.',
        hold: 0.6,
        beacon: beacon4,
        test: (s) => s.position.distanceTo(beacon4) < 3.5
      },
      {
        instruction: 'Approach slowly and fly through the ring.',
        hint: 'Line up the nose with the ring and glide through the middle.',
        hold: 0,
        ring: true,
        test: (s) => s.position.distanceTo(ring) < 3
      }
    ];
  }

  reset(): void {
    this.step = 0;
    this.holdTimer = 0;
    this.elapsed = 0;
    this.result = undefined;
  }

  update(state: BlimpState, _controls: AxisValues, dt: number, contacts: number, _cameraPosition: Vector3): MissionView {
    const current = this.steps[Math.min(this.step, this.steps.length - 1)];

    if (!this.result) {
      this.elapsed += dt;
      if (current.test(state)) {
        this.holdTimer += dt;
      } else {
        this.holdTimer = 0;
      }
      if (this.holdTimer >= current.hold) {
        this.step += 1;
        this.holdTimer = 0;
        if (this.step >= this.steps.length) {
          this.result = {
            title: 'Tutorial complete',
            medal: 'none',
            message: 'Nicely done. Try a challenge, or switch to a scene and free-fly.',
            lines: [
              { label: 'Steps', value: `${this.steps.length}` },
              { label: 'Time', value: `${this.elapsed.toFixed(0)} s` }
            ]
          };
        }
      }
    }

    const done = Boolean(this.result);
    const holdLabel = current.hold > 0 && !done ? ` (${Math.min(this.holdTimer, current.hold).toFixed(1)}/${current.hold.toFixed(1)}s)` : '';
    return {
      title: 'Tutorial',
      objective: done ? 'Tutorial complete.' : current.instruction,
      hint: done ? '' : current.hint,
      progress: done ? `Step ${this.steps.length}/${this.steps.length}` : `Step ${this.step + 1}/${this.steps.length}${holdLabel}`,
      timerSeconds: this.elapsed,
      contacts,
      state: done ? 'complete' : 'active',
      result: this.result,
      beacon: done ? undefined : current.beacon ? { position: current.beacon, color: TUTORIAL_CYAN } : undefined,
      stationBox: done ? undefined : current.box ? { center: current.box.center, halfSize: current.box.half, color: TUTORIAL_CYAN } : undefined,
      ringActiveIndex: done ? this.ringAnchors.length : 0
    };
  }
}

function yawErrorTo(state: BlimpState, target: Vector3): number {
  const to = target.clone().sub(state.position);
  to.y = 0;
  const forward = getForwardVector(state);
  forward.y = 0;
  const desiredYaw = Math.atan2(to.x, -to.z);
  const currentYaw = Math.atan2(forward.x, -forward.z);
  return Math.abs(signedAngleDifference(currentYaw, desiredYaw));
}
