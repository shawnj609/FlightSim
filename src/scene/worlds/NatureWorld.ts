import * as THREE from 'three';
import { type AabbCollider } from '../../sim/collisions';
import { clamp } from '../../sim/math';
import { Rng } from '../../sim/rng';
import { Terrain } from '../procedural/terrain';
import { createScatter, type Scatter } from '../procedural/scatter';
import { type RingAnchor, type World, type WorldEnvironment } from './World';

/** Procedural outdoor wilderness: rolling hills, lakes, a river, trees, rocks, grass. */
export class NatureWorld implements World {
  readonly id = 'nature' as const;
  readonly label = 'Nature';
  readonly group = new THREE.Group();
  readonly colliders: AabbCollider[] = [];
  readonly spawn: THREE.Vector3;
  readonly ringAnchors: RingAnchor[];
  readonly defaultCamera = 'follow' as const;
  readonly defaultWind = 0.6;
  readonly canRegenerate = true;
  readonly environment: WorldEnvironment = {
    background: new THREE.Color(0x9ec6e6),
    fog: { color: 0xbcd7ec, near: 70, far: 360 },
    hemisphere: { sky: 0xcfe7ff, ground: 0x5b5230, intensity: 1.05 },
    sun: { color: 0xfff3da, intensity: 1.7, position: new THREE.Vector3(90, 150, 70) },
    shadowRadius: 80
  };

  private readonly terrain: Terrain;
  private readonly scatter: Scatter;
  private readonly sky: THREE.Mesh;

  constructor(seed: number) {
    this.group.name = 'nature-world';

    this.terrain = new Terrain({ seed });
    this.group.add(this.terrain.group);

    this.scatter = createScatter(this.terrain, seed);
    this.group.add(this.scatter.group);

    this.sky = createSkyDome();
    this.group.add(this.sky);

    const sx = 0;
    const sz = 70;
    this.spawn = new THREE.Vector3(sx, this.terrain.surfaceHeightAt(sx, sz) + 12, sz);
    this.ringAnchors = this.buildCourse(seed);
  }

  groundHeightAt(x: number, z: number): number {
    return this.terrain.surfaceHeightAt(x, z);
  }

  ceilingAt(): number {
    return 150;
  }

  isWaterAt(x: number, z: number): boolean {
    return this.terrain.isWaterAt(x, z);
  }

  update(time: number): void {
    this.terrain.update(time);
  }

  dispose(): void {
    this.terrain.dispose();
    this.scatter.dispose();
    this.sky.geometry.dispose();
    const skyMat = this.sky.material as THREE.MeshBasicMaterial;
    skyMat.map?.dispose();
    skyMat.dispose();
    this.group.clear();
  }

  private buildCourse(seed: number): RingAnchor[] {
    const rng = new Rng(seed ^ 0x5bd1e995);
    const anchors: RingAnchor[] = [];
    const limit = this.terrain.half - 30;
    let x = 0;
    let z = 50;
    let heading = -Math.PI / 2; // roughly toward -z to start
    for (let i = 0; i < 7; i += 1) {
      heading += rng.range(-0.7, 0.7);
      const stepLen = rng.range(34, 48);
      x = clamp(x + Math.cos(heading) * stepLen + Math.sin(heading) * rng.range(-10, 10), -limit, limit);
      z = clamp(z + Math.sin(heading) * stepLen, -limit, limit);
      const groundY = this.terrain.surfaceHeightAt(x, z);
      const y = groundY + rng.range(10, 20);
      anchors.push({ position: new THREE.Vector3(x, y, z), radius: 3 });
    }
    return anchors;
  }
}

function createSkyDome(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#3f7fc4');
  gradient.addColorStop(0.55, '#8fbfe6');
  gradient.addColorStop(1, '#dcecf6');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 16, 12),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.name = 'sky-dome';
  return sky;
}
