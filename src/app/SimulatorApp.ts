import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { defaultBlimpConfig, type BlimpConfig } from '../config/blimpConfig';
import { createBlimpVisual, type BlimpVisual } from '../scene/blimp';
import { createArena, type ArenaEnvironment } from '../scene/environment';
import { resolveArenaCollisions } from '../sim/collisions';
import {
  ControllerProfile,
  KeyboardInput,
  defaultAxisValues,
  getActiveGamepad,
  type AxisValues,
  type ControlAxis
} from '../sim/input';
import {
  createInitialBlimpState,
  getPitchRadians,
  getYawRadians,
  stepBlimp,
  type BlimpState
} from '../sim/physics';
import { TrainingSession, type TrainingMode } from '../sim/training';
import { cameraModeLabels, pilotCameraPosition, updateCameraForMode, type CameraMode } from './cameras';
import { SimUI } from './ui';

export class SimulatorApp {
  private readonly root: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 180);
  private readonly orbitControls: OrbitControls;
  private readonly arena: ArenaEnvironment;
  private readonly blimp: BlimpVisual;
  private readonly ui: SimUI;
  private readonly keyboard: KeyboardInput;
  private readonly controllerProfile: ControllerProfile;
  private config: BlimpConfig = { ...defaultBlimpConfig };
  private state: BlimpState = createInitialBlimpState();
  private training = new TrainingSession('hoverBox');
  private cameraMode: CameraMode = 'pilot';
  private paused = false;
  private latestControls: AxisValues = { ...defaultAxisValues };
  private latestRawAxes: number[] = [];
  private totalFaults = 0;
  private autoCenteredUnsavedProfile = false;
  private lastFrameTime = 0;
  private elapsedTime = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add('sim-root');

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.root.appendChild(this.renderer.domElement);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.enabled = false;
    this.orbitControls.target.copy(this.state.position);

    this.setupScene();
    this.arena = createArena(this.config.maxArenaHeight);
    this.scene.add(this.arena.group);
    this.blimp = createBlimpVisual(this.config);
    this.scene.add(this.blimp.group);

    this.controllerProfile = ControllerProfile.load();
    this.keyboard = new KeyboardInput(window);
    this.ui = new SimUI(this.root, this.createCallbacks(), this.config, this.controllerProfile);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (event) => this.handleKey(event));
    window.addEventListener('gamepadconnected', () => this.readControls());
    window.addEventListener('gamepaddisconnected', () => this.readControls());
  }

  start(): void {
    this.lastFrameTime = performance.now() / 1000;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupScene(): void {
    this.scene.background = new THREE.Color(0x11161b);
    this.scene.fog = new THREE.Fog(0x11161b, 38, 105);

    const ambient = new THREE.HemisphereLight(0xbfd7ff, 0x20252a, 1.7);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(8, 12, 9);
    key.castShadow = true;
    key.shadow.camera.left = -34;
    key.shadow.camera.right = 34;
    key.shadow.camera.top = 42;
    key.shadow.camera.bottom = -42;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
  }

  private createCallbacks() {
    return {
      onReset: () => this.reset(),
      onPauseToggle: () => this.setPaused(!this.paused),
      onSettingsToggle: () => {
        this.setPaused(true);
        this.ui.toggleSettings();
      },
      onCalibrationToggle: () => {
        this.setPaused(true);
        this.ui.toggleCalibration();
      },
      onCameraMode: (mode: CameraMode) => {
        this.cameraMode = mode;
        this.root.dataset.cameraMode = cameraModeLabels[mode];
      },
      onTrainingMode: (mode: TrainingMode) => {
        this.training.reset(mode);
        this.totalFaults = 0;
      },
      onConfigChange: (key: keyof BlimpConfig, value: number) => {
        this.config = { ...this.config, [key]: value };
        this.ui.syncConfig(this.config);
      },
      onAxisMappingChange: (axis: ControlAxis, sourceAxis: number, inverted: boolean) => {
        this.controllerProfile.setMapping(axis, { sourceAxis, inverted });
        this.ui.syncProfile(this.controllerProfile);
      },
      onCalibrateCenter: () => {
        this.controllerProfile.calibrateCenter(this.latestRawAxes);
        this.ui.syncProfile(this.controllerProfile);
      }
    };
  }

  private frame(): void {
    const now = performance.now() / 1000;
    const dt = Math.min(now - this.lastFrameTime, 0.05);
    this.lastFrameTime = now;
    this.elapsedTime += dt;
    const controls = this.readControls();

    if (!this.paused) {
      stepBlimp(this.state, controls, this.config, dt);
      const collisions = resolveArenaCollisions(this.state, this.config, this.arena.colliders);
      this.totalFaults += collisions.faults;
      this.training.update(this.state, controls, dt, this.totalFaults, pilotCameraPosition);
    }

    const time = this.elapsedTime;
    this.arena.update(time);
    this.blimp.update(this.state, controls, time, this.config);
    updateCameraForMode(this.camera, this.orbitControls, this.cameraMode, this.state, this.config, dt);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  private readControls(): AxisValues {
    const gamepad = getActiveGamepad();
    const keyboardValues = this.keyboard.read();
    const keyboardActive = this.keyboard.hasInput();

    if (gamepad) {
      this.latestRawAxes = Array.from(gamepad.axes);
      if (!this.controllerProfile.loadedFromStorage && !this.autoCenteredUnsavedProfile) {
        this.controllerProfile.calibrateCenter(this.latestRawAxes);
        this.ui.syncProfile(this.controllerProfile);
        this.autoCenteredUnsavedProfile = true;
      }
      this.latestControls = keyboardActive
        ? keyboardValues
        : this.controllerProfile.read(this.latestRawAxes, this.config.deadzone);
      this.ui.updateControllerStatus({
        connected: true,
        id: gamepad.id,
        index: gamepad.index,
        rawAxes: this.latestRawAxes,
        usingKeyboard: keyboardActive
      });
    } else {
      this.latestRawAxes = [];
      this.latestControls = keyboardValues;
      this.ui.updateControllerStatus({
        connected: false,
        id: '',
        index: -1,
        rawAxes: [],
        usingKeyboard: keyboardActive
      });
    }

    this.ui.updateInput(this.latestControls);
    return this.latestControls;
  }

  private updateHud(): void {
    const yaw = THREE.MathUtils.radToDeg(getYawRadians(this.state));
    const pitch = THREE.MathUtils.radToDeg(getPitchRadians(this.state));
    this.ui.updateTelemetry({
      altitude: this.state.position.y,
      speed: this.state.velocity.length(),
      yaw,
      pitch,
      verticalVelocity: this.state.velocity.y,
      driftX: this.state.velocity.x,
      driftZ: this.state.velocity.z,
      motorsOffCenter: Math.abs(this.latestControls.vertical) < 0.03 && Math.abs(this.state.motors.vertical) < 0.04
    });
    this.ui.updateTraining(this.training.snapshot());
  }

  private reset(): void {
    this.state = createInitialBlimpState();
    this.totalFaults = 0;
    this.training.reset();
    this.orbitControls.target.copy(this.state.position);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.ui.setPaused(paused);
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      this.setPaused(!this.paused);
      this.ui.toggleSettings(this.paused);
    }
    if (event.code === 'KeyR' && !event.repeat) {
      this.reset();
    }
    if (event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
  }

  private resize(): void {
    const width = this.root.clientWidth || window.innerWidth;
    const height = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
