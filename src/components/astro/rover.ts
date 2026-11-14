/** The hero rover — a six-wheel hover probe built entirely from primitives.
 *
 * Like the anatomy atlas batches, every static hull piece is merged into ONE
 * BufferGeometry carrying vertex colors (single draw call, single material),
 * while the animated parts — wheels, camera mast, thruster glows, beacon —
 * stay as separate objects so the rig can spin, bank and bounce them every
 * frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRadialTexture } from './world';

const C = {
  hull: new THREE.Color('#e9e2d4'),
  accent: new THREE.Color('#d9622b'),
  dark: new THREE.Color('#333a42'),
  deck: new THREE.Color('#20303f'),
  struts: new THREE.Color('#5b636d'),
  crate: new THREE.Color('#cfc7b8'),
};

export interface RoverRig {
  group: THREE.Group;
  /** NOT parented to the group — the engine adds it to the scene so it can
   *  hug the terrain while the rover hovers above it. */
  shadow: THREE.Sprite;
  update: (dt: number, t: number, p: RoverUpdateParams) => void;
  dispose: () => void;
}

export interface RoverUpdateParams {
  speed: number; // forward speed (units/s)
  vx: number; // lateral velocity, for banking
  vy: number; // vertical velocity, for pitching
  hitFlash: number; // 0..1 decaying damage flash
  groundY: number; // terrain height under the rover
  thrust: number; // 0..1 how hard the hover jets burn
}

function colored(geo: THREE.BufferGeometry, color: THREE.Color, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.clone().applyMatrix4(matrix);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
  ry = 0
): THREE.BufferGeometry {
  const m = new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationY(ry));
  return colored(new THREE.BoxGeometry(w, h, d), color, m);
}

function cyl(
  rt: number,
  rb: number,
  h: number,
  x: number,
  y: number,
  z: number,
  color: THREE.Color
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().makeTranslation(x, y, z);
  return colored(new THREE.CylinderGeometry(rt, rb, h, 10), color, m);
}

export function buildRover(): RoverRig {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  // ---- merged static hull (one draw call) --------------------------------
  const parts: THREE.BufferGeometry[] = [];
  // main hull + deck
  parts.push(box(1.5, 0.46, 2.25, 0, 0.95, 0, C.hull));
  parts.push(box(1.34, 0.07, 1.98, 0, 1.22, 0, C.deck));
  parts.push(box(1.36, 0.03, 2.0, 0, 1.265, 0, C.dark));
  // burnt-orange identity stripes + bumper
  parts.push(box(1.53, 0.1, 0.5, 0, 1.02, -0.55, C.accent));
  parts.push(box(1.53, 0.08, 0.34, 0, 0.88, 0.75, C.accent));
  parts.push(box(1.28, 0.16, 0.12, 0, 0.72, -1.16, C.dark));
  // side skids
  parts.push(box(0.1, 0.12, 1.7, -0.78, 0.66, 0, C.struts));
  parts.push(box(0.1, 0.12, 1.7, 0.78, 0.66, 0, C.struts));
  // rear crate + strap
  parts.push(box(0.66, 0.42, 0.52, 0.1, 1.5, 0.72, C.crate));
  parts.push(box(0.68, 0.08, 0.54, 0.1, 1.5, 0.72, C.accent));
  // mast base + hub
  parts.push(cyl(0.14, 0.2, 0.16, -0.45, 1.32, -0.72, C.struts));
  // rocker-bogie arms: three per side, reaching down to wheel hubs
  const wheelX = 0.92;
  for (const side of [-1, 1]) {
    parts.push(box(0.09, 0.09, 2.1, side * wheelX, 0.62, 0, C.struts));
    parts.push(box(0.08, 0.55, 0.08, side * wheelX, 0.5, -0.85, C.struts));
    parts.push(box(0.08, 0.55, 0.08, side * wheelX, 0.5, 0.85, C.struts));
    parts.push(box(0.08, 0.5, 0.08, side * wheelX, 0.5, 0, C.struts));
  }
  // headlight housings (emissive plate is separate)
  parts.push(box(0.34, 0.12, 0.06, -0.42, 0.98, -1.13, C.dark));
  parts.push(box(0.34, 0.12, 0.06, 0.42, 0.98, -1.13, C.dark));

  const hullGeo = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.22,
  });
  chassis.add(new THREE.Mesh(hullGeo, bodyMat));

  // ---- headlight lenses ----------------------------------------------------
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0e1512,
    emissive: new THREE.Color('#ffd9a0'),
    emissiveIntensity: 2.2,
  });
  for (const x of [-0.42, 0.42]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.03), lensMat);
    lens.position.set(x, 0.98, -1.165);
    chassis.add(lens);
  }

  // ---- wheels ---------------------------------------------------------------
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.27, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xd9622b,
    roughness: 0.5,
    metalness: 0.4,
  });
  const wheels: THREE.Mesh[] = [];
  const wheelPhases = [0, 2.1, 4.2];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(side * wheelX, 0.36, -0.85 + i * 0.85);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      w.add(hub);
      w.userData.phase = side > 0 ? wheelPhases[i]! : wheelPhases[i]! + 1.05;
      wheels.push(w);
      chassis.add(w);
    }
  }

  // ---- camera mast ------------------------------------------------------------
  const mast = new THREE.Group();
  mast.position.set(-0.45, 1.36, -0.72);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, 0.92, 8),
    new THREE.MeshStandardMaterial({ color: 0x5b636d, roughness: 0.6, metalness: 0.4 })
  );
  pole.position.y = 0.46;
  mast.add(pole);
  const head = new THREE.Group();
  head.position.y = 0.95;
  const headBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.24, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.5 })
  );
  head.add(headBox);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x0d1512,
    emissive: new THREE.Color('#2dd4bf'),
    emissiveIntensity: 2.4,
  });
  for (const dx of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), eyeMat);
    eye.rotation.x = Math.PI / 2;
    eye.position.set(dx, 0.01, -0.13);
    head.add(eye);
  }
  mast.add(head);
  chassis.add(mast);

  // ---- antenna + blinking beacon ------------------------------------------------
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.025, 0.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x5b636d, metalness: 0.5, roughness: 0.5 })
  );
  antenna.position.set(0.45, 1.85, 0.72);
  chassis.add(antenna);
  const beaconMat = new THREE.SpriteMaterial({
    map: makeRadialTexture([
      [0, 'rgba(255,120,90,1)'],
      [0.4, 'rgba(255,80,60,0.5)'],
      [1, 'rgba(255,80,60,0)'],
    ]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const blinkSprite = new THREE.Sprite(beaconMat);
  blinkSprite.position.set(0.45, 2.18, 0.72);
  blinkSprite.scale.setScalar(0.55);
  chassis.add(blinkSprite);

  // ---- hover thrusters ------------------------------------------------------------
  const thrusterTex = makeRadialTexture([
    [0, 'rgba(140,255,235,0.95)'],
    [0.35, 'rgba(60,220,200,0.5)'],
    [1, 'rgba(60,220,200,0)'],
  ]);
  const thrusterSprites: THREE.Sprite[] = [];
  for (const [tx, tz] of [
    [-0.55, -0.8],
    [0.55, -0.8],
    [-0.55, 0.8],
    [0.55, 0.8],
  ]) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: thrusterTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.75,
      })
    );
    s.position.set(tx, 0.52, tz);
    s.scale.set(0.7, 1.1, 1);
    thrusterSprites.push(s);
    chassis.add(s);
  }

  // ---- contact shadow -------------------------------------------------------------
  const shadow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeRadialTexture([
        [0, 'rgba(20,8,4,0.55)'],
        [0.55, 'rgba(20,8,4,0.3)'],
        [1, 'rgba(20,8,4,0)'],
      ]),
      transparent: true,
      depthWrite: false,
    })
  );
  shadow.scale.set(3.4, 2.1, 1);

  // ---- update ---------------------------------------------------------------------
  let bank = 0;
  let pitch = 0;
  let headYaw = 0;

  const update = (dt: number, t: number, p: RoverUpdateParams) => {
    // Banking into lateral motion, pitching with climb/dive.
    bank = THREE.MathUtils.lerp(bank, THREE.MathUtils.clamp(-p.vx * 0.055, -0.4, 0.4), 1 - Math.exp(-8 * dt));
    pitch = THREE.MathUtils.lerp(pitch, THREE.MathUtils.clamp(p.vy * 0.03, -0.3, 0.3), 1 - Math.exp(-6 * dt));
    group.rotation.z = bank;
    group.rotation.x = pitch;

    // Gentle hover bob + damage squash.
    const bob = Math.sin(t * 6.2) * 0.035 + Math.sin(t * 9.7) * 0.015;
    chassis.position.y = bob * (1 - p.hitFlash * 1.5);
    const squash = 1 - p.hitFlash * 0.22;
    chassis.scale.set(1 + p.hitFlash * 0.1, squash, 1 + p.hitFlash * 0.1);

    // Damage flash on the hull.
    bodyMat.emissive.setRGB(p.hitFlash * 0.9, p.hitFlash * 0.12, p.hitFlash * 0.05);

    // Wheels: spin with speed, independent micro-bounce.
    const spin = (p.speed / 0.34) * dt;
    for (const w of wheels) {
      w.rotation.x -= spin;
      w.position.y = 0.36 + Math.sin(t * 11 + (w.userData.phase as number)) * 0.028;
    }

    // Camera head lazily looks into the turn.
    headYaw = THREE.MathUtils.lerp(headYaw, THREE.MathUtils.clamp(-p.vx * 0.14, -0.5, 0.5), 1 - Math.exp(-4 * dt));
    head.rotation.y = headYaw + Math.sin(t * 0.7) * 0.05;
    head.rotation.z = Math.sin(t * 1.3) * 0.03;

    // Beacon blink + thruster burn.
    beaconMat.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 4.5));
    const burn = 0.6 + p.thrust * 0.8 + Math.min(0.5, p.speed / 60);
    for (const s of thrusterSprites) {
      s.scale.set(0.55 + burn * 0.25, 0.8 + burn * 0.7, 1);
      (s.material as THREE.SpriteMaterial).opacity = 0.5 + burn * 0.35 + Math.sin(t * 31) * 0.08;
    }

    // Contact shadow hugs the terrain below.
    const h = Math.max(0, group.position.y - p.groundY);
    shadow.position.set(group.position.x, p.groundY + 0.06, group.position.z);
    const sc = 3.2 + h * 0.28;
    shadow.scale.set(sc, sc * 0.62, 1);
    (shadow.material as THREE.SpriteMaterial).opacity = Math.max(0.06, 0.5 - h * 0.055);
  };

  const dispose = () => {
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    shadow.geometry?.dispose?.();
    (shadow.material as THREE.Material).dispose();
  };

  return { group, shadow, update, dispose };
}
