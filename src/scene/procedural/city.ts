import * as THREE from 'three';
import { Rng } from '../../sim/rng';
import { type AabbCollider } from '../../sim/collisions';

export interface City {
  group: THREE.Group;
  colliders: AabbCollider[];
  ringAnchors: { position: THREE.Vector3; radius: number }[];
  water: { zCenter: number; halfWidth: number; xExtent: number };
  dispose(): void;
}

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  shade: number;
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * A stylised procedural city: a street grid of instanced buildings with window
 * facades, a few parks and a canal. Buildings become AABB colliders so the blimp
 * can bump them; a ring course weaves down the avenues.
 */
export function createCity(seed: number): City {
  const rng = new Rng(seed ^ 0x71c3a5d9);
  const group = new THREE.Group();
  group.name = 'city';
  const colliders: AabbCollider[] = [];
  const disposers: Array<() => void> = [];

  const grid = 8;
  const pitch = 36;
  const span = grid * pitch;
  const half = span / 2;

  // --- Ground with a road grid ---
  const roadTex = makeRoadTexture(grid);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span + pitch, span + pitch),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  disposers.push(() => {
    ground.geometry.dispose();
    (ground.material as THREE.MeshStandardMaterial).map?.dispose();
    (ground.material as THREE.Material).dispose();
  });

  // --- Decide block contents ---
  const buildings: Building[] = [];
  const parks: { x: number; z: number }[] = [];
  for (let gx = 0; gx < grid; gx += 1) {
    for (let gz = 0; gz < grid; gz += 1) {
      const cx = -half + pitch / 2 + gx * pitch;
      const cz = -half + pitch / 2 + gz * pitch;
      if (rng.chance(0.12)) {
        parks.push({ x: cx, z: cz });
        continue;
      }
      const clusters = rng.int(1, 2);
      for (let c = 0; c < clusters; c += 1) {
        const w = rng.range(9, clusters === 1 ? 22 : 12);
        const d = rng.range(9, clusters === 1 ? 22 : 12);
        const tall = rng.chance(0.18);
        const h = tall ? rng.range(45, 78) : rng.range(12, 38);
        const jitterX = rng.range(-5, 5) + (clusters === 2 ? (c === 0 ? -6 : 6) : 0);
        const jitterZ = rng.range(-5, 5);
        buildings.push({ x: cx + jitterX, z: cz + jitterZ, w, d, h, shade: rng.next() });
      }
    }
  }

  // --- Buildings (instanced box with a shared window facade) ---
  const facadeTex = makeFacadeTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const facadeMat = new THREE.MeshStandardMaterial({
    map: facadeTex,
    emissiveMap: facadeTex,
    emissive: 0xfff2c0,
    emissiveIntensity: 0.22,
    roughness: 0.74,
    metalness: 0.08
  });
  const mesh = new THREE.InstancedMesh(boxGeo, facadeMat, buildings.length || 1);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  buildings.forEach((b, i) => {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const base = 0.55 + b.shade * 0.35;
    tint.setRGB(base, base * 0.98, base * 0.92).offsetHSL(b.shade * 0.1 - 0.03, 0, 0);
    mesh.setColorAt(i, tint);
    colliders.push({
      id: `building-${i}`,
      center: new THREE.Vector3(b.x, b.h / 2, b.z),
      halfSize: new THREE.Vector3(b.w / 2, b.h / 2, b.d / 2),
      restitution: 0.12
    });
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  if (buildings.length) {
    group.add(mesh);
  }
  disposers.push(() => {
    mesh.dispose();
    boxGeo.dispose();
    facadeMat.dispose();
    facadeTex.dispose();
  });

  // --- Parks (green pads with a few trees) ---
  if (parks.length) {
    const padGeo = new THREE.PlaneGeometry(pitch - 8, pitch - 8);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4f7c34, roughness: 0.95 });
    const treeGeo = new THREE.ConeGeometry(1.6, 5, 7);
    treeGeo.translate(0, 2.5, 0);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f5d27, roughness: 0.85 });
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, parks.length * 4);
    trees.castShadow = true;
    let t = 0;
    for (const park of parks) {
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(park.x, 0.05, park.z);
      pad.receiveShadow = true;
      group.add(pad);
      for (let k = 0; k < 4; k += 1) {
        dummy.position.set(park.x + rng.range(-9, 9), 0, park.z + rng.range(-9, 9));
        dummy.rotation.set(0, rng.range(0, 6.28), 0);
        dummy.scale.setScalar(rng.range(0.8, 1.5));
        dummy.updateMatrix();
        trees.setMatrixAt(t, dummy.matrix);
        t += 1;
      }
    }
    trees.instanceMatrix.needsUpdate = true;
    group.add(trees);
    disposers.push(() => {
      trees.dispose();
      padGeo.dispose();
      padMat.dispose();
      treeGeo.dispose();
      treeMat.dispose();
    });
  }

  // --- Canal across town ---
  const canal = new THREE.Mesh(
    new THREE.PlaneGeometry(span + pitch, 16),
    new THREE.MeshStandardMaterial({
      color: 0x2b6f8f,
      transparent: true,
      opacity: 0.8,
      roughness: 0.2,
      emissive: 0x0a2030,
      emissiveIntensity: 0.3
    })
  );
  canal.rotation.x = -Math.PI / 2;
  const canalZ = rng.range(-half * 0.4, half * 0.4);
  canal.position.set(0, 0.08, canalZ);
  group.add(canal);
  disposers.push(() => {
    canal.geometry.dispose();
    (canal.material as THREE.Material).dispose();
  });

  // --- Ring course weaving down an avenue at mid-height ---
  const ringAnchors: { position: THREE.Vector3; radius: number }[] = [];
  const lane = -half + pitch / 2 + rng.int(1, grid - 2) * pitch + pitch / 2;
  for (let i = 0; i < 6; i += 1) {
    const z = -half + 20 + (i / 5) * (span - 40);
    const x = lane + Math.sin(i * 1.1) * 8;
    const y = 16 + Math.sin(i * 0.9) * 8;
    ringAnchors.push({ position: new THREE.Vector3(x, y, z), radius: 3 });
  }

  return {
    group,
    colliders,
    ringAnchors,
    water: { zCenter: canalZ, halfWidth: 8, xExtent: (span + pitch) / 2 },
    dispose() {
      for (const dispose of disposers) {
        dispose();
      }
    }
  };
}

function makeRoadTexture(grid: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(0, 0, 512, 512);
  const cell = 512 / grid;
  ctx.fillStyle = '#2b2f34';
  const blockInset = cell * 0.16;
  for (let x = 0; x < grid; x += 1) {
    for (let z = 0; z < grid; z += 1) {
      ctx.fillRect(x * cell + blockInset, z * cell + blockInset, cell - blockInset * 2, cell - blockInset * 2);
    }
  }
  // Lane dashes on the avenues.
  ctx.strokeStyle = '#d9c873';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  for (let i = 1; i < grid; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, 512);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(512, i * cell);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#9aa1ab';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 128; y += 12) {
    for (let x = 6; x < 64; x += 12) {
      const lit = Math.random() > 0.55;
      ctx.fillStyle = lit ? '#fff6d6' : '#3a4452';
      ctx.fillRect(x, y, 7, 7);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  return tex;
}
