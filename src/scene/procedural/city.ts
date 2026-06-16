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

  // --- Buildings: split into low blocks and glass towers so window density
  //     stays believable instead of stretching on the tall ones. ---
  const rooftops: { x: number; z: number; top: number; w: number; d: number }[] = [];
  const addBuildings = (list: Building[], repeatY: number, glassy: boolean, idOffset: number): void => {
    if (!list.length) {
      return;
    }
    const tex = makeFacadeTexture(glassy);
    tex.repeat.set(2, repeatY);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const facadeMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xfff2c0,
      emissiveIntensity: glassy ? 0.32 : 0.2,
      roughness: glassy ? 0.32 : 0.72,
      metalness: glassy ? 0.55 : 0.12,
      envMapIntensity: glassy ? 1.1 : 0.5
    });
    const mesh = new THREE.InstancedMesh(boxGeo, facadeMat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const base = glassy ? 0.5 + b.shade * 0.3 : 0.55 + b.shade * 0.35;
      if (glassy) {
        tint.setRGB(base * 0.8, base * 0.9, base).offsetHSL(b.shade * 0.05, 0, 0);
      } else {
        tint.setRGB(base, base * 0.98, base * 0.92).offsetHSL(b.shade * 0.1 - 0.03, 0, 0);
      }
      mesh.setColorAt(i, tint);
      colliders.push({
        id: `building-${idOffset + i}`,
        center: new THREE.Vector3(b.x, b.h / 2, b.z),
        halfSize: new THREE.Vector3(b.w / 2, b.h / 2, b.d / 2),
        restitution: 0.12
      });
      rooftops.push({ x: b.x, z: b.z, top: b.h, w: b.w, d: b.d });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    disposers.push(() => {
      mesh.dispose();
      boxGeo.dispose();
      facadeMat.dispose();
      tex.dispose();
    });
  };

  const lowBlocks = buildings.filter((b) => b.h <= 40);
  const towers = buildings.filter((b) => b.h > 40);
  addBuildings(lowBlocks, 3, false, 0);
  addBuildings(towers, 7, true, lowBlocks.length);

  // --- Rooftop units (AC boxes / vents) for silhouette interest ---
  if (rooftops.length) {
    const roofGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b7178, roughness: 0.6, metalness: 0.4 });
    const units = new THREE.InstancedMesh(roofGeo, roofMat, rooftops.length);
    units.castShadow = true;
    rooftops.forEach((r, i) => {
      const uw = Math.min(r.w * 0.4, 4) * rng.range(0.5, 1);
      const ud = Math.min(r.d * 0.4, 4) * rng.range(0.5, 1);
      const uh = rng.range(0.8, 2.4);
      dummy.position.set(r.x + rng.range(-r.w * 0.2, r.w * 0.2), r.top + uh / 2, r.z + rng.range(-r.d * 0.2, r.d * 0.2));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(uw, uh, ud);
      dummy.updateMatrix();
      units.setMatrixAt(i, dummy.matrix);
    });
    units.instanceMatrix.needsUpdate = true;
    group.add(units);
    disposers.push(() => {
      units.dispose();
      roofGeo.dispose();
      roofMat.dispose();
    });
  }

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
      color: 0x1f5572,
      transparent: true,
      opacity: 0.84,
      roughness: 0.08,
      metalness: 0.2,
      envMapIntensity: 1.1,
      emissive: 0x081a28,
      emissiveIntensity: 0.25
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

function makeFacadeTexture(glassy: boolean): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Base wall with a subtle vertical gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (glassy) {
    grad.addColorStop(0, '#26323f');
    grad.addColorStop(1, '#3c4d5e');
  } else {
    grad.addColorStop(0, '#8b929c');
    grad.addColorStop(1, '#a7aeb8');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Window grid with mullions and spandrel bands between floors.
  const cols = glassy ? 6 : 5;
  const rows = 12;
  const margin = glassy ? 3 : 5;
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r += 1) {
    // Spandrel band (darker structural strip under each row of glass).
    ctx.fillStyle = glassy ? '#1c2630' : '#7c838d';
    ctx.fillRect(0, r * ch, w, margin);
    for (let c = 0; c < cols; c += 1) {
      const lit = Math.random() > (glassy ? 0.68 : 0.6);
      if (glassy) {
        ctx.fillStyle = lit ? '#fdf3cf' : `hsl(205, 45%, ${18 + Math.random() * 14}%)`;
      } else {
        ctx.fillStyle = lit ? '#fff6d6' : '#39434f';
      }
      ctx.fillRect(c * cw + margin, r * ch + margin, cw - margin * 2, ch - margin * 2);
    }
  }

  // Parapet / cornice at the very top.
  ctx.fillStyle = glassy ? '#161e26' : '#6a717b';
  ctx.fillRect(0, 0, w, glassy ? 6 : 9);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.repeat.set(2, 4);
  return tex;
}
