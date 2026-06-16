import * as THREE from 'three';

/** Collects geometries/materials/textures so a craft can fully release GPU resources. */
export class Disposables {
  private readonly items: Array<{ dispose: () => void }> = [];

  track<T extends { dispose: () => void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  trackAll(...items: Array<{ dispose: () => void }>): void {
    this.items.push(...items);
  }

  disposeAll(): void {
    for (const item of this.items) {
      item.dispose();
    }
    this.items.length = 0;
  }
}

/**
 * A spinning ducted fan: a guard ring, hub, and two blades on a `rotor` group the caller
 * spins. Shared by the blimp thrusters and the helicopter's nose/top/side props.
 */
export function createDuctedFan(
  disposables: Disposables,
  radius: number,
  bladeColor: number
): { group: THREE.Group; rotor: THREE.Group } {
  const group = new THREE.Group();

  const ringGeo = disposables.track(new THREE.TorusGeometry(radius, radius * 0.08, 10, 28));
  const ringMat = disposables.track(
    new THREE.MeshStandardMaterial({ color: 0x202830, roughness: 0.5, metalness: 0.4 })
  );
  group.add(new THREE.Mesh(ringGeo, ringMat));

  const hubGeo = disposables.track(new THREE.CylinderGeometry(radius * 0.22, radius * 0.26, radius * 0.34, 16));
  const hubMat = disposables.track(
    new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.4, metalness: 0.6 })
  );
  const hub = new THREE.Mesh(hubGeo, hubMat);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);

  const rotor = new THREE.Group();
  group.add(rotor);

  const bladeGeo = disposables.track(new THREE.BoxGeometry(radius * 0.2, radius * 1.5, radius * 0.06));
  const bladeMat = disposables.track(
    new THREE.MeshStandardMaterial({ color: bladeColor, roughness: 0.3, metalness: 0.1 })
  );
  for (let i = 0; i < 2; i += 1) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.z = i * Math.PI;
    rotor.add(blade);
  }

  return { group, rotor };
}

/** Draws a livery panel (text + stripe) onto a canvas texture for decals. */
export function makeDecalTexture(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  width = 256,
  height = 128
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
