import * as THREE from 'three';
import { Rng } from '../../sim/rng';
import { type Terrain } from './terrain';

export interface Scatter {
  group: THREE.Group;
  dispose(): void;
}

interface Placement {
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * Scatters trees (conifer + broadleaf), rocks, and grass tufts across the terrain
 * using instanced meshes — a handful of draw calls for thousands of objects.
 */
export function createScatter(terrain: Terrain, seed: number): Scatter {
  const rng = new Rng(seed ^ 0x2f9a3b17);
  const group = new THREE.Group();
  group.name = 'scatter';

  const pad = 14;
  const limit = terrain.half - pad;

  const conifers: Placement[] = [];
  const broadleaf: Placement[] = [];
  const rocks: Placement[] = [];
  const grass: Placement[] = [];

  const sample = () => {
    const x = rng.range(-limit, limit);
    const z = rng.range(-limit, limit);
    return { x, z, y: terrain.terrainHeightAt(x, z), slope: terrain.slopeAt(x, z) };
  };

  // Trees: grassy, gentle ground, above the shoreline.
  for (let i = 0; i < 1600; i += 1) {
    const s = sample();
    if (s.y < terrain.waterLevel + 1.1 || s.slope > 0.4 || s.y > 14) {
      continue;
    }
    const place: Placement = { x: s.x, z: s.z, y: s.y, scale: rng.range(0.8, 1.8), yaw: rng.range(0, Math.PI * 2) };
    if (rng.chance(0.6)) {
      conifers.push(place);
    } else {
      broadleaf.push(place);
    }
  }

  // Rocks: anywhere on land, favouring slopes; allowed near the shore.
  for (let i = 0; i < 520; i += 1) {
    const s = sample();
    if (s.y < terrain.waterLevel - 0.4) {
      continue;
    }
    if (s.slope < 0.25 && !rng.chance(0.4)) {
      continue;
    }
    rocks.push({ x: s.x, z: s.z, y: s.y, scale: rng.range(0.4, 1.9), yaw: rng.range(0, Math.PI * 2) });
  }

  // Grass tufts: flat grassy ground only.
  for (let i = 0; i < 2600; i += 1) {
    const s = sample();
    if (s.y < terrain.waterLevel + 0.6 || s.slope > 0.32 || s.y > 11) {
      continue;
    }
    grass.push({ x: s.x, z: s.z, y: s.y, scale: rng.range(0.6, 1.4), yaw: rng.range(0, Math.PI * 2) });
  }

  const disposers: Array<() => void> = [];

  // --- Trunks (shared by both tree types) ---
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4631, roughness: 0.9 });
  const allTrees = [...conifers, ...broadleaf];
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, allTrees.length || 1);
  trunks.castShadow = true;
  allTrees.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(p.scale * 0.7, p.scale * 2.4, p.scale * 0.7);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  if (allTrees.length) {
    group.add(trunks);
  }
  disposers.push(() => {
    trunks.dispose();
    trunkGeo.dispose();
    trunkMat.dispose();
  });

  // --- Conifer canopies (cones) ---
  if (conifers.length) {
    const geo = new THREE.ConeGeometry(1, 2.6, 7);
    geo.translate(0, 1.3, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: false });
    const mesh = new THREE.InstancedMesh(geo, mat, conifers.length);
    mesh.castShadow = true;
    conifers.forEach((p, i) => {
      dummy.position.set(p.x, p.y + p.scale * 1.5, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(p.scale * 1.5, p.scale * 1.9, p.scale * 1.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.32, 0.5, 0.22 + (i % 5) * 0.02);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    disposers.push(() => {
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    });
  }

  // --- Broadleaf canopies (rounded) ---
  if (broadleaf.length) {
    const geo = new THREE.IcosahedronGeometry(1.2, 1);
    geo.translate(0, 1.2, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82 });
    const mesh = new THREE.InstancedMesh(geo, mat, broadleaf.length);
    mesh.castShadow = true;
    broadleaf.forEach((p, i) => {
      dummy.position.set(p.x, p.y + p.scale * 1.3, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.setScalar(p.scale * 1.45);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.28, 0.45, 0.3 + (i % 4) * 0.03);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    disposers.push(() => {
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    });
  }

  // --- Rocks ---
  if (rocks.length) {
    const geo = new THREE.DodecahedronGeometry(0.7, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6e6960, roughness: 0.95, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, rocks.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rocks.forEach((p, i) => {
      dummy.position.set(p.x, p.y + p.scale * 0.25, p.z);
      dummy.rotation.set(rng.range(0, 0.6), p.yaw, rng.range(0, 0.6));
      dummy.scale.set(p.scale, p.scale * rng.range(0.6, 1), p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    disposers.push(() => {
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    });
  }

  // --- Grass tufts (crossed quads) ---
  if (grass.length) {
    const geo = makeTuftGeometry();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6fae42,
      roughness: 1,
      side: THREE.DoubleSide,
      alphaTest: 0.1
    });
    const mesh = new THREE.InstancedMesh(geo, mat, grass.length);
    grass.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(p.scale, p.scale * rng.range(0.8, 1.4), p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.27, 0.5, 0.34 + (i % 5) * 0.02);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    disposers.push(() => {
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    });
  }

  return {
    group,
    dispose() {
      for (const dispose of disposers) {
        dispose();
      }
    }
  };
}

function makeTuftGeometry(): THREE.BufferGeometry {
  const blade = new THREE.PlaneGeometry(0.7, 0.7);
  blade.translate(0, 0.35, 0);
  const second = blade.clone();
  second.rotateY(Math.PI / 2);
  const merged = mergePlanes(blade, second);
  blade.dispose();
  second.dispose();
  return merged;
}

/** Minimal two-geometry merge so we don't pull in BufferGeometryUtils. */
function mergePlanes(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  const ap = a.getAttribute('position') as THREE.BufferAttribute;
  const bp = b.getAttribute('position') as THREE.BufferAttribute;
  const an = a.getAttribute('normal') as THREE.BufferAttribute;
  const bn = b.getAttribute('normal') as THREE.BufferAttribute;
  const positions = new Float32Array(ap.count * 3 + bp.count * 3);
  const normals = new Float32Array(an.count * 3 + bn.count * 3);
  positions.set(ap.array as Float32Array, 0);
  positions.set(bp.array as Float32Array, ap.count * 3);
  normals.set(an.array as Float32Array, 0);
  normals.set(bn.array as Float32Array, an.count * 3);
  result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const indexA = a.getIndex();
  const indexB = b.getIndex();
  if (indexA && indexB) {
    const offset = ap.count;
    const indices: number[] = [];
    for (let i = 0; i < indexA.count; i += 1) {
      indices.push(indexA.getX(i));
    }
    for (let i = 0; i < indexB.count; i += 1) {
      indices.push(indexB.getX(i) + offset);
    }
    result.setIndex(indices);
  }
  return result;
}
