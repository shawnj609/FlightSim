import * as THREE from 'three';
import { type Vector3 } from 'three';

/**
 * In-world depth cues: a vertical drop-line from the blimp to a reticle on the ground
 * directly beneath it. Makes altitude, ground position, and lateral drift readable at a
 * glance — the things a 2D screenshot of a 3D scene can't otherwise convey. Toggleable.
 */
export class PilotAids {
  readonly group = new THREE.Group();
  private readonly line: THREE.Mesh;
  private readonly reticle: THREE.Mesh;
  private readonly dot: THREE.Mesh;
  private readonly lineMat: THREE.MeshBasicMaterial;
  private readonly reticleMat: THREE.MeshBasicMaterial;

  constructor() {
    this.group.name = 'pilot-aids';

    this.lineMat = new THREE.MeshBasicMaterial({ color: 0x65d9ff, transparent: true, opacity: 0.34, depthWrite: false });
    this.line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), this.lineMat);
    this.group.add(this.line);

    this.reticleMat = new THREE.MeshBasicMaterial({ color: 0x65d9ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32), this.reticleMat);
    this.reticle.rotation.x = -Math.PI / 2;
    this.group.add(this.reticle);

    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), this.reticleMat);
    this.dot.rotation.x = -Math.PI / 2;
    this.group.add(this.dot);
  }

  update(blimpPosition: Vector3, groundY: number): void {
    if (!this.group.visible) {
      return;
    }
    const height = Math.max(0.1, blimpPosition.y - groundY);
    this.line.position.set(blimpPosition.x, groundY + height / 2, blimpPosition.z);
    this.line.scale.y = height;
    this.reticle.position.set(blimpPosition.x, groundY + 0.06, blimpPosition.z);
    this.dot.position.set(blimpPosition.x, groundY + 0.07, blimpPosition.z);
    // Fade the line in with altitude so a grounded craft isn't cluttered.
    this.lineMat.opacity = Math.min(0.34, 0.06 + height * 0.04);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.line.geometry.dispose();
    this.reticle.geometry.dispose();
    this.dot.geometry.dispose();
    this.lineMat.dispose();
    this.reticleMat.dispose();
  }
}
