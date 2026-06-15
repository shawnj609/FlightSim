import * as THREE from 'three';
import { type OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type BlimpConfig } from '../config/blimpConfig';
import { type BlimpState, getForwardVector } from '../sim/physics';

export type CameraMode = 'pilot' | 'follow' | 'top' | 'orbit';

export const cameraModeLabels: Record<CameraMode, string> = {
  pilot: 'Pilot floor',
  follow: 'Follow chase',
  top: 'Top-down',
  orbit: 'Free orbit'
};

export const cameraModes: CameraMode[] = ['pilot', 'follow', 'top', 'orbit'];

export const pilotCameraPosition = new THREE.Vector3(0, 1.55, 42);

export function updateCameraForMode(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  mode: CameraMode,
  state: BlimpState,
  config: BlimpConfig,
  dt: number
): void {
  const target = state.position.clone().add(new THREE.Vector3(0, 0.18, 0));
  const alpha = 1 - Math.exp(-dt * 5.5);

  if (mode === 'orbit') {
    controls.enabled = true;
    controls.target.lerp(target, alpha);
    controls.update();
    return;
  }

  controls.enabled = false;
  camera.up.set(0, 1, 0);

  if (mode === 'pilot') {
    camera.position.copy(pilotCameraPosition);
    camera.lookAt(target);
    return;
  }

  if (mode === 'follow') {
    const forward = getForwardVector(state);
    forward.y *= 0.25;
    forward.normalize();
    const desired = state.position.clone().addScaledVector(forward, -14).add(new THREE.Vector3(0, 4.2, 0));
    camera.position.lerp(desired, alpha);
    camera.lookAt(target);
    return;
  }

  camera.up.set(0, 0, -1);
  const desired = new THREE.Vector3(state.position.x, config.maxArenaHeight + 18, state.position.z + 0.01);
  camera.position.lerp(desired, alpha);
  camera.lookAt(state.position);
}
