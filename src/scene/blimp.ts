import * as THREE from 'three';
import { type BlimpConfig } from '../config/blimpConfig';
import { type AxisValues } from '../sim/input';
import { type BlimpState } from '../sim/physics';

export interface BlimpVisual {
  group: THREE.Group;
  update: (state: BlimpState, controls: AxisValues, time: number, config: BlimpConfig) => void;
}

export function createBlimpVisual(config: BlimpConfig): BlimpVisual {
  const group = new THREE.Group();
  group.name = 'rc-stage-blimp';

  const body = new THREE.Group();
  group.add(body);

  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 20),
    new THREE.MeshStandardMaterial({
      color: 0xf2f4f0,
      roughness: 0.45,
      metalness: 0.02
    })
  );
  hull.castShadow = true;
  body.add(hull);

  const belly = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2d363b, roughness: 0.48, metalness: 0.08 })
  );
  belly.castShadow = true;
  body.add(belly);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff5b5b, roughness: 0.35 })
  );
  body.add(stripe);

  const noseMarker = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.62, 24),
    new THREE.MeshStandardMaterial({ color: 0xff3030, roughness: 0.32, emissive: 0x441010, emissiveIntensity: 0.25 })
  );
  noseMarker.rotation.x = -Math.PI / 2;
  noseMarker.castShadow = true;
  body.add(noseMarker);

  const fins = addTailFins(body);

  const sideProps = [
    createPropeller(new THREE.Vector3(-1.05, -0.18, -0.18), 0x7fc8ff),
    createPropeller(new THREE.Vector3(1.05, -0.18, -0.18), 0x7fc8ff)
  ];
  sideProps[0].group.rotation.y = Math.PI / 2;
  sideProps[1].group.rotation.y = -Math.PI / 2;
  for (const prop of sideProps) {
    body.add(prop.group);
  }

  const liftProps = [
    createPropeller(new THREE.Vector3(-0.42, 0.6, 0.55), 0xffcf66),
    createPropeller(new THREE.Vector3(0.42, 0.6, 0.55), 0xffcf66)
  ];
  for (const prop of liftProps) {
    prop.group.rotation.x = Math.PI / 2;
    body.add(prop.group);
  }

  applyDimensions(config, hull, belly, stripe, noseMarker, fins, sideProps, liftProps);

  return {
    group,
    update: (state, controls, time, liveConfig) => {
      applyDimensions(liveConfig, hull, belly, stripe, noseMarker, fins, sideProps, liftProps);
      group.position.copy(state.position);
      group.quaternion.copy(state.orientation);
      body.rotation.set(state.swing.x, 0, state.swing.z);

      const forwardSpin = time * (18 + Math.abs(state.motors.forward) * 70);
      const verticalSpin = time * (18 + Math.abs(state.motors.vertical) * 80);
      const yawBias = controls.yaw * 12;

      sideProps[0].rotor.rotation.z = forwardSpin + yawBias;
      sideProps[1].rotor.rotation.z = -forwardSpin + yawBias;
      liftProps[0].rotor.rotation.z = verticalSpin;
      liftProps[1].rotor.rotation.z = -verticalSpin;
    }
  };
}

function addTailFins(body: THREE.Group): { vertical: THREE.Mesh; horizontal: THREE.Mesh } {
  const material = new THREE.MeshStandardMaterial({ color: 0x3e5966, roughness: 0.42, metalness: 0.08 });
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  vertical.castShadow = true;
  body.add(vertical);

  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  horizontal.castShadow = true;
  body.add(horizontal);

  return { vertical, horizontal };
}

function createPropeller(position: THREE.Vector3, color: number): { group: THREE.Group; rotor: THREE.Group } {
  const group = new THREE.Group();
  group.position.copy(position);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.12, 18),
    new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: 0.35, metalness: 0.25 })
  );
  hub.rotation.x = Math.PI / 2;
  group.add(hub);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.025, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x20282f, roughness: 0.45, metalness: 0.16 })
  );
  group.add(ring);

  const rotor = new THREE.Group();
  group.add(rotor);

  const bladeMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.04 });
  for (let i = 0; i < 2; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.026), bladeMaterial);
    blade.position.y = 0.18;
    blade.rotation.z = i * Math.PI;
    rotor.add(blade);
  }

  return { group, rotor };
}

function applyDimensions(
  config: BlimpConfig,
  hull: THREE.Mesh,
  belly: THREE.Mesh,
  stripe: THREE.Mesh,
  noseMarker: THREE.Mesh,
  fins: { vertical: THREE.Mesh; horizontal: THREE.Mesh },
  sideProps: { group: THREE.Group; rotor: THREE.Group }[],
  liftProps: { group: THREE.Group; rotor: THREE.Group }[]
): void {
  const halfLength = config.hullLength / 2;
  const halfWidth = config.hullWidth / 2;
  const hullY = config.hullHeight * 0.34;
  const propScale = Math.max(0.95, config.hullWidth / 1.52);

  hull.scale.set(halfWidth, hullY, halfLength);

  belly.scale.set(config.hullWidth * 0.42, 0.24, Math.min(1.45, config.hullLength * 0.18));
  belly.position.set(0, -hullY - 0.2, -config.hullLength * 0.04);

  stripe.scale.set(0.08, 0.035, config.hullLength * 0.82);
  stripe.position.set(0, hullY + 0.02, -config.hullLength * 0.04);

  noseMarker.position.set(0, 0, -halfLength - 0.22);

  fins.vertical.scale.set(0.08, config.hullHeight * 0.34, config.hullLength * 0.08);
  fins.vertical.position.set(0, hullY * 0.2, halfLength * 0.88);
  fins.horizontal.scale.set(config.hullWidth * 0.72, 0.08, config.hullLength * 0.075);
  fins.horizontal.position.set(0, -0.05, halfLength * 0.9);

  sideProps[0].group.position.set(-halfWidth - 0.42, -0.18, -config.hullLength * 0.05);
  sideProps[1].group.position.set(halfWidth + 0.42, -0.18, -config.hullLength * 0.05);
  sideProps[0].group.scale.setScalar(propScale);
  sideProps[1].group.scale.setScalar(propScale);

  liftProps[0].group.position.set(-halfWidth * 0.42, hullY + 0.24, config.hullLength * 0.12);
  liftProps[1].group.position.set(halfWidth * 0.42, hullY + 0.24, config.hullLength * 0.12);
  liftProps[0].group.scale.setScalar(propScale * 1.05);
  liftProps[1].group.scale.setScalar(propScale * 1.05);
}
