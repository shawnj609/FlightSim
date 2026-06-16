import * as THREE from 'three';
import { type AabbCollider, type SurfaceSampler } from '../../sim/collisions';
import { type RingAnchor } from '../../sim/missionTypes';
import { type CameraMode } from '../../app/cameras';

export type SceneId = 'arena' | 'nature' | 'city';

export { type RingAnchor } from '../../sim/missionTypes';

export interface WorldEnvironment {
  background: THREE.Color;
  fog: { color: number; near: number; far: number };
  hemisphere: { sky: number; ground: number; intensity: number };
  sun: { color: number; intensity: number; position: THREE.Vector3 };
  shadowRadius: number;
}

/**
 * A self-contained environment the blimp can fly in. Implements SurfaceSampler so the
 * collision system can rest the blimp on its ground/water and cap it at its ceiling.
 */
export interface World extends SurfaceSampler {
  readonly id: SceneId;
  readonly label: string;
  readonly group: THREE.Group;
  readonly colliders: AabbCollider[];
  readonly spawn: THREE.Vector3;
  readonly ringAnchors: RingAnchor[];
  /** Fixed ground camera station (bounded scenes). Outdoor worlds leave this undefined
   *  so the ground camera lazily trails the craft instead. */
  readonly pilotStation?: THREE.Vector3;
  readonly defaultCamera: CameraMode;
  readonly defaultWind: number;
  readonly environment: WorldEnvironment;
  /** Whether this scene supports regeneration (procedural worlds only). */
  readonly canRegenerate: boolean;
  update(time: number): void;
  dispose(): void;
}

export const sceneLabels: Record<SceneId, string> = {
  arena: 'Indoor arena',
  nature: 'Nature',
  city: 'City'
};

export const sceneIds: SceneId[] = ['arena', 'nature', 'city'];
