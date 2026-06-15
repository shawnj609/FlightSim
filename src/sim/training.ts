import { Vector3 } from 'three';
import { type AxisValues, defaultAxisValues } from './input';
import { type BlimpState, getForwardVector } from './physics';
import { clamp, signedAngleDifference } from './math';

export type TrainingMode = 'hoverBox' | 'gatePass' | 'precisionStop' | 'stagePass' | 'noseIn';

export interface GateTarget {
  id: string;
  position: Vector3;
  radius: number;
}

export interface TrainingSnapshot {
  mode: TrainingMode;
  label: string;
  objective: string;
  score: number;
  faults: number;
  elapsed: number;
  completed: boolean;
  activeGateIndex: number;
  targetPosition: Vector3;
}

const modeLabels: Record<TrainingMode, string> = {
  hoverBox: 'Hover box',
  gatePass: 'Gate pass',
  precisionStop: 'Precision stop',
  stagePass: 'Stage pass',
  noseIn: 'Nose-in control'
};

export const trainingModes: TrainingMode[] = ['hoverBox', 'gatePass', 'precisionStop', 'stagePass', 'noseIn'];

export function createGateCourse(): GateTarget[] {
  return [
    { id: 'gate-1', position: new Vector3(-12, 4.3, 8), radius: 2.3 },
    { id: 'gate-2', position: new Vector3(-4, 5.2, -5), radius: 2.15 },
    { id: 'gate-3', position: new Vector3(10.5, 4.6, -15), radius: 2.3 },
    { id: 'gate-4', position: new Vector3(2, 6, -25), radius: 2.2 },
    { id: 'gate-5', position: new Vector3(-11, 4.3, -31), radius: 2.3 }
  ];
}

export class TrainingSession {
  readonly gates = createGateCourse();
  mode: TrainingMode;
  elapsed = 0;
  score = 1000;
  faults = 0;
  completed = false;
  activeGateIndex = 0;
  targetPosition = new Vector3();
  private previousControls: AxisValues = { ...defaultAxisValues };
  private previousCollisionFaults = 0;
  private stageProgress = -20;

  constructor(mode: TrainingMode) {
    this.mode = mode;
    this.targetPosition.copy(this.computeTargetPosition());
  }

  reset(mode = this.mode): void {
    this.mode = mode;
    this.elapsed = 0;
    this.score = 1000;
    this.faults = 0;
    this.completed = false;
    this.activeGateIndex = 0;
    this.previousControls = { ...defaultAxisValues };
    this.previousCollisionFaults = 0;
    this.stageProgress = -20;
    this.targetPosition.copy(this.computeTargetPosition());
  }

  update(
    state: BlimpState,
    controls: AxisValues,
    dt: number,
    collisionFaults: number,
    cameraPosition: Vector3
  ): TrainingSnapshot {
    if (this.completed) {
      return this.snapshot();
    }

    this.elapsed += dt;
    this.applyCollisionPenalty(collisionFaults);
    this.applyStickSmoothnessPenalty(controls);

    if (this.mode === 'hoverBox') {
      this.updateHoverBox(state, dt);
    } else if (this.mode === 'gatePass') {
      this.updateGatePass(state, dt);
    } else if (this.mode === 'precisionStop') {
      this.updatePrecisionStop(state);
    } else if (this.mode === 'stagePass') {
      this.updateStagePass(state, dt);
    } else {
      this.updateNoseIn(state, dt, cameraPosition);
    }

    this.score = clamp(this.score, 0, 1000);
    this.previousControls = { ...controls };
    this.targetPosition.copy(this.computeTargetPosition());

    return this.snapshot();
  }

  snapshot(): TrainingSnapshot {
    return {
      mode: this.mode,
      label: modeLabels[this.mode],
      objective: this.objectiveText(),
      score: Math.round(this.score),
      faults: this.faults,
      elapsed: this.elapsed,
      completed: this.completed,
      activeGateIndex: this.activeGateIndex,
      targetPosition: this.targetPosition.clone()
    };
  }

  private updateHoverBox(state: BlimpState, dt: number): void {
    const center = new Vector3(0, 4.2, 12);
    const half = new Vector3(8, 2.2, 8);
    const offset = state.position.clone().sub(center);
    const outside = new Vector3(
      Math.max(0, Math.abs(offset.x) - half.x),
      Math.max(0, Math.abs(offset.y) - half.y),
      Math.max(0, Math.abs(offset.z) - half.z)
    ).length();
    const centerError = offset.length() * 0.12;

    this.score -= (outside * 18 + centerError) * dt;
    if (outside > 0) {
      this.faults += dt > 0 ? 0.02 : 0;
    }
    if (this.elapsed >= 60) {
      this.completed = true;
    }
  }

  private updateGatePass(state: BlimpState, dt: number): void {
    const gate = this.gates[this.activeGateIndex];
    if (!gate) {
      this.completed = true;
      return;
    }

    const distance = state.position.distanceTo(gate.position);
    this.score -= Math.max(0, distance - gate.radius) * dt * 0.6;

    if (distance < gate.radius && state.velocity.length() < 3.2) {
      this.activeGateIndex += 1;
      this.score += 18;
      if (this.activeGateIndex >= this.gates.length) {
        this.completed = true;
      }
    }
  }

  private updatePrecisionStop(state: BlimpState): void {
    const target = new Vector3(14, 4.6, -12);
    const distance = state.position.distanceTo(target);
    if (distance <= 1.1) {
      const speedPenalty = state.velocity.length() * 95;
      this.score -= speedPenalty;
      this.completed = true;
    } else {
      this.score -= distance * 0.015;
    }
  }

  private updateStagePass(state: BlimpState, dt: number): void {
    const inLane = Math.abs(state.position.x) < 5.4 && state.position.y > 4.4 && state.position.y < 7.2;
    if (!inLane) {
      this.score -= 8 * dt;
    }

    if (state.position.z < this.stageProgress) {
      this.stageProgress = state.position.z;
    }

    if (state.position.z < -31 && inLane) {
      this.completed = true;
      this.score += 35;
    }
  }

  private updateNoseIn(state: BlimpState, dt: number, cameraPosition: Vector3): void {
    this.updateGatePass(state, dt);
    const toCamera = cameraPosition.clone().sub(state.position);
    toCamera.y = 0;
    const forward = getForwardVector(state);
    forward.y = 0;
    const desiredYaw = Math.atan2(toCamera.x, -toCamera.z);
    const currentYaw = Math.atan2(forward.x, -forward.z);
    const yawError = Math.abs(signedAngleDifference(currentYaw, desiredYaw));
    this.score -= yawError * dt * 7;
  }

  private applyCollisionPenalty(collisionFaults: number): void {
    const newFaults = Math.max(0, collisionFaults - this.previousCollisionFaults);
    if (newFaults > 0) {
      this.faults += newFaults;
      this.score -= newFaults * 80;
    }
    this.previousCollisionFaults = collisionFaults;
  }

  private applyStickSmoothnessPenalty(controls: AxisValues): void {
    const jerk =
      Math.abs(controls.vertical - this.previousControls.vertical) +
      Math.abs(controls.pitch - this.previousControls.pitch) +
      Math.abs(controls.forward - this.previousControls.forward) +
      Math.abs(controls.yaw - this.previousControls.yaw);
    this.score -= jerk * 2.6;
  }

  private computeTargetPosition(): Vector3 {
    if (this.mode === 'hoverBox') {
      return new Vector3(0, 4.2, 12);
    }
    if (this.mode === 'precisionStop') {
      return new Vector3(14, 4.6, -12);
    }
    if (this.mode === 'stagePass') {
      return new Vector3(0, 5.6, -31);
    }

    return this.gates[this.activeGateIndex]?.position.clone() ?? this.gates[this.gates.length - 1].position.clone();
  }

  private objectiveText(): string {
    if (this.mode === 'hoverBox') {
      return 'Hold the transparent box for 60 seconds';
    }
    if (this.mode === 'gatePass') {
      return `Gate ${Math.min(this.activeGateIndex + 1, this.gates.length)} of ${this.gates.length}`;
    }
    if (this.mode === 'precisionStop') {
      return 'Arrive inside the ring with minimum speed';
    }
    if (this.mode === 'stagePass') {
      return 'Clean slow pass above stage lane';
    }

    return `Nose-in gate ${Math.min(this.activeGateIndex + 1, this.gates.length)} of ${this.gates.length}`;
  }
}
