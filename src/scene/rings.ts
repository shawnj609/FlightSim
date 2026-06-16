import * as THREE from 'three';
import { type RingAnchor } from '../sim/missionTypes';

type RingState = 'upcoming' | 'next' | 'cleared';

interface RingVisual {
  group: THREE.Group;
  torusMat: THREE.MeshStandardMaterial;
  discMat: THREE.MeshBasicMaterial;
  arrow: THREE.Mesh;
  anchor: RingAnchor;
  baseScale: number;
}

const stateColors: Record<RingState, { color: number; emissive: number; intensity: number; disc: number; discOpacity: number }> = {
  upcoming: { color: 0x7fc8ff, emissive: 0x1d3a52, intensity: 0.25, disc: 0x7fc8ff, discOpacity: 0.05 },
  next: { color: 0xffd24a, emissive: 0xffb020, intensity: 1.0, disc: 0xffd24a, discOpacity: 0.16 },
  cleared: { color: 0x47d7ac, emissive: 0x12513c, intensity: 0.3, disc: 0x47d7ac, discOpacity: 0.04 }
};

/**
 * A sequence of pass-through rings with live visual state: the next ring glows and
 * shows a bobbing arrow, cleared rings turn green, upcoming rings stay neutral.
 * Reused by the indoor Ring Run and the outdoor free-flight course.
 */
export class RingCourse {
  readonly group = new THREE.Group();
  readonly count: number;
  private readonly rings: RingVisual[] = [];

  constructor(anchors: RingAnchor[]) {
    this.group.name = 'ring-course';
    this.count = anchors.length;

    anchors.forEach((anchor, index) => {
      const next = anchors[index + 1]?.position;
      const prev = anchors[index - 1]?.position;
      const visual = createRing(anchor);
      orientRing(visual.group, anchor.position, prev, next);
      this.rings.push(visual);
      this.group.add(visual.group);
    });

    this.setActiveIndex(0);
  }

  /** Mark rings before `index` as cleared, `index` as next, the rest upcoming. */
  setActiveIndex(index: number): void {
    this.rings.forEach((ring, i) => {
      const state: RingState = i < index ? 'cleared' : i === index ? 'next' : 'upcoming';
      applyState(ring, state);
    });
  }

  /** Mark all rings cleared (course finished). */
  clearAll(): void {
    this.rings.forEach((ring) => applyState(ring, 'cleared'));
  }

  update(time: number): void {
    for (const ring of this.rings) {
      if (ring.arrow.visible) {
        const pulse = 1 + Math.sin(time * 3) * 0.06;
        ring.group.scale.setScalar(ring.baseScale * pulse);
        ring.arrow.position.y = ring.anchor.radius + 1.1 + Math.sin(time * 3) * 0.18;
        ring.torusMat.emissiveIntensity = 0.8 + Math.sin(time * 4) * 0.25;
      }
    }
  }

  dispose(): void {
    for (const ring of this.rings) {
      ring.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
      ring.torusMat.dispose();
      ring.discMat.dispose();
      (ring.arrow.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}

function createRing(anchor: RingAnchor): RingVisual {
  const group = new THREE.Group();
  group.position.copy(anchor.position);

  const torusMat = new THREE.MeshStandardMaterial({ color: 0x7fc8ff, roughness: 0.5, metalness: 0.05 });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(anchor.radius, 0.16, 14, 48), torusMat);
  torus.castShadow = true;
  group.add(torus);

  const discMat = new THREE.MeshBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(anchor.radius * 0.96, 32), discMat);
  group.add(disc);

  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffb020, emissiveIntensity: 0.9 });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 16), arrowMat);
  arrow.rotation.x = Math.PI; // point down toward the ring
  arrow.position.y = anchor.radius + 1.1;
  group.add(arrow);

  return { group, torusMat, discMat, arrow, anchor, baseScale: 1 };
}

function orientRing(group: THREE.Group, pos: THREE.Vector3, prev?: THREE.Vector3, next?: THREE.Vector3): void {
  const tangent = new THREE.Vector3();
  if (next && prev) {
    tangent.copy(next).sub(prev);
  } else if (next) {
    tangent.copy(next).sub(pos);
  } else if (prev) {
    tangent.copy(pos).sub(prev);
  } else {
    tangent.set(0, 0, -1);
  }
  tangent.y *= 0.4; // keep rings closer to upright so they're easy to fly through
  if (tangent.lengthSq() < 1e-4) {
    tangent.set(0, 0, -1);
  }
  tangent.normalize();
  // Torus hole axis is local +Z; aim it along the course tangent.
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
}

function applyState(ring: RingVisual, state: RingState): void {
  const c = stateColors[state];
  ring.torusMat.color.setHex(c.color);
  ring.torusMat.emissive.setHex(c.emissive);
  ring.torusMat.emissiveIntensity = c.intensity;
  ring.discMat.color.setHex(c.disc);
  ring.discMat.opacity = c.discOpacity;
  ring.arrow.visible = state === 'next';
  if (state !== 'next') {
    ring.group.scale.setScalar(ring.baseScale);
  }
}
