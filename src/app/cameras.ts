import * as THREE from 'three';
import { type OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type BlimpConfig } from '../config/blimpConfig';
import { type BlimpState, getForwardVector } from '../sim/physics';
import { clamp } from '../sim/math';

export type CameraMode = 'follow' | 'pilot' | 'top' | 'orbit';

export const cameraModeLabels: Record<CameraMode, string> = {
  follow: 'Chase',
  pilot: 'Ground (pilot)',
  top: 'Tactical',
  orbit: 'Free orbit'
};

export const cameraModes: CameraMode[] = ['follow', 'pilot', 'top', 'orbit'];

/** Fixed arena operator-floor station; also used by the nose-in challenge. */
export const pilotCameraPosition = new THREE.Vector3(0, 1.55, 42);

export interface CameraUpdate {
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
  mode: CameraMode;
  state: BlimpState;
  config: BlimpConfig;
  dt: number;
  groundHeightAt: (x: number, z: number) => number;
  pilotStation?: THREE.Vector3;
}

/**
 * Stateful camera rig. The key idea for a floaty, swinging, slow-yawing blimp: never
 * bolt the camera to the body. Chase trails a *smoothed travel heading* in world space
 * with a locked horizon; aim is damped separately from position so the frame stays
 * stable enough to read motion, altitude and drift.
 */
export class CameraRig {
  private readonly heading = new THREE.Vector3(0, 0, -1);
  private readonly lookTarget = new THREE.Vector3();
  private readonly groundStation = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private headingReady = false;
  private groundStationReady = false;
  private lookReady = false;
  private snapNext = true;

  /** Reset smoothing so the next frame jumps into place instead of swooping across the map. */
  snap(): void {
    this.snapNext = true;
  }

  update(p: CameraUpdate): void {
    const { camera, orbit, mode, state, dt, groundHeightAt } = p;
    const snap = this.snapNext;
    this.snapNext = false;
    const pos = state.position;

    if (mode === 'orbit') {
      orbit.enabled = true;
      orbit.target.lerp(pos, alpha(dt, 5, snap));
      orbit.update();
      return;
    }

    orbit.enabled = false;
    camera.up.set(0, 1, 0);
    this.updateHeading(state, dt, snap);

    let posRate = 3.5;
    if (mode === 'follow') {
      const speed = Math.hypot(state.velocity.x, state.velocity.z);
      const dist = clamp(11 + speed * 0.9, 11, 20);
      this.desired.copy(pos).addScaledVector(this.heading, -dist);
      this.desired.y += 4.2;
      this.lookAt.copy(pos).addScaledVector(this.heading, 3);
      this.lookAt.y += 0.4;
    } else if (mode === 'pilot') {
      if (p.pilotStation) {
        this.desired.copy(p.pilotStation);
        posRate = 6;
      } else {
        this.updateGroundStation(pos, groundHeightAt, snap);
        this.desired.copy(this.groundStation);
        posRate = 4;
      }
      this.lookAt.copy(pos);
    } else {
      // Tactical: high, slightly behind, angled — readable without nadir disorientation.
      this.desired.set(pos.x, pos.y + 22, pos.z + 13);
      this.lookAt.copy(pos);
    }

    camera.position.lerp(this.desired, alpha(dt, posRate, snap));

    const groundY = groundHeightAt(camera.position.x, camera.position.z);
    if (camera.position.y < groundY + 1.5) {
      camera.position.y = groundY + 1.5;
    }

    if (!this.lookReady || snap) {
      this.lookTarget.copy(this.lookAt);
      this.lookReady = true;
    } else {
      this.lookTarget.lerp(this.lookAt, alpha(dt, 6, false));
    }
    camera.lookAt(this.lookTarget);
  }

  private updateHeading(state: BlimpState, dt: number, snap: boolean): void {
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    if (speed > 0.5) {
      this.tmp.set(state.velocity.x, 0, state.velocity.z).normalize();
    } else {
      const forward = getForwardVector(state);
      this.tmp.set(forward.x, 0, forward.z);
      if (this.tmp.lengthSq() < 1e-6) {
        this.tmp.set(0, 0, -1);
      }
      this.tmp.normalize();
    }

    if (!this.headingReady || snap) {
      this.heading.copy(this.tmp);
      this.headingReady = true;
      return;
    }
    // Slower when nearly hovering so in-place yaw doesn't whip the camera around.
    const rate = speed > 0.5 ? 2.5 : 1.1;
    this.heading.lerp(this.tmp, alpha(dt, rate, false));
    if (this.heading.lengthSq() < 1e-6) {
      this.heading.copy(this.tmp);
    }
    this.heading.normalize();
  }

  private updateGroundStation(pos: THREE.Vector3, groundHeightAt: (x: number, z: number) => number, snap: boolean): void {
    if (!this.groundStationReady || snap) {
      this.groundStation.set(pos.x, 0, pos.z + 45);
      this.groundStationReady = true;
    }
    const dx = pos.x - this.groundStation.x;
    const dz = pos.z - this.groundStation.z;
    const d = Math.hypot(dx, dz);
    const maxDistance = 55;
    if (d > maxDistance) {
      const k = (d - maxDistance) / d;
      this.groundStation.x += dx * k;
      this.groundStation.z += dz * k;
    }
    this.groundStation.y = groundHeightAt(this.groundStation.x, this.groundStation.z) + 1.7;
  }
}

function alpha(dt: number, rate: number, snap: boolean): number {
  return snap ? 1 : 1 - Math.exp(-dt * rate);
}
