import * as THREE from 'three';
import { type AabbCollider } from '../../sim/collisions';
import { type BlimpConfig } from '../../config/blimpConfig';
import { pilotCameraPosition } from '../../app/cameras';
import { type RingAnchor, type World, type WorldEnvironment } from './World';

const ARENA_WIDTH = 54;
const ARENA_DEPTH = 74;
const HALF_WIDTH = ARENA_WIDTH / 2;
const HALF_DEPTH = ARENA_DEPTH / 2;

/** The indoor rehearsal arena: the static venue only — rings/markers are mission visuals. */
export class ArenaWorld implements World {
  readonly id = 'arena' as const;
  readonly label = 'Indoor arena';
  readonly group = new THREE.Group();
  readonly colliders: AabbCollider[] = [];
  readonly spawn = new THREE.Vector3(0, 4.2, 16);
  readonly pilotStation = pilotCameraPosition.clone();
  readonly defaultCamera = 'pilot' as const;
  readonly defaultWind = 0.42;
  readonly canRegenerate = false;
  readonly ringAnchors: RingAnchor[] = [
    { position: new THREE.Vector3(-12, 4.3, 8), radius: 2.3 },
    { position: new THREE.Vector3(-4, 5.2, -5), radius: 2.15 },
    { position: new THREE.Vector3(10.5, 4.6, -15), radius: 2.3 },
    { position: new THREE.Vector3(2, 6, -25), radius: 2.2 },
    { position: new THREE.Vector3(-11, 4.3, -31), radius: 2.3 }
  ];
  readonly environment: WorldEnvironment = {
    background: new THREE.Color(0x11161b),
    fog: { color: 0x11161b, near: 38, far: 105 },
    hemisphere: { sky: 0xbfd7ff, ground: 0x20252a, intensity: 1.7 },
    sun: { color: 0xffffff, intensity: 1.35, position: new THREE.Vector3(8, 12, 9) },
    shadowRadius: 42
  };

  private readonly maxArenaHeight: number;
  private videoWall?: THREE.CanvasTexture;
  private readonly disposers: Array<() => void> = [];

  constructor(config: BlimpConfig) {
    this.maxArenaHeight = config.maxArenaHeight;
    this.group.name = 'indoor-rehearsal-arena';
    this.build();
  }

  groundHeightAt(): number {
    return 0;
  }

  ceilingAt(): number {
    return this.maxArenaHeight;
  }

  isWaterAt(): boolean {
    return false;
  }

  update(time: number): void {
    if (this.videoWall) {
      drawVideoWall(this.videoWall.image as HTMLCanvasElement, time);
      this.videoWall.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const dispose of this.disposers) {
      dispose();
    }
    this.group.clear();
  }

  private track(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]): void {
    this.disposers.push(() => {
      geometry.dispose();
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material.dispose();
      }
    });
  }

  private addMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    this.track(geometry, material);
    return mesh;
  }

  private build(): void {
    const floor = this.addMesh(
      new THREE.PlaneGeometry(ARENA_WIDTH, ARENA_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.72, metalness: 0.04 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const majorGrid = new THREE.GridHelper(ARENA_DEPTH, ARENA_DEPTH, 0xf8d66d, 0x53606a);
    majorGrid.position.y = 0.012;
    this.group.add(majorGrid);
    this.disposers.push(() => majorGrid.dispose());

    this.addDepthStripes();
    this.addVenuePerimeter();
    this.addStage();
    this.addVideoWall();
    this.addCeilingTruss();
    this.addLightingTowers();
    this.addCrowdBarrier();
    this.addHangingCables();
  }

  private addDepthStripes(): void {
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xf1b24a, transparent: true, opacity: 0.32 });
    const stripeGeo = new THREE.BoxGeometry(ARENA_WIDTH, 0.012, 0.05);
    this.track(stripeGeo, stripeMaterial);
    for (let z = -HALF_DEPTH + 4; z <= HALF_DEPTH - 4; z += 4) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMaterial);
      stripe.position.set(0, 0.018, z);
      this.group.add(stripe);
    }

    const centerLine = this.addMesh(
      new THREE.BoxGeometry(0.08, 0.014, ARENA_DEPTH),
      new THREE.MeshBasicMaterial({ color: 0x88e0ff, transparent: true, opacity: 0.32 })
    );
    centerLine.position.y = 0.02;
    this.group.add(centerLine);

    const sideLaneMaterial = new THREE.MeshBasicMaterial({ color: 0x55d6a9, transparent: true, opacity: 0.22 });
    const laneGeo = new THREE.BoxGeometry(0.045, 0.014, ARENA_DEPTH);
    this.track(laneGeo, sideLaneMaterial);
    for (const x of [-18, -9, 9, 18]) {
      const lane = new THREE.Mesh(laneGeo, sideLaneMaterial);
      lane.position.set(x, 0.021, 0);
      this.group.add(lane);
    }
  }

  private addVenuePerimeter(): void {
    const curtainMaterial = new THREE.MeshStandardMaterial({
      color: 0x171d22,
      roughness: 0.8,
      metalness: 0.02,
      transparent: true,
      opacity: 0.92
    });
    this.disposers.push(() => curtainMaterial.dispose());

    const backGeo = new THREE.BoxGeometry(ARENA_WIDTH, 8, 0.18);
    const backCurtain = new THREE.Mesh(backGeo, curtainMaterial);
    backCurtain.position.set(0, 4, -HALF_DEPTH);
    this.group.add(backCurtain);
    this.disposers.push(() => backGeo.dispose());
    this.colliders.push({ id: 'back-curtain', center: backCurtain.position.clone(), halfSize: new THREE.Vector3(HALF_WIDTH, 4, 0.09), restitution: 0.16 });

    const sideGeo = new THREE.BoxGeometry(0.18, 7.4, ARENA_DEPTH);
    this.disposers.push(() => sideGeo.dispose());
    for (const x of [-HALF_WIDTH, HALF_WIDTH]) {
      const sideCurtain = new THREE.Mesh(sideGeo, curtainMaterial);
      sideCurtain.position.set(x, 3.7, 0);
      this.group.add(sideCurtain);
      this.colliders.push({ id: `side-curtain-${x < 0 ? 'left' : 'right'}`, center: sideCurtain.position.clone(), halfSize: new THREE.Vector3(0.09, 3.7, HALF_DEPTH), restitution: 0.16 });
    }
  }

  private addStage(): void {
    const stage = this.addMesh(
      new THREE.BoxGeometry(17, 0.68, 6.4),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.6, metalness: 0.12 })
    );
    stage.position.set(0, 0.34, -28);
    stage.castShadow = true;
    stage.receiveShadow = true;
    this.group.add(stage);
    this.colliders.push({ id: 'stage', center: stage.position.clone(), halfSize: new THREE.Vector3(8.5, 0.34, 3.2) });

    const stageLip = this.addMesh(
      new THREE.BoxGeometry(17.4, 0.12, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xffcf66, roughness: 0.4, metalness: 0.1 })
    );
    stageLip.position.set(0, 0.74, -24.7);
    this.group.add(stageLip);
    this.colliders.push({ id: 'stage-lip', center: stageLip.position.clone(), halfSize: new THREE.Vector3(8.7, 0.06, 0.11) });
  }

  private addVideoWall(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    drawVideoWall(canvas, 0);
    this.videoWall = texture;

    const wall = this.addMesh(
      new THREE.PlaneGeometry(8.5, 3.2),
      new THREE.MeshStandardMaterial({ map: texture, emissive: 0x18324a, emissiveIntensity: 0.65, roughness: 0.35 })
    );
    wall.scale.set(1.55, 1.35, 1);
    wall.position.set(0, 4.2, -34.6);
    this.group.add(wall);
    this.disposers.push(() => texture.dispose());

    const frame = this.addMesh(
      new THREE.BoxGeometry(13.6, 4.8, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.4, metalness: 0.35 })
    );
    frame.position.set(0, 4.2, -34.72);
    this.group.add(frame);
  }

  private addCeilingTruss(): void {
    const y = this.maxArenaHeight - 0.35;
    const material = new THREE.MeshStandardMaterial({ color: 0x6f7880, roughness: 0.38, metalness: 0.62 });
    this.disposers.push(() => material.dispose());

    const beamZGeo = new THREE.BoxGeometry(50, 0.18, 0.18);
    this.disposers.push(() => beamZGeo.dispose());
    for (const z of [-32, -24, -16, -8, 0, 8, 16, 24, 32]) {
      const beam = new THREE.Mesh(beamZGeo, material);
      beam.position.set(0, y, z);
      this.group.add(beam);
      this.colliders.push({ id: `ceiling-truss-z-${z}`, center: beam.position.clone(), halfSize: new THREE.Vector3(25, 0.09, 0.09) });
    }

    const beamXGeo = new THREE.BoxGeometry(0.18, 0.18, 66);
    this.disposers.push(() => beamXGeo.dispose());
    for (const x of [-22, -16, -10, -4, 4, 10, 16, 22]) {
      const beam = new THREE.Mesh(beamXGeo, material);
      beam.position.set(x, y + 0.1, 0);
      this.group.add(beam);
      this.colliders.push({ id: `ceiling-truss-x-${x}`, center: beam.position.clone(), halfSize: new THREE.Vector3(0.09, 0.09, 33) });
    }
  }

  private addLightingTowers(): void {
    const positions = [
      new THREE.Vector3(-23.5, 2.8, -24),
      new THREE.Vector3(23.5, 2.8, -24),
      new THREE.Vector3(-23.5, 2.8, 18),
      new THREE.Vector3(23.5, 2.8, 18)
    ];
    const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x40484e, roughness: 0.35, metalness: 0.55 });
    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2b6, emissive: 0xffc35a, emissiveIntensity: 1.15 });
    const towerGeo = new THREE.BoxGeometry(0.48, 5.6, 0.48);
    const lampGeo = new THREE.SphereGeometry(0.22, 16, 12);
    this.disposers.push(() => {
      towerMaterial.dispose();
      lampMaterial.dispose();
      towerGeo.dispose();
      lampGeo.dispose();
    });

    for (const [index, position] of positions.entries()) {
      const tower = new THREE.Mesh(towerGeo, towerMaterial);
      tower.position.copy(position);
      tower.castShadow = true;
      this.group.add(tower);
      this.colliders.push({ id: `lighting-tower-${index + 1}`, center: position.clone(), halfSize: new THREE.Vector3(0.24, 2.8, 0.24) });

      const lamp = new THREE.Mesh(lampGeo, lampMaterial);
      lamp.position.set(position.x, 5.8, position.z);
      this.group.add(lamp);

      const spot = new THREE.SpotLight(0xffe5a8, 2.2, 42, Math.PI / 9, 0.6, 1.4);
      spot.position.set(position.x, 5.9, position.z);
      spot.target.position.set(0, 1, -8);
      this.group.add(spot, spot.target);
    }
  }

  private addCrowdBarrier(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xb9c0c5, roughness: 0.32, metalness: 0.55 });
    this.disposers.push(() => material.dispose());
    const segments = [
      { center: new THREE.Vector3(-8.5, 0.7, -22), half: new THREE.Vector3(4.2, 0.35, 0.08) },
      { center: new THREE.Vector3(8.5, 0.7, -22), half: new THREE.Vector3(4.2, 0.35, 0.08) },
      { center: new THREE.Vector3(-12.8, 0.7, -17.5), half: new THREE.Vector3(0.08, 0.35, 4.5) },
      { center: new THREE.Vector3(12.8, 0.7, -17.5), half: new THREE.Vector3(0.08, 0.35, 4.5) }
    ];

    for (const [index, segment] of segments.entries()) {
      const geo = new THREE.BoxGeometry(segment.half.x * 2, segment.half.y * 2, segment.half.z * 2);
      const barrier = new THREE.Mesh(geo, material);
      barrier.position.copy(segment.center);
      this.group.add(barrier);
      this.disposers.push(() => geo.dispose());
      this.colliders.push({ id: `crowd-barrier-${index + 1}`, center: segment.center.clone(), halfSize: segment.half.clone() });
    }
  }

  private addHangingCables(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.5, metalness: 0.28 });
    this.disposers.push(() => material.dispose());
    const starts = [
      new THREE.Vector3(-9, this.maxArenaHeight - 0.4, -21),
      new THREE.Vector3(7.5, this.maxArenaHeight - 0.4, -13),
      new THREE.Vector3(-14, this.maxArenaHeight - 0.4, 4),
      new THREE.Vector3(15, this.maxArenaHeight - 0.4, 14),
      new THREE.Vector3(0, this.maxArenaHeight - 0.4, -30)
    ];

    for (const [index, start] of starts.entries()) {
      const end = start.clone().add(new THREE.Vector3(Math.sin(index) * 0.55, -2.8 - index * 0.18, Math.cos(index) * 0.35));
      const direction = end.clone().sub(start);
      const length = direction.length();
      const geo = new THREE.CylinderGeometry(0.035, 0.035, length, 10);
      const cable = new THREE.Mesh(geo, material);
      cable.position.copy(start).addScaledVector(direction, 0.5);
      cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      this.group.add(cable);
      this.disposers.push(() => geo.dispose());

      const center = start.clone().add(end).multiplyScalar(0.5);
      const half = new THREE.Vector3(
        Math.abs(start.x - end.x) * 0.5 + 0.12,
        Math.abs(start.y - end.y) * 0.5 + 0.12,
        Math.abs(start.z - end.z) * 0.5 + 0.12
      );
      this.colliders.push({ id: `hanging-cable-${index + 1}`, center, halfSize: half, restitution: 0.18 });
    }
  }
}

function drawVideoWall(canvas: HTMLCanvasElement, time: number): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#102b3b');
  gradient.addColorStop(0.55, '#1b3352');
  gradient.addColorStop(1, '#241a2d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < canvas.width; x += 32) {
    const height = 30 + Math.sin(time * 2 + x * 0.04) * 26;
    context.fillStyle = x % 64 === 0 ? '#55d6ff' : '#f2c86b';
    context.globalAlpha = 0.45;
    context.fillRect(x + 6, canvas.height * 0.5 - height * 0.5, 12, height);
  }
  context.globalAlpha = 1;
  context.fillStyle = '#f7f4e8';
  context.font = 'bold 34px system-ui, sans-serif';
  context.fillText('REHEARSAL', 34, 66);
  context.font = '20px system-ui, sans-serif';
  context.fillText('SLOW PASS WINDOW', 34, 102);
}
