/** MarsWorld — the endless canyon the rover races through.
 *
 * Rendering strategy borrows from the anatomy atlas engine: instead of
 * thousands of individual meshes the scenery is a handful of draw calls —
 * two large terrain tiles that leapfrog past the camera, InstancedMesh rock
 * walls / mesas / track markers that recycle by wrapping their local Z, a
 * single Points dust field, and custom ShaderMaterials for the sky dome and
 * the magnetic-interference aurora curtains. Everything scrolls inside one
 * `scrollGroup` whose position advances with distance travelled; individual
 * instances wrap by -SPAN once they pass the camera, so the corridor is
 * endless without ever allocating geometry mid-run.
 */
import * as THREE from 'three';

const SPAN = 800; // wrap length of the instanced scenery
const TILE_L = 400; // ground tile length (two tiles leapfrog)
const GROUND_W = 96;

// ---------------------------------------------------------------- helpers --

/** Soft radial-gradient sprite texture (used for the sun, glows and the
 *  rover's contact shadow). */
export function makeRadialTexture(stops: [number, string][]): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Deterministic canyon cross-section: a flat floor near the track that
 *  rises into dune walls toward the rim. Shared by ground tiles and rock
 *  placement so boulders sit on the terrain. */
export function terrainHeight(x: number, z: number): number {
  const wall = Math.pow(THREE.MathUtils.clamp((Math.abs(x) - 9) / 17, 0, 1), 1.7);
  const n = vnoise(x * 0.055, z * 0.045) * 0.65 + vnoise(x * 0.16, z * 0.12) * 0.35;
  return wall * (3.0 + n * 9.5) + (n - 0.5) * 0.55;
}

// ------------------------------------------------------------- palettes --

interface SkyPalette {
  horizon: THREE.Color;
  mid: THREE.Color;
  zenith: THREE.Color;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  hemi: THREE.Color;
  sunOpacity: number;
}

const PALETTE_BASE: SkyPalette = {
  horizon: new THREE.Color('#d98e6a'),
  mid: new THREE.Color('#7a4a63'),
  zenith: new THREE.Color('#241d33'),
  fog: new THREE.Color('#c98a68'),
  fogNear: 40,
  fogFar: 300,
  hemi: new THREE.Color('#e8b28a'),
  sunOpacity: 0.9,
};

const PALETTE_STORM: SkyPalette = {
  horizon: new THREE.Color('#c2622d'),
  mid: new THREE.Color('#6e3a26'),
  zenith: new THREE.Color('#2b1a14'),
  fog: new THREE.Color('#a85832'),
  fogNear: 20,
  fogFar: 165,
  hemi: new THREE.Color('#d98a5a'),
  sunOpacity: 0.15,
};

const PALETTE_MAGNETIC: SkyPalette = {
  horizon: new THREE.Color('#8a6a9a'),
  mid: new THREE.Color('#5a4a8a'),
  zenith: new THREE.Color('#2d2450'),
  fog: new THREE.Color('#8a7aa8'),
  fogNear: 34,
  fogFar: 260,
  hemi: new THREE.Color('#b89ad0'),
  sunOpacity: 0.35,
};

function lerpPalette(a: SkyPalette, b: SkyPalette, t: number, out: SkyPalette): SkyPalette {
  out.horizon.copy(a.horizon).lerp(b.horizon, t);
  out.mid.copy(a.mid).lerp(b.mid, t);
  out.zenith.copy(a.zenith).lerp(b.zenith, t);
  out.fog.copy(a.fog).lerp(b.fog, t);
  out.hemi.copy(a.hemi).lerp(b.hemi, t);
  out.fogNear = THREE.MathUtils.lerp(a.fogNear, b.fogNear, t);
  out.fogFar = THREE.MathUtils.lerp(a.fogFar, b.fogFar, t);
  out.sunOpacity = THREE.MathUtils.lerp(a.sunOpacity, b.sunOpacity, t);
  return out;
}

// ---------------------------------------------------------------- world --

export class MarsWorld {
  private scene: THREE.Scene;
  private scrollGroup = new THREE.Group();
  private groundTiles: THREE.Mesh[] = [];
  private tileBase: number[] = [];
  private groundGeo: THREE.BufferGeometry[] = [];

  private rocks!: THREE.InstancedMesh;
  private rockData: { x: number; z: number; s: number; ry: number }[] = [];
  private mesas!: THREE.InstancedMesh;
  private mesaData: { x: number; z: number; s: number; ry: number }[] = [];
  private chevrons!: THREE.InstancedMesh;
  private chevronZ: number[] = [];

  private skyMat!: THREE.ShaderMaterial;
  private sunSprite!: THREE.Sprite;
  private auroraMat!: THREE.ShaderMaterial;
  private aurora!: THREE.Group;
  private dust!: THREE.Points;
  private dustPos!: Float32Array;
  private dustVel!: Float32Array;
  private flash!: THREE.AmbientLight;

  private hemi!: THREE.HemisphereLight;
  private palette: SkyPalette = {
    horizon: new THREE.Color(),
    mid: new THREE.Color(),
    zenith: new THREE.Color(),
    fog: new THREE.Color(),
    fogNear: 40,
    fogFar: 300,
    hemi: new THREE.Color(),
    sunOpacity: 1,
  };
  private stormTarget = 0;
  private magneticTarget = 0;
  private stormMix = 0;
  private magneticMix = 0;
  private flashLevel = 0;
  private elapsed = 0;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.scrollGroup);

    this.buildSky();
    this.buildGround();
    this.buildRocks();
    this.buildMesas();
    this.buildChevrons();
    this.buildDust();
    this.buildAurora();

    this.hemi = new THREE.HemisphereLight(0xe8b28a, 0x5a2f22, 0.85);
    scene.add(this.hemi);
    const sunLight = new THREE.DirectionalLight(0xffd9b0, 2.5);
    sunLight.position.set(-0.45, 0.55, -0.7);
    scene.add(sunLight);
    const rim = new THREE.DirectionalLight(0x9ad0c8, 0.5);
    rim.position.set(0.7, 0.3, 0.6);
    scene.add(rim);
    this.flash = new THREE.AmbientLight(0xffb070, 0);
    scene.add(this.flash);

    scene.fog = new THREE.Fog(0xc98a68, 40, 300);
  }

  // -------------------------------------------------------------- sky ----

  private buildSky() {
    const skyGeo = new THREE.SphereGeometry(900, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        cHorizon: { value: PALETTE_BASE.horizon.clone() },
        cMid: { value: PALETTE_BASE.mid.clone() },
        cZenith: { value: PALETTE_BASE.zenith.clone() },
        sunDir: { value: new THREE.Vector3(-0.45, 0.32, -0.83).normalize() },
        sunAmt: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 cHorizon;
        uniform vec3 cMid;
        uniform vec3 cZenith;
        uniform vec3 sunDir;
        uniform float sunAmt;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.05, 1.0);
          vec3 col = mix(cHorizon, cMid, smoothstep(0.0, 0.30, h));
          col = mix(col, cZenith, smoothstep(0.24, 0.78, h));
          float sun = pow(max(dot(d, normalize(sunDir)), 0.0), 22.0);
          col += vec3(1.0, 0.72, 0.48) * sun * sunAmt;
          float sunGlow = pow(max(dot(d, normalize(sunDir)), 0.0), 3.0);
          col += vec3(0.9, 0.55, 0.35) * sunGlow * 0.22 * sunAmt;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);

    // Stars in the upper sky.
    const starCount = 700;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const y = 0.18 + Math.pow(Math.random(), 1.6) * 0.8;
      const r = Math.sqrt(Math.max(0, 1 - y * y)) * 850;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = y * 850;
      pos[i * 3 + 2] = Math.sin(theta) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffe9d0,
        size: 1.7,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.8,
        fog: false,
      })
    );
    stars.frustumCulled = false;
    this.scene.add(stars);

    // Sun sprite + the two Martian moons.
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialTexture([
          [0, 'rgba(255,236,200,1)'],
          [0.25, 'rgba(255,190,120,0.85)'],
          [0.6, 'rgba(230,120,60,0.25)'],
          [1, 'rgba(230,120,60,0)'],
        ]),
        transparent: true,
        opacity: 0.95,
        fog: false,
        depthWrite: false,
      })
    );
    this.sunSprite.position.set(-330, 240, -760);
    this.sunSprite.scale.setScalar(220);
    this.scene.add(this.sunSprite);

    const phobos = new THREE.Mesh(
      new THREE.SphereGeometry(15, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x9a8d7f, fog: false })
    );
    phobos.position.set(-210, 150, -700);
    this.scene.add(phobos);
    const deimos = new THREE.Mesh(
      new THREE.SphereGeometry(6.5, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x7d7367, fog: false })
    );
    deimos.position.set(250, 190, -660);
    this.scene.add(deimos);
  }

  // ----------------------------------------------------------- ground ----

  private buildGround() {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    for (let t = 0; t < 2; t++) {
      const geo = new THREE.PlaneGeometry(GROUND_W, TILE_L, 46, 104);
      geo.rotateX(-Math.PI / 2);
      const colors = new Float32Array(geo.attributes.position.count * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mesh = new THREE.Mesh(geo, mat);
      this.groundGeo.push(geo);
      this.groundTiles.push(mesh);
      this.tileBase.push(t === 0 ? 0 : -TILE_L);
      mesh.userData.baseZ = t === 0 ? 0 : -TILE_L;
      this.scrollGroup.add(mesh);
      this.displaceTile(t, t === 0 ? 0 : -TILE_L, 0);
    }
  }

  /** Displace a tile's vertices with terrain noise evaluated in WORLD
   *  coordinates (baseZ + scroll), so recycling stays seamless. */
  private displaceTile(index: number, baseZ: number, scroll: number) {
    const geo = this.groundGeo[index]!;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = geo.attributes.color as THREE.BufferAttribute;
    const c1 = new THREE.Color('#a14e33');
    const c2 = new THREE.Color('#cf8a52');
    const c3 = new THREE.Color('#5f3324');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const localZ = pos.getZ(i);
      const worldZ = baseZ + localZ + scroll;
      const h = terrainHeight(x, worldZ);
      pos.setY(i, h);
      const n = vnoise(x * 0.09 + 40, worldZ * 0.07);
      tmp.copy(c1).lerp(c2, n);
      if (h < 0.4) tmp.lerp(c3, 0.55 - h * 0.5);
      if (h > 6) tmp.lerp(c2, 0.35);
      colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    pos.needsUpdate = true;
    colors.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // ------------------------------------------------------------- rocks ----

  private buildRocks() {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a4a33, roughness: 1, flatShading: true });
    this.rocks = new THREE.InstancedMesh(geo, mat, 260);
    this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tint = new THREE.Color();
    for (let i = 0; i < 260; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (14 + Math.random() * 20);
      const z = -SPAN + Math.random() * SPAN;
      const s = 1.6 + Math.pow(Math.random(), 1.6) * 8;
      this.rockData.push({ x, z, s, ry: Math.random() * Math.PI * 2 });
      tint.setHSL(0.05 + Math.random() * 0.04, 0.42, 0.28 + Math.random() * 0.18);
      this.rocks.setColorAt(i, tint);
    }
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;
    this.scrollGroup.add(this.rocks);
    this.refreshRockMatrices(0, true);
  }

  private refreshRockMatrices(scroll: number, force = false) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let dirty = force;
    for (let i = 0; i < this.rockData.length; i++) {
      const r = this.rockData[i]!;
      const wrap = r.z + scroll > 70;
      if (!wrap && !force) continue;
      if (wrap) r.z -= SPAN;
      e.set(Math.random() * 0.3, r.ry, Math.random() * 0.3);
      q.setFromEuler(e);
      v.set(r.x, terrainHeight(r.x, r.z + scroll) + r.s * 0.35, r.z);
      sc.set(r.s, r.s * (0.8 + Math.random() * 0.7), r.s);
      m.compose(v, q, sc);
      this.rocks.setMatrixAt(i, m);
      dirty = true;
    }
    if (dirty) this.rocks.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------- mesas ----

  private buildMesas() {
    const geo = new THREE.CylinderGeometry(7, 13, 30, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4e2e24, roughness: 1, flatShading: true });
    this.mesas = new THREE.InstancedMesh(geo, mat, 12);
    this.mesas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (55 + Math.random() * 80);
      const z = -SPAN + (i / 12) * SPAN + Math.random() * 40;
      const sc = 0.9 + Math.random() * 1.8;
      this.mesaData.push({ x, z, s: sc, ry: Math.random() * Math.PI });
    }
    this.refreshMesaMatrices(0, true);
    this.scrollGroup.add(this.mesas);
  }

  private refreshMesaMatrices(scroll: number, force = false) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let dirty = force;
    for (let i = 0; i < this.mesaData.length; i++) {
      const d = this.mesaData[i]!;
      const wrap = d.z + scroll > 90;
      if (!wrap && !force) continue;
      if (wrap) d.z -= SPAN;
      q.setFromEuler(new THREE.Euler(0, d.ry, 0));
      v.set(d.x, 6 * d.s - 3, d.z);
      sc.set(d.s, d.s * (0.7 + Math.random() * 0.9), d.s);
      m.compose(v, q, sc);
      this.mesas.setMatrixAt(i, m);
      dirty = true;
    }
    if (dirty) this.mesas.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------- chevrons ----

  private buildChevrons() {
    const geo = new THREE.RingGeometry(0.55, 0.95, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x67e8d9,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const count = 25;
    this.chevrons = new THREE.InstancedMesh(geo, mat, count);
    this.chevrons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const z = -8 - i * 32;
      this.chevronZ.push(z);
      m.makeTranslation(0, 0.1, z);
      this.chevrons.setMatrixAt(i, m);
    }
    this.chevrons.instanceMatrix.needsUpdate = true;
    this.scrollGroup.add(this.chevrons);
  }

  // -------------------------------------------------------------- dust ----

  private buildDust() {
    const count = 340;
    this.dustPos = new Float32Array(count * 3);
    this.dustVel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.dustPos[i * 3] = (Math.random() - 0.5) * 52;
      this.dustPos[i * 3 + 1] = 0.2 + Math.random() * 11;
      this.dustPos[i * 3 + 2] = -80 + Math.random() * 92;
      this.dustVel[i] = 0.5 + Math.random() * 1.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xe0b48c,
        size: 0.22,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  // ------------------------------------------------------------ aurora ----

  private buildAurora() {
    this.aurora = new THREE.Group();
    this.auroraMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uOpacity;
        float band(float x, float t) {
          return 0.5 + 0.5 * sin(x * 6.2831 + t) * sin(x * 13.7 - t * 1.6);
        }
        void main() {
          vec2 uv = vUv;
          float v = smoothstep(0.0, 0.12, uv.y) * (1.0 - smoothstep(0.5, 1.0, uv.y));
          float n = band(uv.x * 2.2 + uv.y * 0.35, uTime * 0.8);
          vec3 col = mix(vec3(0.48, 0.22, 0.92), vec3(0.12, 0.85, 0.9), n);
          gl_FragColor = vec4(col, v * uOpacity * (0.3 + 0.7 * n));
        }
      `,
    });
    const geo = new THREE.PlaneGeometry(7, 17);
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(geo, this.auroraMat);
      p.position.set(-15 + i * 5, 8.5, -14 - (i % 3) * 12);
      p.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      this.aurora.add(p);
    }
    this.scene.add(this.aurora);
  }

  // ------------------------------------------------------------- state ----

  setStorm(v: boolean) {
    this.stormTarget = v ? 1 : 0;
  }

  setMagnetic(v: boolean) {
    this.magneticTarget = v ? 1 : 0;
  }

  update(dt: number, scroll: number, speed: number) {
    if (this.disposed) return;
    this.elapsed += dt;

    // Scroll group + instance recycling.
    this.scrollGroup.position.z = scroll;
    for (let t = 0; t < this.groundTiles.length; t++) {
      const tile = this.groundTiles[t]!;
      const base = tile.userData.baseZ as number;
      if (base + scroll > TILE_L) {
        const next = base - SPAN;
        tile.userData.baseZ = next;
        this.displaceTile(t, next, scroll);
      }
    }
    this.refreshRockMatrices(scroll);
    this.refreshMesaMatrices(scroll);
    {
      const m = new THREE.Matrix4();
      let dirty = false;
      for (let i = 0; i < this.chevronZ.length; i++) {
        const z = this.chevronZ[i]!;
        if (z + scroll > 24) {
          this.chevronZ[i] = z - SPAN;
          m.makeTranslation(0, 0.1, z - SPAN);
          this.chevrons.setMatrixAt(i, m);
          dirty = true;
        }
      }
      if (dirty) this.chevrons.instanceMatrix.needsUpdate = true;
      const mat = this.chevrons.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.32 + 0.22 * Math.sin(this.elapsed * 3 - scroll * 0.02);
    }

    // Dust stream.
    const dustMat = this.dust.material as THREE.PointsMaterial;
    for (let i = 0; i < this.dustVel.length; i++) {
      const z = this.dustPos[i * 3 + 2]! + speed * 1.65 * this.dustVel[i]! * dt;
      if (z > 14) {
        this.dustPos[i * 3] = (Math.random() - 0.5) * 52;
        this.dustPos[i * 3 + 1] = 0.2 + Math.random() * 11;
        this.dustPos[i * 3 + 2] = z - 95;
      } else {
        this.dustPos[i * 3 + 2] = z;
      }
    }
    (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Palette blending: base → storm → magnetic.
    this.stormMix += (this.stormTarget - this.stormMix) * Math.min(1, dt * 1.6);
    this.magneticMix += (this.magneticTarget - this.magneticMix) * Math.min(1, dt * 1.6);
    const tmp: SkyPalette = {
      horizon: new THREE.Color(),
      mid: new THREE.Color(),
      zenith: new THREE.Color(),
      fog: new THREE.Color(),
      fogNear: 0,
      fogFar: 0,
      hemi: new THREE.Color(),
      sunOpacity: 0,
    };
    lerpPalette(PALETTE_BASE, PALETTE_STORM, this.stormMix, tmp);
    lerpPalette(tmp, PALETTE_MAGNETIC, this.magneticMix, this.palette);

    (this.skyMat.uniforms.cHorizon!.value as THREE.Color).copy(this.palette.horizon);
    (this.skyMat.uniforms.cMid!.value as THREE.Color).copy(this.palette.mid);
    (this.skyMat.uniforms.cZenith!.value as THREE.Color).copy(this.palette.zenith);
    this.skyMat.uniforms.sunAmt!.value = 1 - this.stormMix * 0.8;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.palette.fog);
    fog.near = this.palette.fogNear;
    fog.far = this.palette.fogFar;
    this.hemi.color.copy(this.palette.hemi);
    (this.sunSprite.material as THREE.SpriteMaterial).opacity = this.palette.sunOpacity;

    // Storm dust look + lightning.
    dustMat.opacity = 0.55 + this.stormMix * 0.35;
    dustMat.size = 0.22 + this.stormMix * 0.16;
    dustMat.color.setHex(this.stormMix > 0.5 ? 0xe07848 : 0xe0b48c);
    if (this.stormMix > 0.6 && Math.random() < dt * 0.5) this.flashLevel = 0.9;
    this.flashLevel *= Math.exp(-9 * dt);
    this.flash.intensity = this.flashLevel * 2.2;

    // Aurora curtains.
    this.auroraMat.uniforms.uTime!.value = this.elapsed;
    this.auroraMat.uniforms.uOpacity!.value = this.magneticMix * 0.85;
  }

  dispose() {
    this.disposed = true;
    const disposeObj = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else mat?.dispose();
      });
      this.scene.remove(obj);
    };
    disposeObj(this.scrollGroup);
    disposeObj(this.aurora);
    if (this.dust) {
      this.dust.geometry.dispose();
      (this.dust.material as THREE.Material).dispose();
      this.scene.remove(this.dust);
    }
    this.skyMat.dispose();
  }
}
