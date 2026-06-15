import { type BlimpConfig, configMetadata } from '../config/blimpConfig';
import {
  controlAxes,
  controlLabels,
  type AxisValues,
  type ControlAxis,
  type ControllerProfile
} from '../sim/input';
import { type TrainingMode, trainingModes, type TrainingSnapshot } from '../sim/training';
import { cameraModeLabels, cameraModes, type CameraMode } from './cameras';

export interface TelemetryView {
  altitude: number;
  speed: number;
  yaw: number;
  pitch: number;
  verticalVelocity: number;
  driftX: number;
  driftZ: number;
  motorsOffCenter: boolean;
}

export interface ControllerStatusView {
  connected: boolean;
  id: string;
  index: number;
  rawAxes: readonly number[];
  usingKeyboard: boolean;
}

export interface SimUICallbacks {
  onReset: () => void;
  onPauseToggle: () => void;
  onSettingsToggle: () => void;
  onCalibrationToggle: () => void;
  onCameraMode: (mode: CameraMode) => void;
  onTrainingMode: (mode: TrainingMode) => void;
  onConfigChange: (key: keyof BlimpConfig, value: number) => void;
  onAxisMappingChange: (axis: ControlAxis, sourceAxis: number, inverted: boolean) => void;
  onCalibrateCenter: () => void;
}

type ConfigInputs = Record<keyof BlimpConfig, { range: HTMLInputElement; number: HTMLInputElement }>;

export class SimUI {
  private readonly telemetry = new Map<string, HTMLElement>();
  private readonly axisBars = new Map<ControlAxis, HTMLElement>();
  private readonly rawAxisBars: HTMLElement[] = [];
  private readonly scoreValue: HTMLElement;
  private readonly objectiveValue: HTMLElement;
  private readonly faultValue: HTMLElement;
  private readonly timeValue: HTMLElement;
  private readonly statusValue: HTMLElement;
  private readonly gamepadValue: HTMLElement;
  private readonly motorsOff: HTMLElement;
  private readonly driftArrow: HTMLElement;
  private readonly settingsPanel: HTMLElement;
  private readonly calibrationPanel: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly configInputs: ConfigInputs;
  private readonly mappingRows = new Map<ControlAxis, { select: HTMLSelectElement; invert: HTMLInputElement }>();

  constructor(root: HTMLElement, callbacks: SimUICallbacks, config: BlimpConfig, profile: ControllerProfile) {
    const overlay = element('div', 'overlay');
    root.appendChild(overlay);

    const topBar = element('div', 'top-bar');
    topBar.append(
      element('div', 'title-block', [
        element('div', 'app-title', ['RC Stage Blimp Trainer']),
        element('div', 'app-subtitle', ['pilot floor view'])
      ]),
      this.createToolbar(callbacks)
    );
    overlay.appendChild(topBar);

    const hud = element('div', 'hud');
    const leftPanel = element('section', 'panel telemetry-panel');
    leftPanel.appendChild(element('h2', '', ['Telemetry']));
    for (const [key, label] of [
      ['altitude', 'Altitude'],
      ['speed', 'Speed'],
      ['yaw', 'Yaw'],
      ['pitch', 'Pitch'],
      ['verticalVelocity', 'Vertical vel']
    ] as const) {
      const value = element('strong', '', ['0']);
      this.telemetry.set(key, value);
      leftPanel.appendChild(row(label, value));
    }
    this.motorsOff = element('div', 'motors-off is-centered', ['CENTER OFF']);
    leftPanel.appendChild(this.motorsOff);
    const drift = element('div', 'drift-radar');
    this.driftArrow = element('div', 'drift-arrow');
    drift.appendChild(this.driftArrow);
    leftPanel.append(row('Drift vector', drift));

    const rightPanel = element('section', 'panel input-panel');
    rightPanel.appendChild(element('h2', '', ['Inputs']));
    for (const axis of controlAxes) {
      const bar = element('div', 'axis-fill');
      this.axisBars.set(axis, bar);
      rightPanel.appendChild(axisBar(controlLabels[axis], bar));
    }
    this.statusValue = element('strong', '', ['Keyboard']);
    this.gamepadValue = element('span', 'gamepad-id', ['No controller']);
    rightPanel.append(row('Controller', this.statusValue));
    rightPanel.append(row('Gamepad ID', this.gamepadValue));

    const trainingPanel = element('section', 'panel training-panel');
    trainingPanel.appendChild(element('h2', '', ['Training']));
    this.scoreValue = element('strong', '', ['1000']);
    this.objectiveValue = element('span', '', ['Hold the transparent box for 60 seconds']);
    this.faultValue = element('strong', '', ['0']);
    this.timeValue = element('strong', '', ['0.0 s']);
    trainingPanel.append(row('Score', this.scoreValue));
    trainingPanel.append(row('Objective', this.objectiveValue));
    trainingPanel.append(row('Faults', this.faultValue));
    trainingPanel.append(row('Time', this.timeValue));

    hud.append(leftPanel, trainingPanel, rightPanel);
    overlay.appendChild(hud);

    this.settingsPanel = this.createSettingsPanel(callbacks, config);
    this.calibrationPanel = this.createCalibrationPanel(callbacks, profile);
    overlay.append(this.settingsPanel, this.calibrationPanel);

    this.pauseButton = topBar.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
    this.configInputs = this.collectConfigInputs();
  }

  updateTelemetry(view: TelemetryView): void {
    this.telemetry.get('altitude')!.textContent = `${view.altitude.toFixed(2)} m`;
    this.telemetry.get('speed')!.textContent = `${view.speed.toFixed(2)} m/s`;
    this.telemetry.get('yaw')!.textContent = `${view.yaw.toFixed(0)} deg`;
    this.telemetry.get('pitch')!.textContent = `${view.pitch.toFixed(1)} deg`;
    this.telemetry.get('verticalVelocity')!.textContent = `${view.verticalVelocity.toFixed(2)} m/s`;
    this.motorsOff.textContent = view.motorsOffCenter ? 'CENTER OFF' : 'VERT THRUST';
    this.motorsOff.classList.toggle('is-centered', view.motorsOffCenter);

    const angle = Math.atan2(view.driftX, view.driftZ);
    const magnitude = Math.min(1, Math.hypot(view.driftX, view.driftZ) / 2.5);
    this.driftArrow.style.transform = `translate(-50%, -100%) rotate(${angle}rad) scaleY(${0.35 + magnitude})`;
    this.driftArrow.style.opacity = `${0.3 + magnitude * 0.7}`;
  }

  updateInput(values: AxisValues): void {
    for (const axis of controlAxes) {
      const value = values[axis];
      const fill = this.axisBars.get(axis)!;
      const percent = Math.abs(value) * 50;
      fill.style.left = value >= 0 ? '50%' : `${50 - percent}%`;
      fill.style.width = `${percent}%`;
      fill.classList.toggle('is-negative', value < 0);
      fill.classList.toggle('is-positive', value >= 0);
    }
  }

  updateTraining(snapshot: TrainingSnapshot): void {
    this.scoreValue.textContent = `${snapshot.score}`;
    this.objectiveValue.textContent = snapshot.completed ? `${snapshot.label} complete` : snapshot.objective;
    this.faultValue.textContent = `${Math.floor(snapshot.faults)}`;
    this.timeValue.textContent = `${snapshot.elapsed.toFixed(1)} s`;
  }

  updateControllerStatus(status: ControllerStatusView): void {
    this.statusValue.textContent = status.connected ? 'Gamepad' : status.usingKeyboard ? 'Keyboard' : 'Waiting';
    this.gamepadValue.textContent = status.connected ? `${status.index}: ${status.id}` : 'No controller';

    status.rawAxes.slice(0, 8).forEach((value, index) => {
      if (!this.rawAxisBars[index]) {
        return;
      }
      const percent = Math.abs(value) * 50;
      const fill = this.rawAxisBars[index];
      fill.style.left = value >= 0 ? '50%' : `${50 - percent}%`;
      fill.style.width = `${percent}%`;
      fill.classList.toggle('is-negative', value < 0);
      fill.classList.toggle('is-positive', value >= 0);
    });
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause';
    this.pauseButton.classList.toggle('is-active', paused);
  }

  toggleSettings(open?: boolean): void {
    this.settingsPanel.classList.toggle('is-open', open ?? !this.settingsPanel.classList.contains('is-open'));
  }

  toggleCalibration(open?: boolean): void {
    this.calibrationPanel.classList.toggle('is-open', open ?? !this.calibrationPanel.classList.contains('is-open'));
  }

  syncConfig(config: BlimpConfig): void {
    for (const key of Object.keys(configMetadata) as (keyof BlimpConfig)[]) {
      const inputs = this.configInputs[key];
      if (!inputs) {
        continue;
      }
      inputs.range.value = String(config[key]);
      inputs.number.value = String(config[key]);
    }
  }

  syncProfile(profile: ControllerProfile): void {
    for (const axis of controlAxes) {
      const rowControls = this.mappingRows.get(axis);
      if (!rowControls) {
        continue;
      }
      rowControls.select.value = String(profile.axisMap[axis].sourceAxis);
      rowControls.invert.checked = profile.axisMap[axis].inverted;
    }
  }

  private createToolbar(callbacks: SimUICallbacks): HTMLElement {
    const toolbar = element('div', 'toolbar');
    const cameraSelect = select(cameraModes.map((mode) => [mode, cameraModeLabels[mode]]), 'pilot');
    cameraSelect.addEventListener('change', () => callbacks.onCameraMode(cameraSelect.value as CameraMode));
    const trainingSelect = select(trainingModes.map((mode) => [mode, labelTrainingMode(mode)]), 'hoverBox');
    trainingSelect.addEventListener('change', () => callbacks.onTrainingMode(trainingSelect.value as TrainingMode));

    const reset = button('Reset', () => callbacks.onReset());
    const pause = button('Pause', () => callbacks.onPauseToggle());
    pause.dataset.action = 'pause';
    const settings = button('Settings', () => callbacks.onSettingsToggle());
    const calibration = button('Calibrate', () => callbacks.onCalibrationToggle());

    toolbar.append(cameraSelect, trainingSelect, reset, pause, settings, calibration);
    return toolbar;
  }

  private createSettingsPanel(callbacks: SimUICallbacks, config: BlimpConfig): HTMLElement {
    const panel = element('section', 'panel drawer settings-drawer');
    panel.appendChild(element('h2', '', ['Pause / Settings']));

    for (const key of Object.keys(configMetadata) as (keyof BlimpConfig)[]) {
      const meta = configMetadata[key];
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(meta.min);
      range.max = String(meta.max);
      range.step = String(meta.step);
      range.value = String(config[key]);
      range.dataset.configKey = key;

      const number = document.createElement('input');
      number.type = 'number';
      number.min = String(meta.min);
      number.max = String(meta.max);
      number.step = String(meta.step);
      number.value = String(config[key]);
      number.dataset.configKey = key;

      const onInput = (event: Event) => {
        const source = event.currentTarget as HTMLInputElement;
        const value = Number(source.value);
        range.value = String(value);
        number.value = String(value);
        callbacks.onConfigChange(key, value);
      };
      range.addEventListener('input', onInput);
      number.addEventListener('input', onInput);

      panel.appendChild(element('label', 'config-row', [
        element('span', '', [meta.label]),
        range,
        number
      ]));
    }

    return panel;
  }

  private createCalibrationPanel(callbacks: SimUICallbacks, profile: ControllerProfile): HTMLElement {
    const panel = element('section', 'panel drawer calibration-drawer');
    panel.appendChild(element('h2', '', ['Axis calibration']));
    panel.appendChild(button('Calibrate center', () => callbacks.onCalibrateCenter()));

    for (const axis of controlAxes) {
      const sourceSelect = select(
        Array.from({ length: 8 }, (_, index) => [`${index}`, `Axis ${index}`]),
        String(profile.axisMap[axis].sourceAxis)
      );
      const invert = document.createElement('input');
      invert.type = 'checkbox';
      invert.checked = profile.axisMap[axis].inverted;

      const notify = () => callbacks.onAxisMappingChange(axis, Number(sourceSelect.value), invert.checked);
      sourceSelect.addEventListener('change', notify);
      invert.addEventListener('change', notify);
      this.mappingRows.set(axis, { select: sourceSelect, invert });

      panel.appendChild(element('label', 'mapping-row', [
        element('span', '', [controlLabels[axis]]),
        sourceSelect,
        element('span', 'checkbox-label', ['Invert', invert])
      ]));
    }

    panel.appendChild(element('h3', '', ['Raw axes']));
    for (let index = 0; index < 8; index += 1) {
      const fill = element('div', 'axis-fill');
      this.rawAxisBars[index] = fill;
      panel.appendChild(axisBar(`Axis ${index}`, fill));
    }

    return panel;
  }

  private collectConfigInputs(): ConfigInputs {
    const result = {} as ConfigInputs;
    for (const key of Object.keys(configMetadata) as (keyof BlimpConfig)[]) {
      const controls = Array.from(this.settingsPanel.querySelectorAll<HTMLInputElement>(`[data-config-key="${key}"]`));
      result[key] = {
        range: controls.find((input) => input.type === 'range')!,
        number: controls.find((input) => input.type === 'number')!
      };
    }
    return result;
  }
}

function axisBar(label: string, fill: HTMLElement): HTMLElement {
  const track = element('div', 'axis-track', [fill, element('div', 'axis-center')]);
  return element('div', 'axis-row', [element('span', '', [label]), track]);
}

function row(label: string, value: HTMLElement): HTMLElement {
  return element('div', 'data-row', [element('span', '', [label]), value]);
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', onClick);
  return control;
}

function select(options: [string, string][], value: string): HTMLSelectElement {
  const control = document.createElement('select');
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    control.appendChild(option);
  }
  control.value = value;
  return control;
}

function labelTrainingMode(mode: TrainingMode): string {
  const labels: Record<TrainingMode, string> = {
    hoverBox: 'Hover box',
    gatePass: 'Gate pass',
    precisionStop: 'Precision stop',
    stagePass: 'Stage pass',
    noseIn: 'Nose-in'
  };
  return labels[mode];
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  children: Array<Node | string> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}
