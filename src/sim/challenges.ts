import { Vector3 } from 'three';
import { type AxisValues } from './input';
import { type BlimpState, getForwardVector } from './physics';
import { clamp, signedAngleDifference } from './math';
import {
  type Medal,
  type Mission,
  type MissionContext,
  type MissionResult,
  type MissionView,
  type RingAnchor
} from './missionTypes';

export type ChallengeId = 'stationKeeping' | 'ringRun' | 'spotLanding' | 'stagePass' | 'noseIn';

export const challengeLabels: Record<ChallengeId, string> = {
  stationKeeping: 'Station keeping',
  ringRun: 'Ring run',
  spotLanding: 'Spot landing',
  stagePass: 'Stage pass',
  noseIn: 'Nose-in hold'
};

/** Challenges only available in the indoor arena (need the stage / pilot floor). */
export const arenaOnlyChallenges: ChallengeId[] = ['stagePass', 'noseIn'];

export function createChallenge(id: ChallengeId, ctx: MissionContext): Mission {
  switch (id) {
    case 'stationKeeping':
      return new StationKeeping(ctx);
    case 'ringRun':
      return new RingRun(ctx);
    case 'spotLanding':
      return new SpotLanding(ctx);
    case 'stagePass':
      return new StagePass(ctx);
    case 'noseIn':
      return new NoseIn(ctx);
    default:
      return new StationKeeping(ctx);
  }
}

function pickMedal(gold: boolean, silver: boolean): Medal {
  if (gold) {
    return 'gold';
  }
  if (silver) {
    return 'silver';
  }
  return 'bronze';
}

function medalMessage(medal: Medal): string {
  switch (medal) {
    case 'gold':
      return 'Beautifully flown — smooth and precise.';
    case 'silver':
      return 'Solid run. Tighten it up for gold.';
    default:
      return 'Completed. Run it again to improve your medal.';
  }
}

// --- Station Keeping ----------------------------------------------------------

class StationKeeping implements Mission {
  readonly usesRingCourse = false;
  readonly ringAnchors: RingAnchor[] = [];
  private readonly center: Vector3;
  private readonly half = new Vector3(4, 2, 4);
  private readonly holdTarget = 15;
  private hold = 0;
  private errorSum = 0;
  private elapsed = 0;
  private result?: MissionResult;

  constructor(ctx: MissionContext) {
    const groundY = ctx.groundHeightAt(ctx.spawn.x, ctx.spawn.z);
    this.center = new Vector3(ctx.spawn.x, Math.max(4, groundY + 5), ctx.spawn.z);
  }

  reset(): void {
    this.hold = 0;
    this.errorSum = 0;
    this.elapsed = 0;
    this.result = undefined;
  }

  update(state: BlimpState, _controls: AxisValues, dt: number, contacts: number): MissionView {
    const offset = state.position.clone().sub(this.center);
    const inside =
      Math.abs(offset.x) < this.half.x && Math.abs(offset.y) < this.half.y && Math.abs(offset.z) < this.half.z;

    if (!this.result) {
      this.elapsed += dt;
      if (inside) {
        this.hold += dt;
        this.errorSum += offset.length() * dt;
      } else {
        this.hold = 0;
        this.errorSum = 0;
      }
      if (this.hold >= this.holdTarget) {
        const avgError = this.errorSum / Math.max(this.hold, 0.001);
        const medal = pickMedal(avgError < 1.2 && contacts === 0, avgError < 2 && contacts <= 1);
        this.result = {
          title: 'Station keeping',
          medal,
          message: medalMessage(medal),
          lines: [
            { label: 'Hold time', value: `${this.holdTarget.toFixed(0)} s` },
            { label: 'Avg. centre error', value: `${avgError.toFixed(2)} m` },
            { label: 'Contacts', value: `${contacts}` }
          ]
        };
      }
    }

    return {
      title: 'Station keeping',
      objective: 'Hold the blimp inside the box for 15 seconds.',
      hint: this.result ? '' : inside ? 'Good — keep it centred and smooth.' : 'Ease back into the glowing box.',
      progress: `Hold ${Math.min(this.hold, this.holdTarget).toFixed(1)} / ${this.holdTarget.toFixed(1)} s`,
      timerSeconds: this.elapsed,
      contacts,
      state: this.result ? 'complete' : 'active',
      result: this.result,
      stationBox: { center: this.center, halfSize: this.half, color: inside ? 0x55d6a9 : 0x65d9ff }
    };
  }
}

// --- Ring Run -----------------------------------------------------------------

class RingRun implements Mission {
  readonly usesRingCourse = true;
  readonly ringAnchors: RingAnchor[];
  private active = 0;
  private elapsed = 0;
  private readonly par: number;
  private result?: MissionResult;

  constructor(ctx: MissionContext) {
    this.ringAnchors = ctx.ringAnchors;
    this.par = estimatePar(ctx.spawn, ctx.ringAnchors);
  }

  reset(): void {
    this.active = 0;
    this.elapsed = 0;
    this.result = undefined;
  }

  update(state: BlimpState, _controls: AxisValues, dt: number, contacts: number): MissionView {
    if (!this.result) {
      this.elapsed += dt;
      const ring = this.ringAnchors[this.active];
      if (ring && state.position.distanceTo(ring.position) < ring.radius) {
        this.active += 1;
        if (this.active >= this.ringAnchors.length) {
          const t = this.elapsed;
          const medal = pickMedal(t <= this.par * 1.1 && contacts === 0, t <= this.par * 1.5 && contacts <= 2);
          this.result = {
            title: 'Ring run',
            medal,
            message: medalMessage(medal),
            lines: [
              { label: 'Time', value: `${t.toFixed(1)} s` },
              { label: 'Par', value: `${this.par.toFixed(1)} s` },
              { label: 'Rings', value: `${this.ringAnchors.length}` },
              { label: 'Contacts', value: `${contacts}` }
            ]
          };
        }
      }
    }

    const cleared = this.result ? this.ringAnchors.length : this.active;
    return {
      title: 'Ring run',
      objective: 'Fly through every ring in order.',
      hint: this.result ? '' : 'Aim for the glowing ring — the arrow points to the next one.',
      progress: `Ring ${Math.min(cleared + (this.result ? 0 : 1), this.ringAnchors.length)} / ${this.ringAnchors.length}`,
      timerSeconds: this.elapsed,
      contacts,
      state: this.result ? 'complete' : 'active',
      result: this.result,
      ringActiveIndex: this.active
    };
  }
}

// --- Spot Landing -------------------------------------------------------------

class SpotLanding implements Mission {
  readonly usesRingCourse = false;
  readonly ringAnchors: RingAnchor[] = [];
  private readonly target: Vector3;
  private readonly radius = 1.6;
  private readonly groundHeightAt: (x: number, z: number) => number;
  private settle = 0;
  private elapsed = 0;
  private bestDistance = Infinity;
  private result?: MissionResult;

  constructor(ctx: MissionContext) {
    this.groundHeightAt = ctx.groundHeightAt;
    const tx = ctx.spawn.x + 14;
    const tz = ctx.spawn.z - 24;
    this.target = new Vector3(tx, ctx.groundHeightAt(tx, tz), tz);
  }

  reset(): void {
    this.settle = 0;
    this.elapsed = 0;
    this.bestDistance = Infinity;
    this.result = undefined;
  }

  update(state: BlimpState, _controls: AxisValues, dt: number, contacts: number): MissionView {
    const horizontal = Math.hypot(state.position.x - this.target.x, state.position.z - this.target.z);
    const speed = state.velocity.length();
    const altAboveGround = state.position.y - this.groundHeightAt(state.position.x, state.position.z);
    const settled = horizontal < this.radius && speed < 0.6 && altAboveGround < 3.4;

    let hint = 'Drift over the landing ring.';
    if (!this.result) {
      this.elapsed += dt;
      if (settled) {
        this.settle += dt;
        this.bestDistance = Math.min(this.bestDistance, horizontal);
        hint = 'Hold it steady…';
      } else {
        this.settle = 0;
        if (horizontal < this.radius) {
          hint = 'Ease down and stop.';
        }
      }
      if (this.settle >= 2) {
        const d = this.bestDistance;
        const medal = pickMedal(d < 0.7 && contacts === 0, d < 1.3 && contacts <= 1);
        this.result = {
          title: 'Spot landing',
          medal,
          message: medalMessage(medal),
          lines: [
            { label: 'Centre offset', value: `${d.toFixed(2)} m` },
            { label: 'Settle time', value: '2.0 s' },
            { label: 'Contacts', value: `${contacts}` }
          ]
        };
      }
    }

    return {
      title: 'Spot landing',
      objective: 'Settle gently inside the landing ring and hold for 2 s.',
      hint: this.result ? '' : hint,
      progress: `${horizontal.toFixed(1)} m · ${speed.toFixed(1)} m/s`,
      timerSeconds: this.elapsed,
      contacts,
      state: this.result ? 'complete' : 'active',
      result: this.result,
      groundRing: { position: this.target, radius: this.radius, color: settled ? 0x55d6a9 : 0xffd24a }
    };
  }
}

// --- Stage Pass (arena) -------------------------------------------------------

class StagePass implements Mission {
  readonly usesRingCourse = false;
  readonly ringAnchors: RingAnchor[] = [];
  private elapsed = 0;
  private laneBreaks = 0;
  private armed = false;
  private result?: MissionResult;

  constructor(_ctx: MissionContext) {
    // Stage pass uses fixed arena geometry; context is unused.
  }

  reset(): void {
    this.elapsed = 0;
    this.laneBreaks = 0;
    this.armed = false;
    this.result = undefined;
  }

  update(state: BlimpState, _controls: AxisValues, dt: number, contacts: number): MissionView {
    const inZone = state.position.z < -14 && state.position.z > -32;
    const inBand = Math.abs(state.position.x) < 5.4 && state.position.y > 4.2 && state.position.y < 7.4;
    const speed = state.velocity.length();

    if (!this.result) {
      this.elapsed += dt;
      if (inZone) {
        this.armed = true;
        if (!inBand || speed > 3) {
          this.laneBreaks += dt;
        }
      }
      if (this.armed && state.position.z < -31 && inBand) {
        const breaks = this.laneBreaks;
        const medal = pickMedal(breaks < 0.4 && contacts === 0, breaks < 1.6 && contacts <= 1);
        this.result = {
          title: 'Stage pass',
          medal,
          message: medalMessage(medal),
          lines: [
            { label: 'Lane/speed faults', value: breaks < 0.4 ? 'clean' : `${breaks.toFixed(1)} s` },
            { label: 'Contacts', value: `${contacts}` }
          ]
        };
      }
    }

    let hint = 'Line up on the centre lane, slow and level.';
    if (inZone && !inBand) {
      hint = 'Stay over the stage lane and in the altitude band.';
    } else if (inZone && speed > 3) {
      hint = 'Slow down — this is a gentle pass.';
    }

    return {
      title: 'Stage pass',
      objective: 'Make a slow, level pass over the stage lane to the back.',
      hint: this.result ? '' : hint,
      progress: this.result ? 'Passed' : inZone ? 'Over stage' : this.armed ? 'Exiting' : 'Approach',
      timerSeconds: this.elapsed,
      contacts,
      state: this.result ? 'complete' : 'active',
      result: this.result,
      beacon: { position: new Vector3(0, 5.8, -31), color: 0xffd24a }
    };
  }
}

// --- Nose-In Hold (arena) -----------------------------------------------------

class NoseIn implements Mission {
  readonly usesRingCourse = false;
  readonly ringAnchors: RingAnchor[] = [];
  private readonly center = new Vector3(0, 5, 0);
  private readonly half = new Vector3(5, 2.5, 5);
  private readonly holdTarget = 12;
  private readonly pilot: Vector3;
  private hold = 0;
  private yawSum = 0;
  private elapsed = 0;
  private result?: MissionResult;

  constructor(ctx: MissionContext) {
    this.pilot = ctx.pilotCameraPosition.clone();
  }

  reset(): void {
    this.hold = 0;
    this.yawSum = 0;
    this.elapsed = 0;
    this.result = undefined;
  }

  update(state: BlimpState, _controls: AxisValues, dt: number, contacts: number): MissionView {
    const offset = state.position.clone().sub(this.center);
    const inside =
      Math.abs(offset.x) < this.half.x && Math.abs(offset.y) < this.half.y && Math.abs(offset.z) < this.half.z;

    const toPilot = this.pilot.clone().sub(state.position);
    toPilot.y = 0;
    const forward = getForwardVector(state);
    forward.y = 0;
    const desiredYaw = Math.atan2(toPilot.x, -toPilot.z);
    const currentYaw = Math.atan2(forward.x, -forward.z);
    const yawError = Math.abs(signedAngleDifference(currentYaw, desiredYaw));
    const facing = yawError < 0.26;

    if (!this.result) {
      this.elapsed += dt;
      if (inside && facing) {
        this.hold += dt;
        this.yawSum += yawError * dt;
      } else {
        this.hold = 0;
        this.yawSum = 0;
      }
      if (this.hold >= this.holdTarget) {
        const avgYaw = this.yawSum / Math.max(this.hold, 0.001);
        const avgDeg = (avgYaw * 180) / Math.PI;
        const medal = pickMedal(avgDeg < 7 && contacts === 0, avgDeg < 12 && contacts <= 1);
        this.result = {
          title: 'Nose-in hold',
          medal,
          message: medalMessage(medal),
          lines: [
            { label: 'Hold time', value: `${this.holdTarget.toFixed(0)} s` },
            { label: 'Avg. nose error', value: `${avgDeg.toFixed(1)}°` },
            { label: 'Contacts', value: `${contacts}` }
          ]
        };
      }
    }

    const yawDeg = (yawError * 180) / Math.PI;
    return {
      title: 'Nose-in hold',
      objective: 'Hold position with the nose pointed at the pilot for 12 s.',
      hint: this.result ? '' : !inside ? 'Return to the box.' : !facing ? 'Yaw to face the pilot beacon.' : 'Hold it — nose on the pilot.',
      progress: `Hold ${Math.min(this.hold, this.holdTarget).toFixed(1)} / ${this.holdTarget.toFixed(1)} s · ${yawDeg.toFixed(0)}°`,
      timerSeconds: this.elapsed,
      contacts,
      state: this.result ? 'complete' : 'active',
      result: this.result,
      stationBox: { center: this.center, halfSize: this.half, color: inside && facing ? 0x55d6a9 : 0x65d9ff },
      beacon: { position: this.pilot.clone().setY(2.2), color: 0xff7070 }
    };
  }
}

function estimatePar(spawn: Vector3, anchors: RingAnchor[]): number {
  if (anchors.length === 0) {
    return 30;
  }
  let length = spawn.distanceTo(anchors[0].position);
  for (let i = 1; i < anchors.length; i += 1) {
    length += anchors[i - 1].position.distanceTo(anchors[i].position);
  }
  const cruiseSpeed = 3.4;
  return length / cruiseSpeed;
}
