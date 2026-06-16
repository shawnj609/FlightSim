import { Vector3 } from 'three';
import { type BlimpConfig } from '../config/blimpConfig';
import { type BlimpState } from './physics';

export interface AabbCollider {
  id: string;
  center: Vector3;
  halfSize: Vector3;
  restitution?: number;
}

export interface CollisionResult {
  faults: number;
  hitIds: string[];
}

/**
 * Describes the world surface the blimp can rest on or bump into. Lets the same
 * collision routine handle a flat arena floor or rolling terrain with water.
 */
export interface SurfaceSampler {
  groundHeightAt(x: number, z: number): number;
  ceilingAt(x: number, z: number): number;
  isWaterAt(x: number, z: number): boolean;
}

/** Collisions against an arbitrary surface plus a set of AABB obstacles. */
export function resolveSurfaceCollisions(
  state: BlimpState,
  config: BlimpConfig,
  surface: SurfaceSampler,
  colliders: readonly AabbCollider[],
  radius = Math.max(config.hullWidth, config.hullHeight) / 2
): CollisionResult {
  const hitIds: string[] = [];
  const restitution = 0.28;
  const verticalExtent = getVerticalExtent(state, config, radius);

  const ground = surface.groundHeightAt(state.position.x, state.position.z);
  const floorY = ground + verticalExtent;
  if (state.position.y < floorY) {
    state.position.y = floorY;
    state.velocity.y = Math.abs(state.velocity.y) * restitution;
    hitIds.push(surface.isWaterAt(state.position.x, state.position.z) ? 'water' : 'floor');
  }

  const ceiling = surface.ceilingAt(state.position.x, state.position.z) - verticalExtent;
  if (state.position.y > ceiling) {
    state.position.y = ceiling;
    state.velocity.y = -Math.abs(state.velocity.y) * restitution;
    hitIds.push('ceiling');
  }

  for (const collider of colliders) {
    for (const samplePoint of getHullSamplePoints(state, config, radius)) {
      if (resolveSphereAabb(samplePoint, state, collider, radius, restitution)) {
        hitIds.push(collider.id);
        break;
      }
    }
  }

  return {
    faults: hitIds.length,
    hitIds
  };
}

/** Flat-floored arena collisions (ground at y=0, ceiling at maxArenaHeight). */
export function resolveArenaCollisions(
  state: BlimpState,
  config: BlimpConfig,
  colliders: readonly AabbCollider[],
  radius = Math.max(config.hullWidth, config.hullHeight) / 2
): CollisionResult {
  return resolveSurfaceCollisions(
    state,
    config,
    {
      groundHeightAt: () => 0,
      ceilingAt: () => config.maxArenaHeight,
      isWaterAt: () => false
    },
    colliders,
    radius
  );
}

function getHullSamplePoints(state: BlimpState, config: BlimpConfig, radius: number): Vector3[] {
  const forward = new Vector3(0, 0, -1).applyQuaternion(state.orientation).normalize();
  const halfLength = config.hullLength / 2;
  const offset = Math.max(0, halfLength - radius);

  return [
    state.position.clone(),
    state.position.clone().addScaledVector(forward, offset),
    state.position.clone().addScaledVector(forward, -offset)
  ];
}

function getVerticalExtent(state: BlimpState, config: BlimpConfig, radius: number): number {
  const forward = new Vector3(0, 0, -1).applyQuaternion(state.orientation).normalize();
  const halfLength = config.hullLength / 2;
  return radius + Math.abs(forward.y) * halfLength;
}

function resolveSphereAabb(
  samplePoint: Vector3,
  state: BlimpState,
  collider: AabbCollider,
  radius: number,
  restitution: number
): boolean {
  const local = samplePoint.sub(collider.center);
  const closest = new Vector3(
    clampComponent(local.x, -collider.halfSize.x, collider.halfSize.x),
    clampComponent(local.y, -collider.halfSize.y, collider.halfSize.y),
    clampComponent(local.z, -collider.halfSize.z, collider.halfSize.z)
  );
  const delta = local.clone().sub(closest);
  const distance = delta.length();

  if (distance >= radius) {
    return false;
  }

  const insideBox = distance <= 0.0001;
  const normal = insideBox ? fallbackNormal(local, collider.halfSize) : delta.divideScalar(distance);
  const penetration = insideBox
    ? radius + distanceToAabbFace(local, collider.halfSize, normal)
    : radius - distance;
  state.position.addScaledVector(normal, penetration + 0.001);

  const velocityIntoSurface = state.velocity.dot(normal);
  if (velocityIntoSurface < 0) {
    state.velocity.addScaledVector(normal, -(1 + (collider.restitution ?? restitution)) * velocityIntoSurface);
  } else if (velocityIntoSurface === 0) {
    state.velocity.addScaledVector(normal, 0.08);
  }

  return true;
}

function clampComponent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fallbackNormal(local: Vector3, halfSize: Vector3): Vector3 {
  const distances = [
    { axis: new Vector3(Math.sign(local.x || 1), 0, 0), distance: halfSize.x - Math.abs(local.x) },
    { axis: new Vector3(0, Math.sign(local.y || 1), 0), distance: halfSize.y - Math.abs(local.y) },
    { axis: new Vector3(0, 0, Math.sign(local.z || 1)), distance: halfSize.z - Math.abs(local.z) }
  ].sort((a, b) => a.distance - b.distance);

  return distances[0].axis;
}

function distanceToAabbFace(local: Vector3, halfSize: Vector3, normal: Vector3): number {
  if (normal.x !== 0) {
    return halfSize.x - Math.abs(local.x);
  }
  if (normal.y !== 0) {
    return halfSize.y - Math.abs(local.y);
  }
  return halfSize.z - Math.abs(local.z);
}
