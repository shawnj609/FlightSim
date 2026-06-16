import * as THREE from 'three';
import { type BlimpConfig } from '../../config/blimpConfig';
import { type AxisValues } from '../../sim/input';
import { type BlimpState } from '../../sim/physics';
import { type Craft } from './index';
import { Disposables, createDuctedFan, makeDecalTexture } from './shared';

type Fan = { group: THREE.Group; rotor: THREE.Group };

/** The RC stage blimp: a clean prolate envelope with a windowed gondola, cruciform tail,
 *  accent livery, and four ducted thrusters (two side, two lift). Nose points toward -Z. */
export function createBlimpCraft(config: BlimpConfig): Craft {
  const d = new Disposables();
  const group = new THREE.Group();
  group.name = 'craft-blimp';
  const body = new THREE.Group();
  group.add(body);

  // --- Envelope (hull) ---
  const hullGeo = d.track(new THREE.SphereGeometry(1, 56, 32));
  const hullMat = d.track(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f5f1,
      roughness: 0.34,
      metalness: 0.0,
      clearcoat: 0.45,
      clearcoatRoughness: 0.3,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xbfd0e0)
    })
  );
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  body.add(hull);

  // Accent stripe along the flank.
  const stripeGeo = d.track(new THREE.SphereGeometry(1.004, 56, 32, 0, Math.PI * 2, Math.PI * 0.46, Math.PI * 0.08));
  const stripeMat = d.track(new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.42, metalness: 0.05 }));
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  body.add(stripe);

  // --- Nose cap ---
  const noseGeo = d.track(new THREE.SphereGeometry(0.32, 24, 16));
  const noseMat = d.track(
    new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.3, metalness: 0.1, emissive: 0x3a0c0c, emissiveIntensity: 0.2 })
  );
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.castShadow = true;
  body.add(nose);

  // --- Gondola with window strip ---
  const gondolaGeo = d.track(new THREE.CapsuleGeometry(0.26, 1.1, 6, 14));
  const gondolaMat = d.track(new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.5, metalness: 0.2 }));
  const gondola = new THREE.Mesh(gondolaGeo, gondolaMat);
  gondola.rotation.x = Math.PI / 2;
  gondola.castShadow = true;
  body.add(gondola);

  const windowTex = d.track(
    makeDecalTexture((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c1116';
      ctx.fillRect(0, h * 0.3, w, h * 0.4);
      ctx.fillStyle = '#79d2ff';
      for (let i = 0; i < 6; i += 1) {
        ctx.globalAlpha = 0.85;
        ctx.fillRect(18 + i * 38, h * 0.36, 22, h * 0.28);
      }
      ctx.globalAlpha = 1;
    }, 256, 64)
  );
  const windowMat = d.track(
    new THREE.MeshStandardMaterial({ map: windowTex, transparent: true, emissive: 0x335577, emissiveIntensity: 0.4, roughness: 0.4 })
  );
  const windowsGeo = d.track(new THREE.PlaneGeometry(1.5, 0.34));
  for (const side of [1, -1]) {
    const win = new THREE.Mesh(windowsGeo, windowMat);
    win.position.set(side * 0.27, -0.02, 0);
    win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    gondola.add(win);
  }

  // --- Cruciform tail fins ---
  const finMat = d.track(new THREE.MeshStandardMaterial({ color: 0x39515f, roughness: 0.42, metalness: 0.1 }));
  const finGeo = d.track(new THREE.BoxGeometry(1, 1, 1));
  const fins: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i += 1) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.castShadow = true;
    fin.rotation.z = (i * Math.PI) / 2;
    body.add(fin);
    fins.push(fin);
  }

  // --- Thrusters ---
  const sideFans: Fan[] = [createDuctedFan(d, 0.38, 0x9fd8ff), createDuctedFan(d, 0.38, 0x9fd8ff)];
  sideFans[0].group.rotation.y = Math.PI / 2;
  sideFans[1].group.rotation.y = -Math.PI / 2;
  const liftFans: Fan[] = [createDuctedFan(d, 0.4, 0xffd27a), createDuctedFan(d, 0.4, 0xffd27a)];
  for (const fan of liftFans) {
    fan.group.rotation.x = Math.PI / 2;
  }
  for (const fan of [...sideFans, ...liftFans]) {
    body.add(fan.group);
  }

  applyDimensions(config, { hull, stripe, nose, gondola, fins, sideFans, liftFans });

  return {
    group,
    update: (state, controls, time, liveConfig) => {
      applyDimensions(liveConfig, { hull, stripe, nose, gondola, fins, sideFans, liftFans });
      group.position.copy(state.position);
      group.quaternion.copy(state.orientation);
      body.rotation.set(state.swing.x, 0, state.swing.z);

      const fwd = time * (16 + Math.abs(state.motors.forward) * 66);
      const lift = time * (16 + Math.abs(state.motors.vertical) * 74);
      const yawBias = controls.yaw * 10;
      sideFans[0].rotor.rotation.z = fwd + yawBias;
      sideFans[1].rotor.rotation.z = -fwd + yawBias;
      liftFans[0].rotor.rotation.z = lift;
      liftFans[1].rotor.rotation.z = -lift;
    },
    dispose: () => d.disposeAll()
  };
}

interface Parts {
  hull: THREE.Mesh;
  stripe: THREE.Mesh;
  nose: THREE.Mesh;
  gondola: THREE.Mesh;
  fins: THREE.Mesh[];
  sideFans: Fan[];
  liftFans: Fan[];
}

function applyDimensions(config: BlimpConfig, p: Parts): void {
  const halfLength = config.hullLength / 2;
  const halfWidth = config.hullWidth / 2;
  const hullY = config.hullHeight * 0.34;
  const fanScale = Math.max(0.95, config.hullWidth / 1.52);

  p.hull.scale.set(halfWidth, hullY, halfLength);
  p.stripe.scale.set(halfWidth, hullY, halfLength);
  p.nose.scale.set(halfWidth * 0.95, hullY * 0.95, 0.6);
  p.nose.position.set(0, 0, -halfLength - 0.05);

  p.gondola.scale.set(1, Math.min(1.3, config.hullLength * 0.16), 1);
  p.gondola.position.set(0, -hullY - 0.12, -config.hullLength * 0.04);

  // Cruciform tail: each fin is a thin tapered panel rotated around Z.
  for (const fin of p.fins) {
    fin.scale.set(0.07, config.hullHeight * 0.42, config.hullLength * 0.09);
    fin.position.set(0, 0, halfLength * 0.86);
  }

  p.sideFans[0].group.position.set(-halfWidth - 0.4, -0.16, -config.hullLength * 0.04);
  p.sideFans[1].group.position.set(halfWidth + 0.4, -0.16, -config.hullLength * 0.04);
  p.liftFans[0].group.position.set(-halfWidth * 0.42, hullY + 0.22, config.hullLength * 0.12);
  p.liftFans[1].group.position.set(halfWidth * 0.42, hullY + 0.22, config.hullLength * 0.12);
  for (const fan of [...p.sideFans, ...p.liftFans]) {
    fan.group.scale.setScalar(fanScale);
  }
}
