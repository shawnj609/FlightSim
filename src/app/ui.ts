import { type BlimpConfig, configMetadata } from '../config/blimpConfig';
import {
  controlAxes,
  controlLabels,
  type AxisValues,
  type ControlAxis,
  type ControllerProfile
} from '../sim/input';
import { type MissionView, medalLabel, formatClock } from '../sim/missionTypes';
import { cameraModeLabels, cameraModes, type CameraMode } from './cameras';
import { type SceneId, sceneIds, sceneLabels } from '../scene/worlds';
import { type CraftId, craftIds, craftLabels } from '../scene/craft';
import { type ActivityId, activityLabels, availableActivities } from './activities';
import { ObjectiveBannerVisibility } from './objectiveBannerVisibility';

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
  onSceneChange: (scene: SceneId) => void;
  onCraftChange: (craft: CraftId) => void;
  onActivityChange: (activity: ActivityId) => void;
  onRegenerate: () => void;
  onCourseToggle: () => void;
  onAidsToggle: () => void;
  onConfigChange: (key: keyof BlimpConfig, value: number) => void;
  onAxisMappingChange: (axis: ControlAxis, sourceAxis: number, inverted: boolean) => void;
  onCalibrateCenter: () => void;
}

type ConfigInputs = Record<keyof BlimpConfig, { range: HTMLInputElement; number: HTMLInputElement }>;

export class SimUI {
  private readonly telemetry = new Map<string, HTMLElement>();
  private readonly axisBars = new Map<ControlAxis, HTMLElement>();
  private readonly rawAxisBars: HTMLElement[] = [];
  private readonly statusValue: HTMLElement;
  private readonly gamepadValue: HTMLElement;
  private readonly motorsOff: HTMLElement;
  private readonly driftArrow: HTMLElement;

  // Objective banner
  private readonly objectiveBanner: HTMLElement;
  private readonly objectiveRestoreButton: HTMLButtonElement;
  private readonly objectiveHideButton: HTMLButtonElement;
  private readonly objectiveBannerVisibility = new ObjectiveBannerVisibility();
  private readonly bannerTitle: HTMLElement;
  private readonly bannerObjective: HTMLElement;
  private readonly bannerHint: HTMLElement;
  private readonly chipProgress: HTMLElement;
  private readonly chipTime: HTMLElement;
  private readonly chipContacts: HTMLElement;

  // Result card
  private readonly resultCard: HTMLElement;
  private readonly resultMedal: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultLines: HTMLElement;
  private readonly resultMessage: HTMLElement;
  private resultKey = '';
  private resultDismissed = false;

  // Toolbar controls
  private readonly sceneSelect: HTMLSelectElement;
  private readonly activitySelect: HTMLSelectElement;
  private readonly cameraSelect: HTMLSelectElement;
  private readonly regenerateButton: HTMLButtonElement;
  private readonly courseButton: HTMLButtonElement;
  private readonly aidsButton: HTMLButtonElement;

  private readonly settingsPanel: HTMLElement;
  private readonly calibrationPanel: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly configInputs: ConfigInputs;
  private readonly mappingRows = new Map<ControlAxis, { select: HTMLSelectElement; invert: HTMLInputElement }>();

  constructor(root: HTMLElement, callbacks: SimUICallbacks, config: BlimpConfig, profile: ControllerProfile) {
    const overlay = element('div', 'overlay');
    root.appendChild(overlay);

    const overlayTop = element('div', 'overlay-top');
    const topBar = element('div', 'top-bar');
    const toolbar = this.createToolbar(callbacks);
    this.sceneSelect = toolbar.sceneSelect;
    this.activitySelect = toolbar.activitySelect;
    this.cameraSelect = toolbar.cameraSelect;
    this.regenerateButton = toolbar.regenerateButton;
    this.courseButton = toolbar.courseButton;
    this.aidsButton = toolbar.aidsButton;
    topBar.append(
      element('div', 'title-block', [
        element('div', 'app-title', ['RC Stage Blimp Trainer']),
        element('div', 'app-subtitle', ['operator floor trainer'])
      ]),
      toolbar.element
    );
    overlayTop.appendChild(topBar);

    // Objective banner (stacked directly under the top bar)
    const banner = element('div', 'objective-banner');
    this.objectiveBanner = banner;
    this.bannerTitle = element('div', 'banner-title', ['Tutorial']);
    this.objectiveHideButton = button('Hide', () => this.setObjectiveBannerVisible(false));
    this.objectiveHideButton.className = 'objective-hide-button';
    this.objectiveHideButton.title = 'Hide objective card';
    this.objectiveHideButton.setAttribute('aria-label', 'Hide objective card');
    this.bannerObjective = element('div', 'banner-objective', ['']);
    this.bannerHint = element('div', 'banner-hint', ['']);
    const chips = element('div', 'banner-chips');
    this.chipProgress = element('span', 'chip', ['']);
    this.chipTime = element('span', 'chip', ['0:00']);
    this.chipContacts = element('span', 'chip', ['0 contacts']);
    chips.append(this.chipProgress, this.chipTime, this.chipContacts);
    banner.append(
      element('div', 'banner-header', [this.bannerTitle, this.objectiveHideButton]),
      this.bannerObjective,
      this.bannerHint,
      chips
    );
    this.objectiveRestoreButton = button('Show objective', () => this.setObjectiveBannerVisible(true));
    this.objectiveRestoreButton.className = 'objective-restore-button';
    this.objectiveRestoreButton.title = 'Show objective card';
    this.objectiveRestoreButton.setAttribute('aria-label', 'Show objective card');
    overlayTop.append(banner, this.objectiveRestoreButton);
    overlay.appendChild(overlayTop);

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

    hud.append(leftPanel, rightPanel);
    overlay.appendChild(hud);

    // Result card
    this.resultCard = element('div', 'result-card');
    this.resultMedal = element('div', 'result-medal', ['']);
    this.resultTitle = element('div', 'result-title', ['']);
    this.resultLines = element('div', 'result-lines');
    this.resultMessage = element('div', 'result-message', ['']);
    const resultButtons = element('div', 'result-buttons', [
      button('Retry', () => {
        this.resultDismissed = false;
        callbacks.onReset();
      }),
      button('Close', () => {
        this.resultDismissed = true;
        this.resultCard.classList.remove('is-open');
      })
    ]);
    const resultInner = element('div', 'result-inner', [
      this.resultMedal,
      this.resultTitle,
      this.resultLines,
      this.resultMessage,
      resultButtons
    ]);
    this.resultCard.appendChild(resultInner);
    overlay.appendChild(this.resultCard);

    this.settingsPanel = this.createSettingsPanel(callbacks, config);
    this.calibrationPanel = this.createCalibrationPanel(callbacks, profile);
    overlay.append(this.settingsPanel, this.calibrationPanel);

    this.pauseButton = toolbar.pauseButton;
    this.configInputs = this.collectConfigInputs();
    this.setObjectiveBannerVisible(this.objectiveBannerVisibility.isVisible(), false);
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

  updateMission(view: MissionView): void {
    this.bannerTitle.textContent = view.title;
    this.bannerObjective.textContent = view.objective;
    this.bannerHint.textContent = view.hint;
    this.bannerHint.style.display = view.hint ? '' : 'none';

    setChip(this.chipProgress, view.progress);
    this.chipTime.textContent = formatClock(view.timerSeconds);
    setChip(this.chipContacts, view.contacts > 0 ? `${view.contacts} contacts` : '0 contacts');
    this.chipContacts.classList.toggle('is-warn', view.contacts > 0);

    if (view.result) {
      const key = `${view.result.title}:${view.result.medal}:${view.timerSeconds.toFixed(0)}`;
      if (key !== this.resultKey) {
        this.populateResult(view);
        this.resultKey = key;
        this.resultDismissed = false;
      }
      if (!this.resultDismissed) {
        this.resultCard.classList.add('is-open');
      }
    } else {
      this.resultKey = '';
      this.resultDismissed = false;
      this.resultCard.classList.remove('is-open');
    }
  }

  private populateResult(view: MissionView): void {
    const result = view.result!;
    const isMedal = result.medal !== 'none';
    this.resultMedal.textContent = isMedal ? medalLabel(result.medal) : 'Complete';
    this.resultMedal.className = `result-medal medal-${result.medal}`;
    this.resultTitle.textContent = result.title;
    this.resultLines.replaceChildren(
      ...result.lines.map((line) =>
        element('div', 'result-row', [element('span', '', [line.label]), element('strong', '', [line.value])])
      )
    );
    this.resultMessage.textContent = result.message;
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

  /** Sync the toolbar to the active scene/activity and regeneration availability. */
  syncScene(scene: SceneId, activity: ActivityId, canRegenerate: boolean, courseActive: boolean): void {
    this.sceneSelect.value = scene;
    const activities = availableActivities(scene);
    this.activitySelect.replaceChildren(
      ...activities.map((id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = activityLabels[id];
        return option;
      })
    );
    this.activitySelect.value = activity;

    this.regenerateButton.disabled = !canRegenerate;
    this.regenerateButton.classList.toggle('is-disabled', !canRegenerate);

    const showCourse = activity === 'freeFlight';
    this.courseButton.style.display = showCourse ? '' : 'none';
    this.setCourseActive(courseActive);
  }

  setCourseActive(active: boolean): void {
    this.courseButton.textContent = active ? 'Ring course: On' : 'Ring course: Off';
    this.courseButton.classList.toggle('is-active', active);
  }

  setAidsActive(active: boolean): void {
    this.aidsButton.textContent = active ? 'Depth aids: On' : 'Depth aids: Off';
    this.aidsButton.classList.toggle('is-active', active);
  }

  syncCamera(mode: CameraMode): void {
    this.cameraSelect.value = mode;
  }

  toggleSettings(open?: boolean): void {
    this.settingsPanel.classList.toggle('is-open', open ?? !this.settingsPanel.classList.contains('is-open'));
  }

  toggleCalibration(open?: boolean): void {
    this.calibrationPanel.classList.toggle('is-open', open ?? !this.calibrationPanel.classList.contains('is-open'));
  }

  private setObjectiveBannerVisible(visible: boolean, persist = true): void {
    if (persist) {
      this.objectiveBannerVisibility.setVisible(visible);
    }

    this.objectiveBanner.classList.toggle('is-hidden', !visible);
    this.objectiveRestoreButton.classList.toggle('is-visible', !visible);
    this.objectiveRestoreButton.setAttribute('aria-hidden', visible ? 'true' : 'false');
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

  private createToolbar(callbacks: SimUICallbacks): {
    element: HTMLElement;
    sceneSelect: HTMLSelectElement;
    activitySelect: HTMLSelectElement;
    cameraSelect: HTMLSelectElement;
    regenerateButton: HTMLButtonElement;
    courseButton: HTMLButtonElement;
    aidsButton: HTMLButtonElement;
    pauseButton: HTMLButtonElement;
  } {
    const toolbar = element('div', 'toolbar');

    const sceneSelect = select(sceneIds.map((id) => [id, sceneLabels[id]]), 'arena');
    sceneSelect.title = 'Scene';
    sceneSelect.addEventListener('change', () => callbacks.onSceneChange(sceneSelect.value as SceneId));

    const craftSelect = select(craftIds.map((id) => [id, craftLabels[id]]), 'blimp');
    craftSelect.title = 'Craft';
    craftSelect.addEventListener('change', () => callbacks.onCraftChange(craftSelect.value as CraftId));

    const activitySelect = select(
      availableActivities('arena').map((id) => [id, activityLabels[id]]),
      'tutorial'
    );
    activitySelect.title = 'Activity';
    activitySelect.addEventListener('change', () => callbacks.onActivityChange(activitySelect.value as ActivityId));

    const regenerateButton = button('Regenerate', () => callbacks.onRegenerate());
    regenerateButton.disabled = true;
    regenerateButton.classList.add('is-disabled');

    const courseButton = button('Ring course: Off', () => callbacks.onCourseToggle());
    courseButton.style.display = 'none';

    const cameraSelect = select(cameraModes.map((mode) => [mode, cameraModeLabels[mode]]), 'follow');
    cameraSelect.title = 'Camera';
    cameraSelect.addEventListener('change', () => callbacks.onCameraMode(cameraSelect.value as CameraMode));

    const aidsButton = button('Depth aids: On', () => callbacks.onAidsToggle());
    aidsButton.classList.add('is-active');

    const reset = button('Reset', () => callbacks.onReset());
    const pause = button('Pause', () => callbacks.onPauseToggle());
    pause.dataset.action = 'pause';
    const settings = button('Settings', () => callbacks.onSettingsToggle());
    const calibration = button('Calibrate', () => callbacks.onCalibrationToggle());

    toolbar.append(sceneSelect, craftSelect, activitySelect, regenerateButton, courseButton, cameraSelect, aidsButton, reset, pause, settings, calibration);
    return { element: toolbar, sceneSelect, activitySelect, cameraSelect, regenerateButton, courseButton, aidsButton, pauseButton: pause };
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

      panel.appendChild(element('label', 'config-row', [element('span', '', [meta.label]), range, number]));
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

function setChip(chip: HTMLElement, text: string): void {
  chip.textContent = text;
  chip.style.display = text ? '' : 'none';
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
