import * as THREE from 'three';
import { type AabbCollider } from '../sim/collisions';
import { createGateCourse } from '../sim/training';

export interface ArenaEnvironment {
  group: THREE.Group;
  colliders: AabbCollider[];
  hoverBox: THREE.Mesh;
  gateMeshes: THREE.Mesh[];
  precisionRing: THREE.Mesh;
  update: (time: number) => void;
}

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x1d2328,
  roughness: 0.72,
  metalness: 0.04
});

const ARENA_WIDTH = 54;
const ARENA_DEPTH = 74;
const HALF_WIDTH = ARENA_WIDTH / 2;
const HALF_DEPTH = ARENA_DEPTH / 2;

export function createArena(maxArenaHeight: number): ArenaEnvironment {
  const group = new THREE.Group();
  group.name = 'indoor-rehearsal-arena';
  const colliders: AabbCollider[] = [];

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_WIDTH, ARENA_DEPTH), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const majorGrid = new THREE.GridHelper(ARENA_DEPTH, ARENA_DEPTH, 0xf8d66d, 0x53606a);
  majorGrid.position.y = 0.012;
  group.add(majorGrid);

  addDepthStripes(group);
  addVenuePerimeter(group, colliders);
  addStage(group, colliders);
  const videoWall = addVideoWall(group);
  addCeilingTruss(group, colliders, maxArenaHeight);
  addLightingTowers(group, colliders);
  addCrowdBarrier(group, colliders);
  addHangingCables(group, colliders, maxArenaHeight);

  const hoverBox = createHoverBox();
  group.add(hoverBox);

  const gateMeshes = createGateCourse().map((gate, index) => {
    const gateMesh = createInflatableGate(index, gate.radius);
    gateMesh.position.copy(gate.position);
    gateMesh.name = gate.id;
    group.add(gateMesh);
    return gateMesh;
  });

  const precisionRing = createPrecisionRing();
  precisionRing.position.set(14, 4.6, -12);
  group.add(precisionRing);

  return {
    group,
    colliders,
    hoverBox,
    gateMeshes,
    precisionRing,
    update: (time: number) => {
      updateVideoWall(videoWall, time);
      for (const [index, mesh] of gateMeshes.entries()) {
        mesh.rotation.z = Math.sin(time * 0.8 + index) * 0.04;
      }
    }
  };
}

function addDepthStripes(group: THREE.Group): void {
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xf1b24a, transparent: true, opacity: 0.32 });
  for (let z = -HALF_DEPTH + 4; z <= HALF_DEPTH - 4; z += 4) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(ARENA_WIDTH, 0.012, 0.05), stripeMaterial);
    stripe.position.set(0, 0.018, z);
    group.add(stripe);
  }

  const centerLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.014, ARENA_DEPTH),
    new THREE.MeshBasicMaterial({ color: 0x88e0ff, transparent: true, opacity: 0.32 })
  );
  centerLine.position.y = 0.02;
  group.add(centerLine);

  const sideLaneMaterial = new THREE.MeshBasicMaterial({ color: 0x55d6a9, transparent: true, opacity: 0.22 });
  for (const x of [-18, -9, 9, 18]) {
    const lane = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.014, ARENA_DEPTH), sideLaneMaterial);
    lane.position.set(x, 0.021, 0);
    group.add(lane);
  }
}

function addVenuePerimeter(group: THREE.Group, colliders: AabbCollider[]): void {
  const curtainMaterial = new THREE.MeshStandardMaterial({
    color: 0x171d22,
    roughness: 0.8,
    metalness: 0.02,
    transparent: true,
    opacity: 0.92
  });

  const backCurtain = new THREE.Mesh(new THREE.BoxGeometry(ARENA_WIDTH, 8, 0.18), curtainMaterial);
  backCurtain.position.set(0, 4, -HALF_DEPTH);
  group.add(backCurtain);
  colliders.push({ id: 'back-curtain', center: backCurtain.position.clone(), halfSize: new THREE.Vector3(HALF_WIDTH, 4, 0.09), restitution: 0.16 });

  for (const x of [-HALF_WIDTH, HALF_WIDTH]) {
    const sideCurtain = new THREE.Mesh(new THREE.BoxGeometry(0.18, 7.4, ARENA_DEPTH), curtainMaterial);
    sideCurtain.position.set(x, 3.7, 0);
    group.add(sideCurtain);
    colliders.push({ id: `side-curtain-${x < 0 ? 'left' : 'right'}`, center: sideCurtain.position.clone(), halfSize: new THREE.Vector3(0.09, 3.7, HALF_DEPTH), restitution: 0.16 });
  }
}

function addStage(group: THREE.Group, colliders: AabbCollider[]): void {
  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(17, 0.68, 6.4),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.6, metalness: 0.12 })
  );
  stage.position.set(0, 0.34, -28);
  stage.castShadow = true;
  stage.receiveShadow = true;
  group.add(stage);
  colliders.push({ id: 'stage', center: stage.position.clone(), halfSize: new THREE.Vector3(8.5, 0.34, 3.2) });

  const stageLip = new THREE.Mesh(
    new THREE.BoxGeometry(17.4, 0.12, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xffcf66, roughness: 0.4, metalness: 0.1 })
  );
  stageLip.position.set(0, 0.74, -24.7);
  group.add(stageLip);
  colliders.push({ id: 'stage-lip', center: stageLip.position.clone(), halfSize: new THREE.Vector3(8.7, 0.06, 0.11) });
}

function addVideoWall(group: THREE.Group): THREE.CanvasTexture {
  const texture = makeVideoWallTexture(0);
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(8.5, 3.2),
    new THREE.MeshStandardMaterial({ map: texture, emissive: 0x18324a, emissiveIntensity: 0.65, roughness: 0.35 })
  );
  wall.scale.set(1.55, 1.35, 1);
  wall.position.set(0, 4.2, -34.6);
  group.add(wall);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(13.6, 4.8, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.4, metalness: 0.35 })
  );
  frame.position.set(0, 4.2, -34.72);
  group.add(frame);

  return texture;
}

function addCeilingTruss(group: THREE.Group, colliders: AabbCollider[], maxArenaHeight: number): void {
  const y = maxArenaHeight - 0.35;
  const material = new THREE.MeshStandardMaterial({ color: 0x6f7880, roughness: 0.38, metalness: 0.62 });
  for (const z of [-32, -24, -16, -8, 0, 8, 16, 24, 32]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(50, 0.18, 0.18), material);
    beam.position.set(0, y, z);
    group.add(beam);
    colliders.push({ id: `ceiling-truss-z-${z}`, center: beam.position.clone(), halfSize: new THREE.Vector3(25, 0.09, 0.09) });
  }
  for (const x of [-22, -16, -10, -4, 4, 10, 16, 22]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 66), material);
    beam.position.set(x, y + 0.1, 0);
    group.add(beam);
    colliders.push({ id: `ceiling-truss-x-${x}`, center: beam.position.clone(), halfSize: new THREE.Vector3(0.09, 0.09, 33) });
  }
}

function addLightingTowers(group: THREE.Group, colliders: AabbCollider[]): void {
  const positions = [
    new THREE.Vector3(-23.5, 2.8, -24),
    new THREE.Vector3(23.5, 2.8, -24),
    new THREE.Vector3(-23.5, 2.8, 18),
    new THREE.Vector3(23.5, 2.8, 18)
  ];
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x40484e, roughness: 0.35, metalness: 0.55 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2b6, emissive: 0xffc35a, emissiveIntensity: 1.15 });

  for (const [index, position] of positions.entries()) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.48, 5.6, 0.48), towerMaterial);
    tower.position.copy(position);
    tower.castShadow = true;
    group.add(tower);
    colliders.push({ id: `lighting-tower-${index + 1}`, center: position.clone(), halfSize: new THREE.Vector3(0.24, 2.8, 0.24) });

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), lampMaterial);
    lamp.position.set(position.x, 5.8, position.z);
    group.add(lamp);

    const spot = new THREE.SpotLight(0xffe5a8, 2.2, 42, Math.PI / 9, 0.6, 1.4);
    spot.position.set(position.x, 5.9, position.z);
    spot.target.position.set(0, 1, -8);
    group.add(spot, spot.target);
  }
}

function addCrowdBarrier(group: THREE.Group, colliders: AabbCollider[]): void {
  const material = new THREE.MeshStandardMaterial({ color: 0xb9c0c5, roughness: 0.32, metalness: 0.55 });
  const segments = [
    { center: new THREE.Vector3(-8.5, 0.7, -22), half: new THREE.Vector3(4.2, 0.35, 0.08) },
    { center: new THREE.Vector3(8.5, 0.7, -22), half: new THREE.Vector3(4.2, 0.35, 0.08) },
    { center: new THREE.Vector3(-12.8, 0.7, -17.5), half: new THREE.Vector3(0.08, 0.35, 4.5) },
    { center: new THREE.Vector3(12.8, 0.7, -17.5), half: new THREE.Vector3(0.08, 0.35, 4.5) }
  ];

  for (const [index, segment] of segments.entries()) {
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(segment.half.x * 2, segment.half.y * 2, segment.half.z * 2),
      material
    );
    barrier.position.copy(segment.center);
    group.add(barrier);
    colliders.push({ id: `crowd-barrier-${index + 1}`, center: segment.center.clone(), halfSize: segment.half.clone() });
  }
}

function addHangingCables(group: THREE.Group, colliders: AabbCollider[], maxArenaHeight: number): void {
  const material = new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.5, metalness: 0.28 });
  const starts = [
    new THREE.Vector3(-9, maxArenaHeight - 0.4, -21),
    new THREE.Vector3(7.5, maxArenaHeight - 0.4, -13),
    new THREE.Vector3(-14, maxArenaHeight - 0.4, 4),
    new THREE.Vector3(15, maxArenaHeight - 0.4, 14),
    new THREE.Vector3(0, maxArenaHeight - 0.4, -30)
  ];

  for (const [index, start] of starts.entries()) {
    const end = start.clone().add(new THREE.Vector3(Math.sin(index) * 0.55, -2.8 - index * 0.18, Math.cos(index) * 0.35));
    const cable = cylinderBetween(start, end, 0.035, material);
    group.add(cable);

    const center = start.clone().add(end).multiplyScalar(0.5);
    const half = new THREE.Vector3(
      Math.abs(start.x - end.x) * 0.5 + 0.12,
      Math.abs(start.y - end.y) * 0.5 + 0.12,
      Math.abs(start.z - end.z) * 0.5 + 0.12
    );
    colliders.push({ id: `hanging-cable-${index + 1}`, center, halfSize: half, restitution: 0.18 });
  }
}

function createHoverBox(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(16, 4.4, 16);
  const material = new THREE.MeshBasicMaterial({
    color: 0x65d9ff,
    transparent: true,
    opacity: 0.08,
    wireframe: true
  });
  const box = new THREE.Mesh(geometry, material);
  box.position.set(0, 4.2, 12);
  box.name = 'hover-box-target';
  return box;
}

function createInflatableGate(index: number, radius: number): THREE.Mesh {
  const colors = [0x47d7ac, 0xffcf66, 0xff6b6b, 0x7fc8ff];
  const gate = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.17, 14, 64),
    new THREE.MeshStandardMaterial({
      color: colors[index % colors.length],
      roughness: 0.62,
      metalness: 0.02,
      emissive: colors[index % colors.length],
      emissiveIntensity: 0.08
    })
  );
  gate.castShadow = true;
  return gate;
}

function createPrecisionRing(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.TorusGeometry(2.25, 0.12, 12, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, emissive: 0x2bd4ff, emissiveIntensity: 0.2 })
  );
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = false;
  return mesh;
}

function makeVideoWallTexture(time: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  drawVideoWall(canvas, time);
  return texture;
}

function updateVideoWall(texture: THREE.CanvasTexture, time: number): void {
  drawVideoWall(texture.image as HTMLCanvasElement, time);
  texture.needsUpdate = true;
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
