import * as THREE from 'three';
import { type BeaconSpec, type GroundRingSpec, type StationBoxSpec } from '../sim/missionTypes';

/** A floating glowing target with a halo ring and a beam down to the ground. */
export class Beacon {
  readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private readonly coreMat: THREE.MeshStandardMaterial;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly beamMat: THREE.MeshBasicMaterial;

  constructor() {
    this.group.name = 'beacon';
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffb020, emissiveIntensity: 1.1 });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), this.coreMat);
    this.group.add(this.core);

    this.haloMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 32), this.haloMat);
    this.halo.rotation.x = Math.PI / 2;
    this.group.add(this.halo);

    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.16, depthWrite: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8), this.beamMat);
    this.group.add(this.beam);

    this.group.visible = false;
  }

  sync(spec: BeaconSpec | undefined, groundY: number, time: number): void {
    if (!spec) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.copy(spec.position);
    const color = spec.color ?? 0xffd24a;
    this.coreMat.color.setHex(color);
    this.haloMat.color.setHex(color);
    this.beamMat.color.setHex(color);

    this.core.rotation.y = time * 1.5;
    this.core.position.y = Math.sin(time * 2) * 0.18;
    this.halo.scale.setScalar(1 + Math.sin(time * 2) * 0.08);

    // Beam from the beacon down to the ground beneath it.
    const height = Math.max(0.2, spec.position.y - groundY);
    this.beam.scale.y = height;
    this.beam.position.y = -height / 2;
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.halo.geometry.dispose();
    this.beam.geometry.dispose();
    this.coreMat.dispose();
    this.haloMat.dispose();
    this.beamMat.dispose();
  }
}

/** A flat ring drawn on the ground for landing targets. */
export class GroundRing {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly fill: THREE.Mesh;
  private readonly ringMat: THREE.MeshStandardMaterial;
  private readonly fillMat: THREE.MeshBasicMaterial;
  private currentRadius = 1.5;

  constructor() {
    this.group.name = 'ground-ring';
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0x55d6a9, emissive: 0x176b4f, emissiveIntensity: 0.6 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 10, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.ring);

    this.fillMat = new THREE.MeshBasicMaterial({ color: 0x55d6a9, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    this.fill = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), this.fillMat);
    this.fill.rotation.x = -Math.PI / 2;
    this.group.add(this.fill);

    this.group.visible = false;
  }

  sync(spec: GroundRingSpec | undefined, time: number): void {
    if (!spec) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.copy(spec.position);
    this.group.position.y += 0.08;
    const color = spec.color ?? 0x55d6a9;
    this.ringMat.color.setHex(color);
    this.fillMat.color.setHex(color);
    if (Math.abs(spec.radius - this.currentRadius) > 0.001) {
      const scale = spec.radius / 1.5;
      this.ring.scale.set(scale, scale, 1);
      this.fill.scale.set(scale, scale, 1);
      this.currentRadius = spec.radius;
    }
    this.ringMat.emissiveIntensity = 0.5 + Math.sin(time * 3) * 0.2;
  }

  dispose(): void {
    this.ring.geometry.dispose();
    this.fill.geometry.dispose();
    this.ringMat.dispose();
    this.fillMat.dispose();
  }
}

/** A translucent wireframe box for hold/station-keeping zones. */
export class StationBox {
  readonly group = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly edges: THREE.LineSegments;
  private readonly fillMat: THREE.MeshBasicMaterial;
  private readonly edgeMat: THREE.LineBasicMaterial;
  private readonly geometry: THREE.BoxGeometry;
  private readonly edgeGeometry: THREE.EdgesGeometry;

  constructor() {
    this.group.name = 'station-box';
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0x65d9ff, transparent: true, opacity: 0.07, depthWrite: false });
    this.fill = new THREE.Mesh(this.geometry, this.fillMat);
    this.group.add(this.fill);

    this.edgeGeometry = new THREE.EdgesGeometry(this.geometry);
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x65d9ff, transparent: true, opacity: 0.6 });
    this.edges = new THREE.LineSegments(this.edgeGeometry, this.edgeMat);
    this.group.add(this.edges);

    this.group.visible = false;
  }

  sync(spec: StationBoxSpec | undefined): void {
    if (!spec) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.copy(spec.center);
    this.group.scale.set(spec.halfSize.x * 2, spec.halfSize.y * 2, spec.halfSize.z * 2);
    const color = spec.color ?? 0x65d9ff;
    this.fillMat.color.setHex(color);
    this.edgeMat.color.setHex(color);
  }

  dispose(): void {
    this.geometry.dispose();
    this.edgeGeometry.dispose();
    this.fillMat.dispose();
    this.edgeMat.dispose();
  }
}
