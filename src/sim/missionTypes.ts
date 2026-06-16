import { type Vector3 } from 'three';
import { type AxisValues } from './input';
import { type BlimpState } from './physics';

export type Medal = 'gold' | 'silver' | 'bronze' | 'none';
export type MissionState = 'active' | 'complete';

/** A pass-through ring location (shared by worlds, the ring course, and missions). */
export interface RingAnchor {
  position: Vector3;
  radius: number;
}

export interface BeaconSpec {
  position: Vector3;
  color?: number;
}

export interface GroundRingSpec {
  position: Vector3;
  radius: number;
  color?: number;
}

export interface StationBoxSpec {
  center: Vector3;
  halfSize: Vector3;
  color?: number;
}

export interface MissionResultLine {
  label: string;
  value: string;
}

export interface MissionResult {
  title: string;
  medal: Medal;
  lines: MissionResultLine[];
  message: string;
}

/** Everything the HUD needs to render the current mission, frame by frame. */
export interface MissionView {
  title: string;
  objective: string;
  hint: string;
  progress: string;
  timerSeconds: number;
  contacts: number;
  state: MissionState;
  result?: MissionResult;
  beacon?: BeaconSpec;
  groundRing?: GroundRingSpec;
  stationBox?: StationBoxSpec;
  /** When set, the app colours the ring course to this active index. */
  ringActiveIndex?: number;
}

/** Context handed to a mission when it is created for a given world/activity. */
export interface MissionContext {
  spawn: Vector3;
  ringAnchors: RingAnchor[];
  pilotCameraPosition: Vector3;
  groundHeightAt: (x: number, z: number) => number;
}

/** A runnable activity (challenge or tutorial) producing a uniform MissionView. */
export interface Mission {
  readonly usesRingCourse: boolean;
  readonly ringAnchors: RingAnchor[];
  reset(): void;
  update(
    state: BlimpState,
    controls: AxisValues,
    dt: number,
    contacts: number,
    cameraPosition: Vector3
  ): MissionView;
}

export function medalLabel(medal: Medal): string {
  switch (medal) {
    case 'gold':
      return 'Gold';
    case 'silver':
      return 'Silver';
    case 'bronze':
      return 'Bronze';
    default:
      return '—';
  }
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
