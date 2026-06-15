import { Quaternion, Vector3 } from 'three';
import { type BlimpConfig } from '../config/blimpConfig';
import { type AxisValues } from './input';
import { approachExp, clamp } from './math';

const GRAVITY = 9.81;
const FORWARD = new Vector3(0, 0, -1);
const UP = new Vector3(0, 1, 0);

export interface MotorState {
  vertical: number;
  forward: number;
  yaw: number;
  pitch: number;
}

export interface BlimpState {
  position: Vector3;
  velocity: Vector3;
  orientation: Quaternion;
  angularVelocity: Vector3;
  motors: MotorState;
  swing: Vector3;
  swingVelocity: Vector3;
  wind: Vector3;
  lastAcceleration: Vector3;
  time: number;
}

export function createInitialBlimpState(): BlimpState {
  return {
    position: new Vector3(0, 4.2, 16),
    velocity: new Vector3(),
    orientation: new Quaternion(),
    angularVelocity: new Vector3(),
    motors: {
      vertical: 0,
      forward: 0,
      yaw: 0,
      pitch: 0
    },
    swing: new Vector3(),
    swingVelocity: new Vector3(),
    wind: new Vector3(),
    lastAcceleration: new Vector3(),
    time: 0
  };
}

export function getForwardVector(state: BlimpState): Vector3 {
  return FORWARD.clone().applyQuaternion(state.orientation).normalize();
}

export function getYawRadians(state: BlimpState): number {
  const forward = getForwardVector(state);
  return Math.atan2(forward.x, -forward.z);
}

export function getPitchRadians(state: BlimpState): number {
  return Math.asin(clamp(getForwardVector(state).y, -1, 1));
}

export function stepBlimp(
  state: BlimpState,
  controls: AxisValues,
  config: BlimpConfig,
  dt: number
): BlimpState {
  const safeDt = clamp(dt, 0, 1 / 20);
  state.time += safeDt;

  updateMotors(state, controls, config, safeDt);
  integrateLinearMotion(state, config, safeDt);
  integrateAngularMotion(state, config, safeDt);
  updatePendulumSwing(state, safeDt);

  return state;
}

function updateMotors(state: BlimpState, controls: AxisValues, config: BlimpConfig, dt: number): void {
  state.motors.vertical = approachExp(state.motors.vertical, clamp(controls.vertical, -1, 1), dt, config.motorLag * 0.8);
  state.motors.forward = approachExp(state.motors.forward, clamp(controls.forward, -1, 1), dt, config.motorLag);
  state.motors.yaw = approachExp(state.motors.yaw, clamp(controls.yaw, -1, 1), dt, config.motorLag * 0.65);
  state.motors.pitch = approachExp(state.motors.pitch, clamp(controls.pitch, -1, 1), dt, config.motorLag * 0.65);
}

function integrateLinearMotion(state: BlimpState, config: BlimpConfig, dt: number): void {
  const mass = Math.max(config.mass, 0.05);
  const force = new Vector3(0, mass * GRAVITY * (config.buoyancyRatio - 1), 0);

  force.y += state.motors.vertical * config.verticalThrust;
  force.addScaledVector(getForwardVector(state), state.motors.forward * config.forwardThrust);

  const speed = state.velocity.length();
  const dragMagnitude = config.linearDrag + speed * 0.08;
  force.addScaledVector(state.velocity, -dragMagnitude);
  force.add(updateWindForce(state, config, dt));

  const acceleration = force.divideScalar(mass);
  state.lastAcceleration.copy(acceleration);
  state.velocity.addScaledVector(acceleration, dt);
  state.position.addScaledVector(state.velocity, dt);
}

function updateWindForce(state: BlimpState, config: BlimpConfig, dt: number): Vector3 {
  const target = new Vector3(
    Math.sin(state.time * 0.37 + 1.6) + Math.sin(state.time * 0.11 + 4.4) * 0.5,
    0,
    Math.cos(state.time * 0.29 + 0.7) + Math.sin(state.time * 0.17 + 2.1) * 0.45
  ).multiplyScalar(config.windStrength);

  state.wind.lerp(target, clamp(dt * 0.16, 0, 1));
  return state.wind.clone();
}

function integrateAngularMotion(state: BlimpState, config: BlimpConfig, dt: number): void {
  const mass = Math.max(config.mass, 0.05);
  const torque = new Vector3(0, state.motors.yaw * config.yawTorque, 0);
  const pitchDisturbance =
    -state.motors.vertical * config.pitchTorque * 0.34 -
    Math.abs(state.motors.yaw) * config.pitchTorque * 0.22;
  const pitchTorque = new Vector3(
    state.motors.pitch * config.pitchTorque + pitchDisturbance,
    0,
    0
  ).applyQuaternion(state.orientation);
  const yawRollCoupling = new Vector3(0, 0, -state.motors.yaw * config.yawTorque * 0.18).applyQuaternion(state.orientation);
  torque.add(pitchTorque);
  torque.add(yawRollCoupling);

  const bodyUp = UP.clone().applyQuaternion(state.orientation);
  const restoreAxis = bodyUp.clone().cross(UP);
  restoreAxis.y = 0;
  torque.addScaledVector(restoreAxis, 0.38 * mass);

  const inertia = new Vector3(mass * 1.9, mass * 2.7, mass * 2.1);
  state.angularVelocity.x += (torque.x / inertia.x) * dt;
  state.angularVelocity.y += (torque.y / inertia.y) * dt;
  state.angularVelocity.z += (torque.z / inertia.z) * dt;
  state.angularVelocity.addScaledVector(state.angularVelocity, -config.angularDrag * dt);

  const angularSpeed = state.angularVelocity.length();
  if (angularSpeed > 0.00001) {
    const delta = new Quaternion().setFromAxisAngle(state.angularVelocity.clone().normalize(), angularSpeed * dt);
    state.orientation.premultiply(delta).normalize();
  }
}

function updatePendulumSwing(state: BlimpState, dt: number): void {
  const localAcceleration = state.lastAcceleration.clone().applyQuaternion(state.orientation.clone().invert());
  const target = new Vector3(
    clamp(-localAcceleration.z * 0.055, -0.22, 0.22),
    0,
    clamp(localAcceleration.x * 0.045 - state.angularVelocity.y * 0.08, -0.18, 0.18)
  );

  const spring = target.sub(state.swing).multiplyScalar(3.8);
  state.swingVelocity.addScaledVector(spring, dt);
  state.swingVelocity.addScaledVector(state.swingVelocity, -1.35 * dt);
  state.swing.addScaledVector(state.swingVelocity, dt);
}
