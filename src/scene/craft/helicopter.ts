import * as THREE from 'three';
import { type BlimpConfig } from '../../config/blimpConfig';
import { type Craft } from './index';
import { Disposables, makeDecalTexture } from './shared';
import { clamp } from '../../sim/math';

const DESIGN_LENGTH = 9.14; // built around the default hull length; scaled uniformly.

// Livery colours (linear-ish RGB for vertex colouring).
const NAVY: [number, number, number] = [0.05, 0.08, 0.17];
const WHITE: [number, number, number] = [0.92, 0.94, 0.97];
const GOLD: [number, number, number] = [0.84, 0.68, 0.27];

/**
 * An LAPD Air Support light helicopter (AS350/H125 silhouette). The fuselage is lofted
 * from cross-sections — a bulbous glass-nosed cockpit tapering into a slim up-swept tail
 * boom — with the navy-over-white livery and gold cheatline painted via vertex colours so
 * it follows the hull. Three-blade main rotor, tail rotor, and tubular skids complete it.
 * Flies the identical blimp physics; nose points toward -Z.
 */
export function createHelicopterCraft(config: BlimpConfig): Craft {
  const d = new Disposables();
  const group = new THREE.Group();
  group.name = 'craft-helicopter';
  const body = new THREE.Group();
  group.add(body);

  const navyMat = d.track(new THREE.MeshStandardMaterial({ color: 0x141d33, roughness: 0.45, metalness: 0.3, envMapIntensity: 1.0 }));
  const metal = d.track(new THREE.MeshStandardMaterial({ color: 0x2b3037, roughness: 0.4, metalness: 0.78 }));
  const dark = d.track(new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.45, metalness: 0.5 }));
  const glass = d.track(
    new THREE.MeshStandardMaterial({ color: 0x0a1220, roughness: 0.05, metalness: 0.25, envMapIntensity: 2.0, transparent: true, opacity: 0.92 })
  );

  // --- Lofted fuselage with painted livery ---
  const hullGeo = d.track(buildFuselage());
  const hullMat = d.track(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.22, envMapIntensity: 1.0, side: THREE.DoubleSide })
  );
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  body.add(hull);

  // --- Glass cockpit bubble over the nose ---
  const canopyGeo = d.track(new THREE.SphereGeometry(1, 30, 24));
  const canopy = new THREE.Mesh(canopyGeo, glass);
  canopy.scale.set(1.14, 1.04, 1.55);
  canopy.position.set(0, 0.12, -1.95);
  body.add(canopy);
  // Window frame posts.
  const postGeo = d.track(new THREE.BoxGeometry(0.05, 1.3, 0.05));
  for (const x of [-0.5, 0.5]) {
    const post = new THREE.Mesh(postGeo, navyMat);
    post.position.set(x, 0.1, -2.0);
    post.rotation.x = 0.2;
    body.add(post);
  }

  // --- Engine intake fairing behind the mast ---
  const intakeGeo = d.track(new THREE.SphereGeometry(1, 18, 14));
  const intake = new THREE.Mesh(intakeGeo, navyMat);
  intake.scale.set(0.5, 0.4, 0.8);
  intake.position.set(0, 1.18, 0.55);
  body.add(intake);

  // --- Vertical fin (swept) + horizontal stabilisers ---
  const finGeo = d.track(new THREE.BoxGeometry(0.09, 1.0, 0.85));
  const fin = new THREE.Mesh(finGeo, navyMat);
  fin.position.set(0, 1.05, 5.05);
  fin.rotation.x = -0.32;
  fin.castShadow = true;
  body.add(fin);

  const stabGeo = d.track(new THREE.BoxGeometry(1.9, 0.06, 0.5));
  const stab = new THREE.Mesh(stabGeo, navyMat);
  stab.position.set(0, 0.7, 4.55);
  body.add(stab);
  const endplateGeo = d.track(new THREE.BoxGeometry(0.06, 0.42, 0.42));
  for (const side of [1, -1]) {
    const ep = new THREE.Mesh(endplateGeo, navyMat);
    ep.position.set(side * 0.92, 0.78, 4.55);
    body.add(ep);
  }

  // --- Tail rotor on the left of the fin ---
  const tailRotor = createTailRotor(d, dark, metal);
  tailRotor.group.rotation.y = Math.PI / 2;
  tailRotor.group.position.set(-0.14, 1.05, 5.1);
  body.add(tailRotor.group);

  // --- Main rotor: mast, hub with Starflex arms, three blades, faint disc ---
  const mastGeo = d.track(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 12));
  const mast = new THREE.Mesh(mastGeo, metal);
  mast.position.set(0, 1.55, -0.2);
  body.add(mast);

  const hubGeo = d.track(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 16));
  const hub = new THREE.Mesh(hubGeo, metal);
  hub.position.set(0, 1.92, -0.2);
  body.add(hub);

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 1.95, -0.2);
  body.add(mainRotor);
  const armGeo = d.track(new THREE.BoxGeometry(0.7, 0.08, 0.16));
  armGeo.translate(0.35, 0, 0);
  const bladeGeo = d.track(new THREE.BoxGeometry(4.6, 0.045, 0.34));
  bladeGeo.translate(2.45, 0, 0);
  const bladeMat = d.track(new THREE.MeshStandardMaterial({ color: 0x171c22, roughness: 0.55, metalness: 0.25 }));
  for (let i = 0; i < 3; i += 1) {
    const arm = new THREE.Mesh(armGeo, metal);
    arm.rotation.y = (i * Math.PI * 2) / 3;
    mainRotor.add(arm);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.x = 0.55 * Math.cos((i * Math.PI * 2) / 3);
    blade.position.z = 0.55 * Math.sin((i * Math.PI * 2) / 3);
    blade.rotation.y = (i * Math.PI * 2) / 3;
    blade.rotation.z = -0.05; // coning droop
    mainRotor.add(blade);
  }
  const discGeo = d.track(new THREE.CircleGeometry(5.0, 40));
  const discMat = d.track(
    new THREE.MeshBasicMaterial({ color: 0x20262e, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
  );
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 1.97, -0.2);
  body.add(disc);

  // --- Tubular skids with arched cross-tubes ---
  const skidMat = metal;
  for (const side of [1, -1]) {
    const skidCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.85, -1.18, 1.15),
      new THREE.Vector3(side * 0.85, -1.2, -0.6),
      new THREE.Vector3(side * 0.85, -1.2, -1.9),
      new THREE.Vector3(side * 0.8, -1.0, -2.45)
    ]);
    const skidGeo = d.track(new THREE.TubeGeometry(skidCurve, 24, 0.06, 8));
    const skid = new THREE.Mesh(skidGeo, skidMat);
    skid.castShadow = true;
    body.add(skid);
  }
  for (const z of [-1.1, 0.7]) {
    const crossCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.85, -1.18, z),
      new THREE.Vector3(-0.45, -0.62, z),
      new THREE.Vector3(0, -0.5, z),
      new THREE.Vector3(0.45, -0.62, z),
      new THREE.Vector3(0.85, -1.18, z)
    ]);
    const crossGeo = d.track(new THREE.TubeGeometry(crossCurve, 24, 0.05, 8));
    const cross = new THREE.Mesh(crossGeo, skidMat);
    cross.castShadow = true;
    body.add(cross);
  }

  // --- Searchlight (Nightsun) under the nose + tail beacon ---
  const lightGeo = d.track(new THREE.CylinderGeometry(0.18, 0.2, 0.22, 16));
  const lightMat = d.track(new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xfff1c0, emissiveIntensity: 1.2 }));
  const searchlight = new THREE.Mesh(lightGeo, lightMat);
  searchlight.rotation.x = Math.PI / 2;
  searchlight.position.set(0, -0.55, -2.35);
  body.add(searchlight);

  const beaconGeo = d.track(new THREE.SphereGeometry(0.08, 10, 8));
  const beaconMat = d.track(new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 1.4 }));
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(0, 0.7, 2.0);
  body.add(beacon);

  // --- Decals: LAPD on the boom, POLICE on the door, registration ---
  addDecal(d, body, 'LAPD', '#f4f7fb', 1.4, 0.42, [0, 0.62, 3.2], 0.26);
  addDecal(d, body, 'POLICE', '#f4f7fb', 1.2, 0.3, [0, -0.05, -0.7], 1.24);
  addDecal(d, body, 'N665PD', '#dfe6ee', 0.8, 0.18, [0, 0.92, 4.5], 0.2);

  return {
    group,
    update: (state, controls, time, liveConfig) => {
      group.position.copy(state.position);
      group.quaternion.copy(state.orientation);
      group.scale.setScalar(clamp(liveConfig.hullLength / DESIGN_LENGTH, 0.4, 2.2));
      body.rotation.set(state.swing.x, 0, state.swing.z);

      mainRotor.rotation.y = time * (26 + Math.abs(state.motors.vertical) * 16);
      disc.material.opacity = 0.1 + Math.abs(state.motors.vertical) * 0.06;
      tailRotor.rotor.rotation.z = time * (34 + Math.abs(controls.yaw) * 44);
      beaconMat.emissiveIntensity = Math.sin(time * 6) > 0.5 ? 1.8 : 0.1;
    },
    dispose: () => d.disposeAll()
  };
}

/** Builds the fuselage by lofting elliptical cross-sections and painting the livery. */
function buildFuselage(): THREE.BufferGeometry {
  // [z, halfWidth, halfHeight, centerY]
  const stations: Array<[number, number, number, number]> = [
    [-3.2, 0.1, 0.12, -0.05],
    [-2.9, 0.45, 0.55, -0.05],
    [-2.5, 0.85, 0.95, -0.02],
    [-2.0, 1.1, 1.15, 0.02],
    [-1.3, 1.28, 1.28, 0.06],
    [-0.5, 1.26, 1.32, 0.12],
    [0.3, 1.05, 1.22, 0.2],
    [1.0, 0.7, 0.92, 0.32],
    [1.7, 0.42, 0.5, 0.44],
    [2.6, 0.3, 0.32, 0.54],
    [3.6, 0.22, 0.24, 0.64],
    [4.6, 0.17, 0.18, 0.74],
    [5.4, 0.1, 0.11, 0.82]
  ];
  const R = 24;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (const [z, w, h, cy] of stations) {
    for (let j = 0; j < R; j += 1) {
      const t = (j / R) * Math.PI * 2;
      const cT = Math.cos(t);
      const sT = Math.sin(t);
      const yUnit = sT < 0 ? sT * 0.82 : sT; // flatter belly
      positions.push(w * cT, cy + h * yUnit, z);
      const col = sT > 0.16 ? NAVY : sT < -0.02 ? WHITE : GOLD;
      colors.push(col[0], col[1], col[2]);
    }
  }

  for (let s = 0; s < stations.length - 1; s += 1) {
    const base = s * R;
    const next = (s + 1) * R;
    for (let j = 0; j < R; j += 1) {
      const j2 = (j + 1) % R;
      indices.push(base + j, next + j, base + j2);
      indices.push(base + j2, next + j, next + j2);
    }
  }

  // End caps.
  const noseCenter = positions.length / 3;
  positions.push(0, stations[0][3], stations[0][0] - 0.04);
  colors.push(NAVY[0], NAVY[1], NAVY[2]);
  for (let j = 0; j < R; j += 1) {
    indices.push(noseCenter, j, (j + 1) % R);
  }
  const lastBase = (stations.length - 1) * R;
  const tailCenter = positions.length / 3;
  const last = stations[stations.length - 1];
  positions.push(0, last[3], last[0] + 0.04);
  colors.push(NAVY[0], NAVY[1], NAVY[2]);
  for (let j = 0; j < R; j += 1) {
    indices.push(tailCenter, lastBase + (j + 1) % R, lastBase + j);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createTailRotor(
  d: Disposables,
  bladeMat: THREE.Material,
  hubMat: THREE.Material
): { group: THREE.Group; rotor: THREE.Group } {
  const group = new THREE.Group();
  const hubGeo = d.track(new THREE.SphereGeometry(0.09, 10, 8));
  group.add(new THREE.Mesh(hubGeo, hubMat));
  const rotor = new THREE.Group();
  group.add(rotor);
  const bladeGeo = d.track(new THREE.BoxGeometry(0.06, 0.92, 0.12));
  for (let i = 0; i < 2; i += 1) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.z = i * Math.PI;
    rotor.add(blade);
  }
  return { group, rotor };
}

/** A crisp text decal fitted to its own aspect ratio, mounted flush on both flanks. */
function addDecal(
  d: Disposables,
  body: THREE.Group,
  text: string,
  color: string,
  width: number,
  height: number,
  pos: [number, number, number],
  sideX: number
): void {
  const canvasW = 512;
  const canvasH = Math.round((canvasW * height) / width);
  const tex = d.track(
    makeDecalTexture((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.floor(h * 0.74)}px Arial, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2);
    }, canvasW, canvasH)
  );
  const mat = d.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  const geo = d.track(new THREE.PlaneGeometry(width, height));
  for (const side of [1, -1]) {
    const decal = new THREE.Mesh(geo, mat);
    decal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    decal.position.set(side * sideX, pos[1], pos[2]);
    decal.renderOrder = 1;
    body.add(decal);
  }
}
