import * as THREE from 'three';
import { type AabbCollider } from '../../sim/collisions';
import { createCity, type City } from '../procedural/city';
import { type RingAnchor, type World, type WorldEnvironment } from './World';

/** Procedural city: a street grid of buildings with a canal and an avenue ring course. */
export class CityWorld implements World {
  readonly id = 'city' as const;
  readonly label = 'City';
  readonly group = new THREE.Group();
  readonly colliders: AabbCollider[];
  readonly spawn = new THREE.Vector3(0, 26, 120);
  readonly ringAnchors: RingAnchor[];
  readonly defaultCamera = 'follow' as const;
  readonly defaultWind = 0.7;
  readonly canRegenerate = true;
  readonly environment: WorldEnvironment = {
    background: new THREE.Color(0xaebfce),
    fog: { color: 0xc2cedd, near: 80, far: 380 },
    hemisphere: { sky: 0xdfe9f5, ground: 0x3a3d42, intensity: 1.1 },
    sun: { color: 0xfff1d8, intensity: 1.55, position: new THREE.Vector3(120, 170, 90) },
    shadowRadius: 90
  };

  private readonly city: City;
  private readonly sky: THREE.Mesh;

  constructor(seed: number) {
    this.group.name = 'city-world';
    this.city = createCity(seed);
    this.group.add(this.city.group);
    this.colliders = this.city.colliders;
    this.ringAnchors = this.city.ringAnchors;

    this.sky = createSkyDome();
    this.group.add(this.sky);
  }

  groundHeightAt(): number {
    return 0;
  }

  ceilingAt(): number {
    return 150;
  }

  isWaterAt(x: number, z: number): boolean {
    const w = this.city.water;
    return Math.abs(z - w.zCenter) <= w.halfWidth && Math.abs(x) <= w.xExtent;
  }

  update(): void {
    // City is static; window facades are baked.
  }

  dispose(): void {
    this.city.dispose();
    this.sky.geometry.dispose();
    const skyMat = this.sky.material as THREE.MeshBasicMaterial;
    skyMat.map?.dispose();
    skyMat.dispose();
    this.group.clear();
  }
}

function createSkyDome(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#5a83ad');
  gradient.addColorStop(0.6, '#9fb6cc');
  gradient.addColorStop(1, '#d7e0ea');
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
