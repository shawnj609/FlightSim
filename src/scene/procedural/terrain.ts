import * as THREE from 'three';
import { clamp } from '../../sim/math';
import { ValueNoise2D } from './noise';

export interface TerrainOptions {
  seed: number;
  size?: number;
  segments?: number;
}

const palette = {
  sand: new THREE.Color(0xc8b487),
  grassLow: new THREE.Color(0x5c8c3a),
  grassHigh: new THREE.Color(0x3f6b2f),
  rock: new THREE.Color(0x6f6a60),
  peak: new THREE.Color(0xe6e9ec)
};

/**
 * Procedural rolling terrain with lakes (basins below the water line) and a winding
 * river carved through it. The analytic `heightAt` is the single source of truth used
 * by the mesh, collision sampling, and object scatter so everything lines up.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly water: THREE.Mesh;
  readonly group: THREE.Group;
  readonly size: number;
  readonly half: number;
  readonly waterLevel = 1.4;

  private readonly noise: ValueNoise2D;
  private readonly detail: ValueNoise2D;
  private readonly riverPhase: number;
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly waterNormal: THREE.DataTexture;

  constructor(options: TerrainOptions) {
    const size = options.size ?? 360;
    const segments = options.segments ?? 160;
    this.size = size;
    this.half = size / 2;
    this.noise = new ValueNoise2D(options.seed);
    this.detail = new ValueNoise2D(options.seed ^ 0x51ed270b);
    this.riverPhase = (options.seed % 1000) * 0.013;

    this.group = new THREE.Group();
    this.group.name = 'terrain';

    this.mesh = this.buildMesh(size, segments);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    this.waterNormal = makeWaterNormalMap(128);
    this.waterNormal.repeat.set(size / 14, size / 14);
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f5572,
      transparent: true,
      opacity: 0.86,
      roughness: 0.07,
      metalness: 0.15,
      envMapIntensity: 1.1,
      normalMap: this.waterNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      emissive: 0x081a28,
      emissiveIntensity: 0.25
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), this.waterMaterial);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.waterLevel;
    this.group.add(this.water);
  }

  /** Raw land height (can dip below the water line in basins and the river). */
  terrainHeightAt(x: number, z: number): number {
    let h = this.noise.fbm(x * 0.0065, z * 0.0065, 5) * 16;
    h += this.detail.fbm(x * 0.022, z * 0.022, 3) * 2.6;
    h += 2.5; // lift the mean so most ground sits above the water line
    return this.applyRiver(x, z, h);
  }

  /** True where standing water sits (lakes + river). */
  isWaterAt(x: number, z: number): boolean {
    return this.terrainHeightAt(x, z) < this.waterLevel;
  }

  /** Surface the blimp would rest on: water rests at the water line, land at the ground. */
  surfaceHeightAt(x: number, z: number): number {
    const terrain = this.terrainHeightAt(x, z);
    return terrain < this.waterLevel ? this.waterLevel : terrain;
  }

  /** Approximate upward slope (0 flat, 1 steep) via finite differences. */
  slopeAt(x: number, z: number): number {
    const d = 1.5;
    const hx = this.terrainHeightAt(x + d, z) - this.terrainHeightAt(x - d, z);
    const hz = this.terrainHeightAt(x, z + d) - this.terrainHeightAt(x, z - d);
    const grad = Math.hypot(hx, hz) / (2 * d);
    return clamp(grad, 0, 1);
  }

  update(time: number): void {
    // Scroll two layers of the ripple normal map for a living surface; gentle bob.
    this.waterNormal.offset.set(time * 0.018, time * 0.013);
    this.waterMaterial.emissiveIntensity = 0.22 + Math.sin(time * 0.8) * 0.06;
    this.water.position.y = this.waterLevel + Math.sin(time * 0.6) * 0.03;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.water.geometry.dispose();
    this.waterMaterial.dispose();
    this.waterNormal.dispose();
  }

  private applyRiver(x: number, z: number, h: number): number {
    const centerX = 46 * Math.sin(z * 0.016 + this.riverPhase) + 20 * Math.sin(z * 0.041 + this.riverPhase * 2);
    const dist = Math.abs(x - centerX);
    const halfWidth = 7;
    const bank = 18;
    // influence: 1 at the centerline, easing to 0 beyond the bank.
    const t = clamp((dist - halfWidth) / bank, 0, 1);
    const influence = 1 - t * t * (3 - 2 * t);
    if (influence <= 0) {
      return h;
    }
    const bed = this.waterLevel - 2.6;
    return h + (Math.min(h, bed) - h) * influence;
  }

  private buildMesh(size: number, segments: number): THREE.Mesh {
    const half = size / 2;
    const step = size / segments;
    const cols = segments + 1;
    const vertexCount = cols * cols;

    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const color = new THREE.Color();

    for (let iz = 0; iz < cols; iz += 1) {
      const z = -half + iz * step;
      for (let ix = 0; ix < cols; ix += 1) {
        const x = -half + ix * step;
        const h = this.terrainHeightAt(x, z);
        const index = (iz * cols + ix) * 3;
        positions[index] = x;
        positions[index + 1] = h;
        positions[index + 2] = z;

        this.colorFor(h, this.slopeAt(x, z), color);
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
      }
    }

    const indices: number[] = [];
    for (let iz = 0; iz < segments; iz += 1) {
      for (let ix = 0; ix < segments; ix += 1) {
        const a = iz * cols + ix;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'terrain-surface';
    return mesh;
  }

  private colorFor(height: number, slope: number, out: THREE.Color): void {
    if (height < this.waterLevel + 0.6) {
      out.copy(palette.sand);
    } else if (height < 7) {
      out.copy(palette.grassLow).lerp(palette.grassHigh, clamp((height - this.waterLevel) / 6, 0, 1));
    } else if (height < 13) {
      out.copy(palette.grassHigh).lerp(palette.rock, clamp((height - 7) / 6, 0, 1));
    } else {
      out.copy(palette.rock).lerp(palette.peak, clamp((height - 13) / 6, 0, 1));
    }
    // Steep faces read as exposed rock regardless of altitude.
    if (slope > 0.45) {
      out.lerp(palette.rock, clamp((slope - 0.45) / 0.4, 0, 1));
    }
  }
}

/** A seamless, tileable ripple normal map for the water surface (no external assets). */
function makeWaterNormalMap(size: number): THREE.DataTexture {
  const TAU = Math.PI * 2;
  const wave = (x: number, y: number): number =>
    Math.sin((TAU * (3 * x + 2 * y)) / size) * 0.5 +
    Math.sin((TAU * (2 * x - 4 * y)) / size) * 0.4 +
    Math.sin((TAU * (5 * x + 1 * y)) / size) * 0.25;

  const data = new Uint8Array(size * size * 4);
  const m = (n: number) => ((n % size) + size) % size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = wave(m(x - 1), y) - wave(m(x + 1), y);
      const ny = wave(x, m(y - 1)) - wave(x, m(y + 1));
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
