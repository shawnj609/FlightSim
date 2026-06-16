import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { defaultBlimpConfig, type BlimpConfig } from '../config/blimpConfig';
import { createCraft, type Craft, type CraftId } from '../scene/craft';
import { createWorld, type SceneId, type World } from '../scene/worlds';
import { RingCourse } from '../scene/rings';
import { Beacon, GroundRing, StationBox } from '../scene/markers';
import { PilotAids } from '../scene/pilotAids';
import { resolveSurfaceCollisions } from '../sim/collisions';
import { deriveSeed } from '../sim/rng';
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
import { type Mission, type MissionContext, type MissionView } from '../sim/missionTypes';
import { createChallenge } from '../sim/challenges';
import { Tutorial } from '../sim/tutorial';
import { CameraRig, cameraModeLabels, pilotCameraPosition, type CameraMode } from './cameras';
import { type ActivityId, defaultActivity, isChallenge, availableActivities } from './activities';
import { SimUI } from './ui';

export class SimulatorApp {
  private readonly root: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 1400);
  private readonly orbitControls: OrbitControls;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3();
  private craft: Craft;
  private craftId: CraftId = 'blimp';
  private readonly ui: SimUI;
  private readonly keyboard: KeyboardInput;
  private readonly controllerProfile: ControllerProfile;

  private config: BlimpConfig = { ...defaultBlimpConfig };
  private state: BlimpState = createInitialBlimpState();

  // World + mission
  private sceneId: SceneId = 'arena';
  private worldSeed = 1337;
  private regenCount = 0;
  private world: World;
  private activity: ActivityId = 'tutorial';
  private mission?: Mission;
  private courseActive = false;
  private freeFlightElapsed = 0;
  private readonly missionGroup = new THREE.Group();
  private ringCourse?: RingCourse;
  private readonly beacon = new Beacon();
  private readonly groundRing = new GroundRing();
  private readonly stationBox = new StationBox();
  private readonly cameraRig = new CameraRig();
  private readonly pilotAids = new PilotAids();
  private aidsActive = true;

  // Contact edge detection
  private inContact = false;
  private contactClearTimer = 0;
  private contacts = 0;

  private cameraMode: CameraMode = 'pilot';
  private paused = false;
  private latestControls: AxisValues = { ...defaultAxisValues };
  private latestRawAxes: number[] = [];
  private autoCenteredUnsavedProfile = false;
  private lastFrameTime = 0;
  private elapsedTime = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add('sim-root');

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.root.appendChild(this.renderer.domElement);

    // Image-based lighting: a generated studio environment gives every PBR material
    // realistic reflections and fill, lifting metals, glass and the craft skins.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.enabled = false;

    this.hemisphere = new THREE.HemisphereLight(0xbfd7ff, 0x20252a, 1.7);
    this.scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.missionGroup);
    this.missionGroup.add(this.beacon.group, this.groundRing.group, this.stationBox.group);
    this.scene.add(this.pilotAids.group);

    // UI must exist before applyWorld(), which syncs the config drawer.
    this.controllerProfile = ControllerProfile.load();
    this.keyboard = new KeyboardInput(window);
    this.ui = new SimUI(this.root, this.createCallbacks(), this.config, this.controllerProfile);

    this.world = createWorld(this.sceneId, this.worldSeed, this.config);
    this.scene.add(this.world.group);
    this.applyWorld(this.world);

    this.craft = createCraft(this.craftId, this.config);
    this.scene.add(this.craft.group);

    this.resetBlimpToSpawn();
    this.startActivity(this.activity);
    this.ui.syncScene(this.sceneId, this.activity, this.world.canRegenerate, this.courseActive);
    this.ui.setAidsActive(this.aidsActive);

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

  // --- World / scene management ----------------------------------------------

  private applyWorld(world: World): void {
    const env = world.environment;
    this.scene.background = env.background;
    this.scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    this.hemisphere.color.setHex(env.hemisphere.sky);
    this.hemisphere.groundColor.setHex(env.hemisphere.ground);
    this.hemisphere.intensity = env.hemisphere.intensity;
    this.sun.color.setHex(env.sun.color);
    this.sun.intensity = env.sun.intensity;
    this.sunOffset.copy(env.sun.position);
    const half = Math.min(env.shadowRadius, 55);
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 0.5;
    cam.far = this.sunOffset.length() + half * 2;
    cam.updateProjectionMatrix();
    this.config = { ...this.config, windStrength: world.defaultWind };
    this.ui.syncConfig(this.config);
    this.cameraMode = world.defaultCamera;
    this.root.dataset.cameraMode = cameraModeLabels[this.cameraMode];
    this.ui.syncCamera(this.cameraMode);
    this.cameraRig.snap();
  }

  private rebuildWorld(sceneId: SceneId, seed: number): void {
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.sceneId = sceneId;
    this.worldSeed = seed;
    this.world = createWorld(sceneId, seed, this.config);
    this.scene.add(this.world.group);
    this.applyWorld(this.world);
  }

  private setScene(sceneId: SceneId): void {
    if (sceneId === this.sceneId) {
      return;
    }
    this.rebuildWorld(sceneId, this.worldSeed);
    this.courseActive = false;
    if (!availableActivities(sceneId).includes(this.activity)) {
      this.activity = defaultActivity(sceneId);
    }
    this.resetBlimpToSpawn();
    this.startActivity(this.activity);
    this.ui.syncScene(this.sceneId, this.activity, this.world.canRegenerate, this.courseActive);
  }

  private regenerate(): void {
    if (!this.world.canRegenerate) {
      return;
    }
    this.regenCount += 1;
    const seed = deriveSeed(this.worldSeed, this.regenCount * 911 + 1);
    this.rebuildWorld(this.sceneId, seed);
    this.resetBlimpToSpawn();
    this.startActivity(this.activity);
    this.ui.syncScene(this.sceneId, this.activity, this.world.canRegenerate, this.courseActive);
  }

  // --- Activity / mission management -----------------------------------------

  private missionContext(): MissionContext {
    return {
      spawn: this.world.spawn.clone(),
      ringAnchors: this.world.ringAnchors,
      pilotCameraPosition,
      groundHeightAt: (x, z) => this.world.groundHeightAt(x, z)
    };
  }

  private startActivity(activity: ActivityId): void {
    this.activity = activity;
    this.disposeRingCourse();
    this.mission = undefined;
    this.freeFlightElapsed = 0;
    this.resetContacts();

    const ctx = this.missionContext();

    if (activity === 'tutorial') {
      this.mission = new Tutorial(ctx);
    } else if (isChallenge(activity)) {
      this.mission = createChallenge(activity, ctx);
    } else if (this.courseActive) {
      // Free flight with the timed ring course switched on.
      this.mission = createChallenge('ringRun', ctx);
    }

    if (this.mission?.usesRingCourse && this.mission.ringAnchors.length) {
      this.ringCourse = new RingCourse(this.mission.ringAnchors);
      this.missionGroup.add(this.ringCourse.group);
    }
  }

  private setActivity(activity: ActivityId): void {
    if (activity === 'freeFlight') {
      this.courseActive = false;
    }
    this.resetBlimpToSpawn();
    this.startActivity(activity);
    this.ui.syncScene(this.sceneId, this.activity, this.world.canRegenerate, this.courseActive);
  }

  private toggleCourse(): void {
    if (this.activity !== 'freeFlight') {
      return;
    }
    this.courseActive = !this.courseActive;
    this.resetBlimpToSpawn();
    this.startActivity('freeFlight');
    this.ui.setCourseActive(this.courseActive);
  }

  private toggleAids(): void {
    this.aidsActive = !this.aidsActive;
    this.pilotAids.setVisible(this.aidsActive);
    this.ui.setAidsActive(this.aidsActive);
  }

  private setCraft(craftId: CraftId): void {
    if (craftId === this.craftId) {
      return;
    }
    this.craftId = craftId;
    this.scene.remove(this.craft.group);
    this.craft.dispose();
    this.craft = createCraft(craftId, this.config);
    this.scene.add(this.craft.group);
    this.craft.update(this.state, this.latestControls, this.elapsedTime, this.config);
  }

  private disposeRingCourse(): void {
    if (this.ringCourse) {
      this.missionGroup.remove(this.ringCourse.group);
      this.ringCourse.dispose();
      this.ringCourse = undefined;
    }
  }

  private resetContacts(): void {
    this.contacts = 0;
    this.inContact = false;
    this.contactClearTimer = 0;
  }

  private resetBlimpToSpawn(): void {
    this.state = createInitialBlimpState();
    this.state.position.copy(this.world.spawn);
    this.orbitControls.target.copy(this.state.position);
  }

  // --- Frame loop ------------------------------------------------------------

  private frame(): void {
    const now = performance.now() / 1000;
    const dt = Math.min(now - this.lastFrameTime, 0.05);
    this.lastFrameTime = now;
    this.elapsedTime += dt;
    const controls = this.readControls();

    let view: MissionView | undefined;
    if (!this.paused) {
      stepBlimp(this.state, controls, this.config, dt);
      const collisions = resolveSurfaceCollisions(this.state, this.config, this.world, this.world.colliders);
      this.trackContacts(collisions.faults > 0, dt);
      view = this.updateMission(controls, dt);
    } else {
      view = this.currentView(controls, 0);
    }

    const time = this.elapsedTime;
    this.world.update(time);
    this.craft.update(this.state, controls, time, this.config);
    if (this.ringCourse && view?.ringActiveIndex !== undefined) {
      this.ringCourse.setActiveIndex(view.ringActiveIndex);
    }
    this.ringCourse?.update(time);
    this.syncMarkers(view, time);
    this.pilotAids.update(this.state.position, this.world.groundHeightAt(this.state.position.x, this.state.position.z));
    this.cameraRig.update({
      camera: this.camera,
      orbit: this.orbitControls,
      mode: this.cameraMode,
      state: this.state,
      config: this.config,
      dt,
      groundHeightAt: (x, z) => this.world.groundHeightAt(x, z),
      pilotStation: this.world.pilotStation
    });
    this.updateSun();
    this.updateHud(view);
    this.renderer.render(this.scene, this.camera);
  }

  private trackContacts(hitNow: boolean, dt: number): void {
    if (hitNow) {
      if (!this.inContact) {
        this.contacts += 1;
        this.inContact = true;
      }
      this.contactClearTimer = 0;
    } else if (this.inContact) {
      this.contactClearTimer += dt;
      if (this.contactClearTimer > 0.4) {
        this.inContact = false;
      }
    }
  }

  private updateMission(controls: AxisValues, dt: number): MissionView {
    if (this.mission) {
      return this.mission.update(this.state, controls, dt, this.contacts, pilotCameraPosition);
    }
    this.freeFlightElapsed += dt;
    return this.currentView(controls, this.freeFlightElapsed);
  }

  private currentView(controls: AxisValues, freeElapsed: number): MissionView {
    if (this.mission) {
      // Paused: re-read the last view without advancing time.
      return this.mission.update(this.state, controls, 0, this.contacts, pilotCameraPosition);
    }
    return {
      title: 'Free flight',
      objective: this.world.canRegenerate
        ? 'Explore the world. Switch on the ring course for a timed run, or Regenerate for a fresh map.'
        : 'Free flight.',
      hint: '',
      progress: '',
      timerSeconds: freeElapsed,
      contacts: this.contacts,
      state: 'active'
    };
  }

  private syncMarkers(view: MissionView | undefined, time: number): void {
    const beacon = view?.beacon;
    const groundY = beacon ? this.world.groundHeightAt(beacon.position.x, beacon.position.z) : 0;
    this.beacon.sync(beacon, groundY, time);
    this.groundRing.sync(view?.groundRing, time);
    this.stationBox.sync(view?.stationBox);
  }

  private updateSun(): void {
    this.sun.position.copy(this.state.position).add(this.sunOffset);
    this.sun.target.position.copy(this.state.position);
    this.sun.target.updateMatrixWorld();
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

  private updateHud(view: MissionView | undefined): void {
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
    if (view) {
      this.ui.updateMission(view);
    }
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
        this.cameraRig.snap();
      },
      onSceneChange: (scene: SceneId) => this.setScene(scene),
      onCraftChange: (craft: CraftId) => this.setCraft(craft),
      onActivityChange: (activity: ActivityId) => this.setActivity(activity),
      onRegenerate: () => this.regenerate(),
      onCourseToggle: () => this.toggleCourse(),
      onAidsToggle: () => this.toggleAids(),
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

  private reset(): void {
    this.resetBlimpToSpawn();
    this.resetContacts();
    this.mission?.reset();
    if (this.ringCourse) {
      this.ringCourse.setActiveIndex(0);
    }
    this.freeFlightElapsed = 0;
    this.cameraRig.snap();
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
