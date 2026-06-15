import { clamp } from './math';

export type ControlAxis = 'vertical' | 'pitch' | 'forward' | 'yaw';

export type AxisValues = Record<ControlAxis, number>;

export interface AxisMapping {
  sourceAxis: number;
  inverted: boolean;
}

export interface AxisCalibration {
  center: number;
  min: number;
  max: number;
}

export interface GamepadSnapshot {
  connected: boolean;
  id: string;
  index: number;
  axes: number[];
  values: AxisValues;
}

export const controlAxes: ControlAxis[] = ['vertical', 'pitch', 'forward', 'yaw'];

export const controlLabels: Record<ControlAxis, string> = {
  vertical: 'Left Y vertical',
  pitch: 'Left X pitch',
  forward: 'Right Y forward',
  yaw: 'Right X yaw'
};

export const defaultAxisValues: AxisValues = {
  vertical: 0,
  pitch: 0,
  forward: 0,
  yaw: 0
};

export const defaultAxisMap: Record<ControlAxis, AxisMapping> = {
  pitch: { sourceAxis: 0, inverted: true },
  vertical: { sourceAxis: 1, inverted: true },
  yaw: { sourceAxis: 2, inverted: false },
  forward: { sourceAxis: 3, inverted: true }
};

const STORAGE_KEY = 'rc-blimp-controller-profile-v2';

export function createDefaultCalibration(axisCount = 8): AxisCalibration[] {
  return Array.from({ length: axisCount }, () => ({
    center: 0,
    min: -1,
    max: 1
  }));
}

export function normalizeAxis(raw: number, calibration: AxisCalibration, deadzone: number): number {
  const center = clamp(calibration.center, -1, 1);
  const min = Math.min(calibration.min, center - 0.01);
  const max = Math.max(calibration.max, center + 0.01);
  const delta = raw - center;
  const span = delta >= 0 ? max - center : center - min;
  const normalized = span <= 0.001 ? 0 : clamp(delta / span, -1, 1);
  const zone = clamp(deadzone, 0, 0.95);

  if (Math.abs(normalized) <= zone) {
    return 0;
  }

  return Math.sign(normalized) * ((Math.abs(normalized) - zone) / (1 - zone));
}

export function mapRawGamepadAxes(
  rawAxes: readonly number[],
  axisMap: Record<ControlAxis, AxisMapping>,
  calibration: readonly AxisCalibration[],
  deadzone: number
): AxisValues {
  const values = { ...defaultAxisValues };

  for (const axis of controlAxes) {
    const mapping = axisMap[axis];
    const raw = rawAxes[mapping.sourceAxis] ?? 0;
    const normalized = normalizeAxis(raw, calibration[mapping.sourceAxis] ?? createDefaultCalibration(1)[0], deadzone);
    values[axis] = clamp(mapping.inverted ? -normalized : normalized, -1, 1);
  }

  return values;
}

export function captureCenters(rawAxes: readonly number[], previous = createDefaultCalibration(rawAxes.length)): AxisCalibration[] {
  const axisCount = Math.max(rawAxes.length, previous.length, 8);

  return Array.from({ length: axisCount }, (_, index) => {
    const raw = rawAxes[index] ?? 0;
    const old = previous[index] ?? { center: 0, min: -1, max: 1 };
    return {
      center: clamp(raw, -1, 1),
      min: Math.min(old.min, raw, -1),
      max: Math.max(old.max, raw, 1)
    };
  });
}

export function updateCalibrationExtents(
  rawAxes: readonly number[],
  previous: readonly AxisCalibration[]
): AxisCalibration[] {
  const axisCount = Math.max(rawAxes.length, previous.length, 8);

  return Array.from({ length: axisCount }, (_, index) => {
    const raw = rawAxes[index] ?? 0;
    const old = previous[index] ?? { center: 0, min: -1, max: 1 };
    return {
      center: old.center,
      min: Math.min(old.min, raw),
      max: Math.max(old.max, raw)
    };
  });
}

export class ControllerProfile {
  axisMap: Record<ControlAxis, AxisMapping>;
  calibration: AxisCalibration[];
  readonly loadedFromStorage: boolean;

  constructor(axisMap = defaultAxisMap, calibration = createDefaultCalibration(), loadedFromStorage = false) {
    this.axisMap = structuredClone(axisMap);
    this.calibration = structuredClone(calibration);
    this.loadedFromStorage = loadedFromStorage;
  }

  read(rawAxes: readonly number[], deadzone: number): AxisValues {
    this.calibration = updateCalibrationExtents(rawAxes, this.calibration);
    return mapRawGamepadAxes(rawAxes, this.axisMap, this.calibration, deadzone);
  }

  calibrateCenter(rawAxes: readonly number[]): void {
    this.calibration = captureCenters(rawAxes, this.calibration);
    this.save();
  }

  setMapping(axis: ControlAxis, mapping: AxisMapping): void {
    this.axisMap = {
      ...this.axisMap,
      [axis]: { ...mapping }
    };
    this.save();
  }

  save(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      axisMap: this.axisMap,
      calibration: this.calibration
    }));
  }

  static load(): ControllerProfile {
    if (typeof localStorage === 'undefined') {
      return new ControllerProfile();
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return new ControllerProfile();
    }

    try {
      const parsed = JSON.parse(saved) as {
        axisMap?: Record<ControlAxis, AxisMapping>;
        calibration?: AxisCalibration[];
      };

      return new ControllerProfile(
        parsed.axisMap ?? defaultAxisMap,
        parsed.calibration ?? createDefaultCalibration(),
        true
      );
    } catch {
      return new ControllerProfile();
    }
  }
}

export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private readonly keydown = (event: KeyboardEvent) => {
    this.pressed.add(event.code);
  };
  private readonly keyup = (event: KeyboardEvent) => {
    this.pressed.delete(event.code);
  };

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.keydown);
    target.addEventListener('keyup', this.keyup);
  }

  read(): AxisValues {
    const axis = (positive: string, negative: string) => {
      const p = this.pressed.has(positive) ? 1 : 0;
      const n = this.pressed.has(negative) ? 1 : 0;
      return p - n;
    };

    return {
      vertical: axis('KeyW', 'KeyS'),
      pitch: axis('KeyA', 'KeyD'),
      forward: axis('ArrowUp', 'ArrowDown'),
      yaw: axis('ArrowRight', 'ArrowLeft')
    };
  }

  hasInput(): boolean {
    return this.pressed.size > 0;
  }

  dispose(target: Window = window): void {
    target.removeEventListener('keydown', this.keydown);
    target.removeEventListener('keyup', this.keyup);
  }
}

export function getActiveGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    return null;
  }

  const gamepads = navigator.getGamepads();
  return gamepads.find((gamepad): gamepad is Gamepad => Boolean(gamepad && gamepad.axes.length >= 2)) ?? null;
}
