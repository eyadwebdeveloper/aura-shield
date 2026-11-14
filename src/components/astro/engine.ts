/** AstroEngine — the 3D game engine behind "Astro-Shield: Rover & Debris Run".
 *
 * Architecture follows the anatomy atlas viewer: a framework-free Three.js
 * class owned by a thin React host (GameCanvas). The engine owns the run
 * clock, which only advances while the game is unpaused, so every stealth
 * reaction-time measurement stays honest even if the tab is backgrounded.
 *
 * The 120-second DIRECTOR schedules the clinical events described in the
 * mission spec:
 *   · PVT meteoroids at randomized 2–10 s intervals (25 % fake warnings)
 *   · two 8 s quiet stretches ending in a peripheral radar ping
 *   · two 15 s magnetic interference zones (inverted controls)
 *   · a mid-run fork: Safe Route (+50) vs Storm Route (+200, fast & chaotic)
 *
 * All gameplay events flow into the Recorder (assessment.ts); the engine
 * never decides what is clinically "good" or "bad".
 */
import * as THREE from 'three';
import { MarsWorld, makeRadialTexture, terrainHeight } from './world';
import { buildRover, type RoverRig } from './rover';
import { Recorder, loadSessions, type SessionLog, type RouteChoice } from './assessment';
import { sfx } from './audio';
import type { BannerTone, HudState, RadarPingState } from './store';

export const RUN_SECONDS = 120;

export interface EngineCallbacks {
  onHud: (patch: Partial<HudState>) => void;
  onBanner: (text: string, tone: BannerTone, ms?: number, sub?: string) => void;
  onPhase: (p: 'countdown' | 'running' | 'results') => void;
  onCountdown: (n: number) => void;
  onRadar: (side: RadarPingState['side'], ms: number) => void;
  onRadarClose: () => void;
  onFork: (ms: number) => void;
  onForkClose: () => void;
  onEnd: (log: SessionLog) => void;
}

// ------------------------------------------------------------------ tuning --

const SHIELD_COST = 22;
const CRYSTAL_ENERGY = 6;
const POD_ENERGY = 20;
const COLLISION_ENERGY = 25;
const RADAR_WINDOW = 2500;
const FORK_WINDOW = 2000;

// ------------------------------------------------------------------ helpers --

function makeAlertTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 96, 96);
  g.font = 'bold 76px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,70,40,0.95)';
  g.shadowBlur = 18;
  g.fillStyle = '#ffd9cf';
  g.fillText('!', 48, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Crystal {
  group: THREE.Group;
  core: THREE.Mesh;
  active: boolean;
  phase: number;
}
interface Pod {
  group: THREE.Group;
  active: boolean;
  phase: number;
}
interface Meteoroid {
  group: THREE.Group;
  rock: THREE.Mesh;
  marker: THREE.Group;
  active: boolean;
  isTrial: boolean;
  rot: THREE.Vector3;
}
interface Debris {
  mesh: THREE.Mesh;
  active: boolean;
  radius: number;
  rotSpeed: number;
}

// ------------------------------------------------------------------ engine --

export class AstroEngine {
  private host: HTMLElement;
  private cb: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: MarsWorld;
  private rover: RoverRig;
  private recorder = new Recorder();

  // clock / phase
  private raf = 0;
  private lastNow = 0;
  private t = 0; // total elapsed (visual time, always advances)
  private runMs = 0; // run clock (drives the director)
  private phase: 'intro' | 'countdown' | 'running' | 'paused' | 'results' = 'intro';
  private pausedFrom: 'running' | 'countdown' | null = null;
  private countdownLeft = 0;
  private countdownShown = -1;

  // motion
  private scroll = 0;
  private speed = 9;
  private routeMult = 1;
  private finaleBoost = 1;
  private vx = 0;
  private vy = 0;
  private x = 0;
  private y = 2.6;
  private steerX = 0;
  private steerY = 0;
  private touchX = 0;
  private touchY = 0;
  private inverted = false;
  private shake = 0;
  private hitFlash = 0;
  private invuln = 0;

  // scoring
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private energy = 100;
  private topSpeed = 0;

  // director state
  private fired = new Set<string>();
  private nextPvtAt = 6000;
  private nextCrystalAt = 2500;
  private nextPodAt = 9000;
  private nextDebrisAt = 6000;
  private fakeWindowUntil = -1;
  private radarActive = false;
  private radarOnsetAt = 0;
  private radarExpireAt = 0;
  private forkOpenUntil = -1;
  private forkChosen: RouteChoice | null = null;
  private routeSegmentEnd = 0;
  private stormOn = false;
  private realTrials = 0;

  // entities
  private crystals: Crystal[] = [];
  private pods: Pod[] = [];
  private meteoroids: Meteoroid[] = [];
  private debris: Debris[] = [];
  private gateSafe: THREE.Group | null = null;
  private gateStorm: THREE.Group | null = null;

  // fx
  private shieldMesh!: THREE.Mesh;
  private shieldMat!: THREE.ShaderMaterial;
  private shieldAnim = 0;
  private particles!: THREE.Points;
  private pPos!: Float32Array;
  private pVel!: Float32Array;
  private pLife!: Float32Array;
  private pDecay!: Float32Array;
  private pColor!: Float32Array;
  private pSize!: Float32Array;
  private pCursor = 0;
  private alertTex: THREE.Texture;
  private glowTex: THREE.Texture;

  // hud throttle
  private hudTimer = 0;

  // input
  private keys = new Set<string>();
  private touchSteerActive = false;

  private ro: ResizeObserver | null = null;
  private disposed = false;

  constructor(host: HTMLElement, cb: EngineCallbacks) {
    this.host = host;
    this.cb = cb;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      throw new Error('This browser could not start WebGL.');
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Astro-Shield 3D game. Steer with arrow keys or the on-screen stick, press space or tap to raise the shield.'
    );
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1600);
    this.camera.position.set(6, 3.4, 8);
    this.scene.add(this.camera);

    this.world = new MarsWorld(this.scene);
    this.rover = buildRover();
    this.scene.add(this.rover.group);
    this.scene.add(this.rover.shadow);

    this.alertTex = makeAlertTexture();
    this.glowTex = makeRadialTexture([
      [0, 'rgba(255,255,255,0.9)'],
      [0.4, 'rgba(255,255,255,0.28)'],
      [1, 'rgba(255,255,255,0)'],
    ]);

    this.buildEntities();
    this.buildShield();
    this.buildParticles();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------- build ----

  private buildEntities() {
    // --- crystals (teal octahedra with additive glow) ---
    const crystalGeo = new THREE.OctahedronGeometry(0.55);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x0f3f38,
      emissive: new THREE.Color('#2ee6c8'),
      emissiveIntensity: 1.7,
      roughness: 0.25,
      metalness: 0.1,
    });
    for (let i = 0; i < 40; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(crystalGeo, crystalMat);
      group.add(core);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0x39f0d2,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      glow.scale.setScalar(2.6);
      group.add(glow);
      group.visible = false;
      this.scene.add(group);
      this.crystals.push({ group, core, active: false, phase: Math.random() * 6.28 });
    }

    // --- friendly supply pods (hex crates, green beacons — look deceptively
    //     similar to the hostile rocks at a glance) ---
    const podGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.8, 6);
    const podMat = new THREE.MeshStandardMaterial({
      color: 0x3f5a3a,
      roughness: 0.6,
      flatShading: true,
    });
    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();
      const crate = new THREE.Mesh(podGeo, podMat);
      crate.rotation.z = Math.PI / 2;
      group.add(crate);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.86, 6),
        new THREE.MeshStandardMaterial({
          color: 0x1d2b1a,
          emissive: new THREE.Color('#7dff9a'),
          emissiveIntensity: 1.4,
        })
      );
      cap.rotation.z = Math.PI / 2;
      group.add(cap);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0x6cff8f,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      glow.scale.setScalar(3);
      group.add(glow);
      group.visible = false;
      this.scene.add(group);
      this.pods.push({ group, active: false, phase: Math.random() * 6.28 });
    }

    // --- hostile micro-meteoroids (hot rocks + warning marker) ---
    const rockGeo = new THREE.IcosahedronGeometry(1.05, 1);
    {
      const pos = rockGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const s = 0.78 + Math.random() * 0.5;
        pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
      }
      rockGeo.computeVertexNormals();
    }
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x4a2620,
      roughness: 0.9,
      flatShading: true,
      emissive: new THREE.Color('#ff5a2a'),
      emissiveIntensity: 0.55,
    });
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const rock = new THREE.Mesh(rockGeo, rockMat);
      group.add(rock);
      const marker = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.09, 8, 40),
        new THREE.MeshBasicMaterial({
          color: 0xff4a2a,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      marker.add(ring);
      const bang = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.alertTex,
          transparent: true,
          depthWrite: false,
        })
      );
      bang.position.y = 1.9;
      bang.scale.setScalar(1.6);
      marker.add(bang);
      group.add(marker);
      group.visible = false;
      this.scene.add(group);
      this.meteoroids.push({
        group,
        rock,
        marker,
        active: false,
        isTrial: false,
        rot: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1),
      });
    }

    // --- passive debris spires (steer around / hop over) ---
    const debrisGeo = new THREE.DodecahedronGeometry(1.4, 0);
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x6e4634,
      roughness: 1,
      flatShading: true,
    });
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(debrisGeo, debrisMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.debris.push({ mesh, active: false, radius: 1.7, rotSpeed: 0.4 + Math.random() });
    }
  }

  private makeGate(color: number): THREE.Group {
    const g = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.34, 10, 42),
      new THREE.MeshStandardMaterial({
        color: 0x101418,
        emissive: new THREE.Color(color),
        emissiveIntensity: 1.8,
      })
    );
    g.add(torus);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.scale.set(16, 16, 1);
    g.add(glow);
    return g;
  }

  private buildShield() {
    this.shieldMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#4ef0d2') },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vView;
        varying vec2 vUv;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          vUv = uv;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vView;
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        void main() {
          float fres = pow(1.0 - abs(dot(vN, vView)), 2.1);
          vec2 g = abs(fract(vUv * 14.0) - 0.5);
          float grid = smoothstep(0.42, 0.5, max(g.x, g.y));
          float pulse = 0.85 + 0.15 * sin(uTime * 20.0);
          float a = (fres * 0.9 + grid * 0.16) * uOpacity * pulse;
          gl_FragColor = vec4(uColor * (fres * 1.7 + grid * 0.3), a);
        }
      `,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(3.4, 48, 32), this.shieldMat);
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);
  }

  private buildParticles() {
    const N = 420;
    this.pPos = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pDecay = new Float32Array(N);
    this.pColor = new Float32Array(N * 3);
    this.pSize = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.pColor, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.pLife, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aLife;
        attribute float aSize;
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vColor = aColor;
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (170.0 / max(1.0, -mv.z)) * (0.35 + 0.65 * aLife);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.04, length(c)) * vLife;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  private burst(
    x: number,
    y: number,
    z: number,
    color: THREE.Color,
    count: number,
    power: number,
    size = 1
  ) {
    for (let i = 0; i < count; i++) {
      const idx = this.pCursor;
      this.pCursor = (this.pCursor + 1) % this.pLife.length;
      this.pPos[idx * 3] = x;
      this.pPos[idx * 3 + 1] = y;
      this.pPos[idx * 3 + 2] = z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = power * (0.35 + Math.random() * 0.75);
      this.pVel[idx * 3] = Math.sin(phi) * Math.cos(theta) * v;
      this.pVel[idx * 3 + 1] = Math.cos(phi) * v * 0.85 + power * 0.25;
      this.pVel[idx * 3 + 2] = Math.sin(phi) * Math.sin(theta) * v;
      this.pLife[idx] = 1;
      this.pDecay[idx] = 1.1 + Math.random() * 1.3;
      this.pColor[idx * 3] = color.r;
      this.pColor[idx * 3 + 1] = color.g;
      this.pColor[idx * 3 + 2] = color.b;
      this.pSize[idx] = size * (0.7 + Math.random() * 0.8);
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.particles.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.particles.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.particles.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  // ------------------------------------------------------------ lifecycle --

  /** Start the countdown for a fresh run. */
  begin() {
    this.resetRun();
    this.phase = 'countdown';
    this.countdownLeft = 3.4;
    this.countdownShown = -1;
    this.cb.onPhase('countdown');
  }

  private resetRun() {
    this.runMs = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.energy = 100;
    this.topSpeed = 0;
    this.routeMult = 1;
    this.finaleBoost = 1;
    this.fired.clear();
    this.nextPvtAt = 6000 + Math.random() * 3000;
    this.nextCrystalAt = 2500;
    this.nextPodAt = 9000 + Math.random() * 3000;
    this.nextDebrisAt = 6500;
    this.fakeWindowUntil = -1;
    this.radarActive = false;
    this.forkOpenUntil = -1;
    this.forkChosen = null;
    this.routeSegmentEnd = 0;
    this.stormOn = false;
    this.realTrials = 0;
    this.inverted = false;
    this.world.setStorm(false);
    this.world.setMagnetic(false);
    this.x = 0;
    this.y = 2.6;
    this.vx = 0;
    this.vy = 0;
    this.hitFlash = 0;
    this.invuln = 0;
    this.shieldAnim = 0;
    this.recorder.reset();
    for (const c of this.crystals) {
      c.active = false;
      c.group.visible = false;
    }
    for (const p of this.pods) {
      p.active = false;
      p.group.visible = false;
    }
    for (const m of this.meteoroids) {
      m.active = false;
      m.group.visible = false;
    }
    for (const d of this.debris) {
      d.active = false;
      d.mesh.visible = false;
    }
    if (this.gateSafe) {
      this.gateSafe.visible = false;
      this.gateStorm.visible = false;
    }
    this.syncHud(true);
  }

  pause() {
    if (this.phase !== 'running' && this.phase !== 'countdown') return;
    this.pausedFrom = this.phase;
    this.phase = 'paused';
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.pausedFrom ?? 'running';
    this.lastNow = performance.now();
  }

  togglePause() {
    if (this.phase === 'paused') this.resume();
    else this.pause();
  }

  /** QA hook: advance the simulation by `seconds` using fixed timesteps —
   *  identical to the passage of real play time (without user input), so the
   *  director, spawns and scoring all behave exactly as in live play. Used
   *  by automated browser checks; safe to call at any time. */
  debugAdvance(seconds: number) {
    let remaining = Math.max(0, Math.min(seconds, 200));
    while (remaining > 0 && (this.phase === 'running' || this.phase === 'countdown')) {
      const dt = Math.min(0.033, remaining);
      this.t += dt;
      this.update(dt);
      remaining -= dt;
    }
  }

  /** QA hook: snapshot of internal director state for automated checks. */
  debugState() {
    return {
      phase: this.phase,
      runMs: Math.round(this.runMs),
      forkOpen: this.forkOpenUntil > 0 && this.forkChosen === null,
      radarActive: this.radarActive,
      inverted: this.inverted,
      storm: this.stormOn,
      pvtActive: this.meteoroids.some((m) => m.active && m.isTrial),
      score: Math.round(this.score),
      energy: Math.round(this.energy),
    };
  }

  private finishRun() {
    const log = this.recorder.finish({
      durationMs: this.runMs,
      score: this.score,
      maxCombo: this.maxCombo,
      distance: this.scroll,
      topSpeed: this.topSpeed,
    });
    this.phase = 'results';
    this.world.setStorm(false);
    this.world.setMagnetic(false);
    this.inverted = false;
    this.cb.onForkClose();
    this.cb.onRadarClose();
    sfx.finish();
    this.burst(this.x, this.y + 1, 0, new THREE.Color('#ffd9a0'), 60, 9, 1.4);
    this.burst(this.x, this.y + 1, 0, new THREE.Color('#4ef0d2'), 40, 7, 1.2);
    this.cb.onPhase('results');
    this.cb.onEnd(log);
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.ro?.disconnect();
    this.world.dispose();
    this.rover.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.alertTex.dispose();
    this.glowTex.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- input --

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.phase === 'intro' || this.phase === 'results') return;
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    if (k === 'p') {
      this.togglePause();
      return;
    }
    if (this.keys.has(k)) return; // ignore auto-repeat
    this.keys.add(k);
    const at = this.runMs;
    if (k === 'arrowleft' || k === 'a') {
      this.steerX = -1;
      if (this.phase === 'running') this.recorder.steerPress(-1, at);
    } else if (k === 'arrowright' || k === 'd') {
      this.steerX = 1;
      if (this.phase === 'running') this.recorder.steerPress(1, at);
    } else if (k === 'arrowup' || k === 'w') {
      this.steerY = 1;
      if (this.phase === 'running') this.recorder.steerPress(2, at);
    } else if (k === 'arrowdown' || k === 's') {
      this.steerY = -1;
      if (this.phase === 'running') this.recorder.steerPress(-2, at);
    } else if (k === ' ') {
      if (this.radarActive) this.respondRadar();
      else if (this.phase === 'running') this.shield();
    } else if (k === 'arrowleft' && this.forkOpenUntil > 0 && this.forkChosen === null) {
      this.chooseRoute('safe');
    } else if (k === 'arrowright' && this.forkOpenUntil > 0 && this.forkChosen === null) {
      this.chooseRoute('storm');
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === 'arrowleft' || k === 'a') this.steerX = this.keys.has('arrowright') || this.keys.has('d') ? 1 : 0;
    if (k === 'arrowright' || k === 'd') this.steerX = this.keys.has('arrowleft') || this.keys.has('a') ? -1 : 0;
    if (k === 'arrowup' || k === 'w') this.steerY = this.keys.has('arrowdown') || this.keys.has('s') ? -1 : 0;
    if (k === 'arrowdown' || k === 's') this.steerY = this.keys.has('arrowup') || this.keys.has('w') ? 1 : 0;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.phase !== 'running' && this.phase !== 'countdown') return;
    if (this.radarActive) return; // taps during a ping belong to the ping button
    if (this.touchSteerActive && e.pointerType === 'touch') return; // joystick owns touch
    this.shield();
  };

  private onVisibility = () => {
    if (document.hidden) this.pause();
  };

  /** Analog steer from the on-screen touch stick. */
  setTouchSteer(x: number, y: number, active: boolean) {
    this.touchSteerActive = active;
    const prevX = this.touchX;
    const prevY = this.touchY;
    this.touchX = x;
    this.touchY = y;
    if (this.phase !== 'running') return;
    const signX = Math.abs(x) > 0.25 ? Math.sign(x) : 0;
    const signY = Math.abs(y) > 0.25 ? Math.sign(y) : 0;
    if (signX !== 0 && Math.sign(prevX) !== signX) this.recorder.steerPress(signX, this.runMs);
    if (signY !== 0 && Math.sign(prevY) !== signY) this.recorder.steerPress(signY * 2, this.runMs);
  }

  // ------------------------------------------------------------- actions --

  shield() {
    if (this.phase !== 'running') return;
    const at = this.runMs;
    if (this.energy < SHIELD_COST) {
      sfx.falseStart();
      this.cb.onBanner('SHIELD OFFLINE — LOW POWER', 'warn', 1400);
      return;
    }
    this.energy -= SHIELD_COST;
    this.shieldAnim = 1;
    this.shieldMesh.position.set(this.x, this.y + 0.9, 0);
    this.shieldMesh.visible = true;
    sfx.shield();
    this.recorder.input('shield', at);

    // Destroy every threatening meteoroid in the window. This is a reaction
    // test, so any inbound meteoroid — even one that just spawned at the edge
    // of the fog — counts as shielded when the pulse fires.
    let destroyed = 0;
    let reflexRt: number | null = null;
    for (const m of this.meteoroids) {
      if (!m.active) continue;
      const z = m.group.position.z;
      if (z > -150 && z < 8) {
        const rt = at - (m.group.userData.onsetAt as number);
        if (m.isTrial) {
          const res = this.recorder.stimulusResponse('pvt', at);
          reflexRt = res?.rt ?? rt;
        }
        this.shatterMeteoroid(m, true);
        destroyed++;
      }
    }

    // Friendly fire: a pod caught in the shield pulse gets blasted.
    let blasted = 0;
    for (const p of this.pods) {
      if (!p.active) continue;
      const z = p.group.position.z;
      if (z > -28 && z < 8 && Math.abs(p.group.position.x - this.x) < 4.2) {
        this.blastPod(p);
        blasted++;
      }
    }

    if (destroyed > 0) {
      this.addScore(25 * destroyed);
      if (reflexRt != null && reflexRt < 300) {
        this.addScore(20);
        this.cb.onBanner('REFLEX! +20', 'good', 1100, `${reflexRt} ms`);
      }
    } else if (blasted > 0) {
      // logged inside blastPod
    } else if (at < this.fakeWindowUntil) {
      this.recorder.falseStart(at);
      this.cb.onBanner('SHIELD WASTED — NO THREAT', 'warn', 1400);
      sfx.falseStart();
    } else if (this.nextPvtAt - at < 1500 && this.nextPvtAt > at) {
      this.recorder.falseStart(at);
      this.cb.onBanner('TOO EARLY', 'warn', 1100);
      sfx.falseStart();
    }
    this.syncHud(true);
  }

  respondRadar() {
    if (!this.radarActive || this.phase !== 'running') return;
    const at = this.runMs;
    const res = this.recorder.stimulusResponse('radar', at);
    this.radarActive = false;
    this.cb.onRadarClose();
    if (res && !res.lapse) {
      this.addScore(15);
      this.cb.onBanner('SIGNAL ACKNOWLEDGED +15', 'good', 1300, `${res.rt} ms`);
    } else if (res) {
      this.addScore(5);
      this.cb.onBanner('SLOW ACK +5', 'warn', 1300, `${res.rt} ms`);
    }
    sfx.ui();
  }

  chooseRoute(choice: 'safe' | 'storm') {
    if (this.forkChosen !== null || this.phase !== 'running') return;
    const at = this.runMs;
    this.forkChosen = choice;
    this.recorder.routeChosen(choice, at);
    this.cb.onForkClose();
    if (choice === 'safe') {
      this.addScore(50);
      this.routeMult = 0.85;
      this.cb.onBanner('SAFE ROUTE +50', 'good', 1600, 'calm corridor');
    } else {
      this.addScore(200);
      this.routeMult = 1.45;
      this.stormOn = true;
      this.world.setStorm(true);
      this.cb.onBanner('STORM ROUTE +200', 'warn', 1800, '×2 scoring · heavy debris');
    }
    this.routeSegmentEnd = at + 21000;
    sfx.route(choice);
    this.syncHud(true);
  }

  // -------------------------------------------------------------- spawns --

  private spawnCrystalTrail() {
    const lane = (Math.random() * 2 - 1) * 7.5;
    const count = 5 + Math.floor(Math.random() * 3);
    const baseY = 1.6 + Math.random() * 4.6;
    const arc = (Math.random() - 0.5) * 2.4;
    const dir = Math.random() < 0.5 ? -1 : 1;
    let z = -175;
    let spawned = 0;
    for (const c of this.crystals) {
      if (c.active) continue;
      const i = spawned;
      c.active = true;
      c.group.visible = true;
      c.group.position.set(
        THREE.MathUtils.clamp(lane + Math.sin((i / count) * Math.PI) * arc * dir * 3, -10, 10),
        baseY + Math.sin((i / count) * Math.PI) * 1.5,
        z - i * 4.6
      );
      spawned++;
      if (spawned >= count) break;
    }
  }

  private spawnPod() {
    for (const p of this.pods) {
      if (p.active) continue;
      p.active = true;
      p.group.visible = true;
      p.group.position.set((Math.random() * 2 - 1) * 8.5, 1.5 + Math.random() * 5.5, -168);
      return;
    }
  }

  private spawnMeteoroid(isTrial: boolean) {
    // PVT trials stay serialized: an un-responded older stimulus is expired
    // as a miss before the next one appears.
    for (const other of this.meteoroids) {
      if (other.active && other.isTrial) {
        this.recorder.stimulusMiss('pvt');
        other.active = false;
        other.group.visible = false;
      }
    }
    for (const m of this.meteoroids) {
      if (m.active) continue;
      m.active = true;
      m.isTrial = isTrial;
      m.group.visible = true;
      m.group.position.set(this.x + (Math.random() - 0.5) * 5, THREE.MathUtils.clamp(this.y + (Math.random() - 0.5) * 3, 1.4, 8.4), -135);
      m.group.userData.onsetAt = this.runMs;
      m.group.userData.ownSpeed = 24 + Math.random() * 8 + (this.stormOn ? 8 : 0);
      return;
    }
  }

  private spawnDebris() {
    const count = 1 + (this.stormOn && Math.random() < 0.6 ? 1 : 0);
    for (let n = 0; n < count; n++) {
      for (const d of this.debris) {
        if (d.active) continue;
        d.active = true;
        d.mesh.visible = true;
        const scale = 0.9 + Math.random() * 1.1;
        d.mesh.scale.setScalar(scale);
        d.radius = 1.5 * scale;
        d.mesh.position.set(
          (Math.random() * 2 - 1) * 10,
          0.9 + Math.random() * (this.stormOn ? 5.5 : 3.5),
          -150 - n * 22
        );
        d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        break;
      }
    }
  }

  private shatterMeteoroid(m: Meteoroid, byShield: boolean) {
    m.active = false;
    m.group.visible = false;
    const p = m.group.position;
    this.burst(p.x, p.y, p.z, new THREE.Color('#ff8a4a'), 26, 10, 1.15);
    this.burst(p.x, p.y, p.z, new THREE.Color('#ffd9a0'), 14, 6, 0.9);
    sfx.blast();
    void byShield;
  }

  private blastPod(p: Pod) {
    p.active = false;
    p.group.visible = false;
    const pos = p.group.position;
    this.burst(pos.x, pos.y, pos.z, new THREE.Color('#7dff9a'), 20, 7, 1);
    this.addScore(-20);
    this.recorder.friendlyFireBlast(this.runMs);
    this.cb.onBanner('SUPPLY POD DESTROYED −20', 'bad', 1500);
    sfx.crash();
  }

  private collectPod(p: Pod) {
    p.active = false;
    p.group.visible = false;
    const pos = p.group.position;
    this.burst(pos.x, pos.y, pos.z, new THREE.Color('#7dff9a'), 16, 6, 0.9);
    this.energy = Math.min(100, this.energy + POD_ENERGY);
    this.addScore(15);
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.recorder.pickup(this.runMs, this.runMs < RUN_SECONDS * 500 ? 'first' : 'second');
    this.cb.onBanner('SUPPLY POD +15 · ENERGY +20', 'good', 1200);
    sfx.pod();
  }

  private collectCrystal(c: Crystal) {
    c.active = false;
    c.group.visible = false;
    const pos = c.group.position;
    this.burst(pos.x, pos.y, pos.z, new THREE.Color('#2ee6c8'), 10, 5, 0.75);
    this.energy = Math.min(100, this.energy + CRYSTAL_ENERGY);
    this.addScore(10);
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.recorder.pickup(this.runMs, this.runMs < RUN_SECONDS * 500 ? 'first' : 'second');
    sfx.pickup();
  }

  private addScore(delta: number) {
    const mult = this.comboMultiplier() * (this.stormOn ? 2 : 1);
    this.score = Math.max(0, this.score + Math.round(delta * (delta > 0 ? mult : 1)));
  }

  private comboMultiplier(): number {
    return 1 + Math.floor(Math.min(this.combo, 20) / 5) * 0.25;
  }

  private collide(source: 'meteoroid' | 'debris', x: number, y: number, z: number) {
    if (this.invuln > 0) return;
    this.invuln = 1.7;
    this.hitFlash = 1;
    this.shake = 1.15;
    this.combo = 0;
    this.energy = Math.max(0, this.energy - COLLISION_ENERGY);
    this.addScore(-50);
    this.recorder.collision(this.runMs);
    this.burst(x, y, z, new THREE.Color('#ff5a2a'), 30, 11, 1.3);
    this.burst(this.x, this.y + 0.8, 0, new THREE.Color('#ffb46a'), 18, 7, 1);
    this.cb.onBanner(source === 'meteoroid' ? 'IMPACT! −50' : 'ROCK STRIKE −50', 'bad', 1500);
    sfx.crash();
  }

  // ------------------------------------------------------------- director --

  /** True while a timestamp sits inside a protected window. Hazard windows
   *  keep the PVT stream clean (quiet stretches, magnetic zones, the fork);
   *  pickup windows only guard the fork overlay itself, so crystals keep
   *  flowing during quiet stretches. */
  private inExclusion(at: number, kind: 'hazard' | 'pickup', pad = 0): boolean {
    const hazardWindows: [number, number][] = [
      [33000 - pad, 45500], // quiet #1 → radar ping #1
      [44000, 59500], // magnetic #1
      [61500 - pad, 66500], // fork + gates
      [84000 - pad, 93000], // quiet #2 → radar ping #2
      [95500, 111500], // magnetic #2
    ];
    const pickupWindows: [number, number][] = [[61500 - pad, 66500]];
    const windows = kind === 'hazard' ? hazardWindows : pickupWindows;
    return windows.some(([a, b]) => at >= a && at <= b);
  }

  private director() {
    const at = this.runMs;
    const once = (key: string, fn: () => void) => {
      if (!this.fired.has(key)) {
        this.fired.add(key);
        fn();
      }
    };

    once('start', () => {
      const firstTime = loadSessions().length === 0;
      this.cb.onBanner('SOL RUN START', 'info', 1800, 'power the habitat shield');
      if (firstTime) {
        this.cb.onBanner('GREEN CRYSTALS = ENERGY', 'info', 3200, 'steer through them');
        window.setTimeout(() => {
          if (this.phase === 'running')
            this.cb.onBanner('RED ROCKS — SHIELD FAST', 'warn', 3200, 'SPACE / click / tap');
        }, 3600);
        window.setTimeout(() => {
          if (this.phase === 'running')
            this.cb.onBanner('GREEN CRATES ARE FRIENDLY', 'info', 3000, 'collect — never shield them');
        }, 8200);
      }
    });

    // --- PVT scheduler ------------------------------------------------------
    if (at >= this.nextPvtAt && !this.inExclusion(at, 'hazard', 1200) && this.forkChosen === null) {
      const fake = Math.random() < 0.25 && this.realTrials >= 2;
      if (fake) {
        this.recorder.fakeWarning(at);
        this.fakeWindowUntil = at + 1500;
        this.cb.onBanner('SENSOR ANOMALY…', 'warn', 1300);
        sfx.warn();
      } else {
        this.spawnMeteoroid(true);
        this.realTrials++;
        this.recorder.stimulusOnset('pvt', at);
        sfx.warn();
      }
      let gap = 2000 + Math.random() * 8000;
      // keep the schedule out of exclusion zones
      let guard = 0;
      while (this.inExclusion(at + gap, 'hazard', 1200) && guard++ < 30) gap += 1500;
      // guarantee a minimum number of real trials
      if (at > 95000 && this.realTrials < 8) gap = Math.min(gap, 2600);
      this.nextPvtAt = at + gap;
    }

    // --- quiet stretch → radar ping #1 ---------------------------------------
    if (at >= 33000) once('quiet1', () => this.cb.onBanner('CLEAR SECTOR', 'info', 1600, 'stay sharp'));
    if (at >= 41000 && !this.fired.has('radar1')) {
      this.fired.add('radar1');
      this.openRadar();
    }

    // --- magnetic zone #1 ------------------------------------------------------
    if (at >= 44000 && !this.fired.has('mag1')) {
      this.fired.add('mag1');
      this.startMagnetic();
    }
    if (at >= 59500 && this.fired.has('mag1') && !this.fired.has('mag1end')) {
      this.fired.add('mag1end');
      this.endMagnetic();
    }

    // --- fork -------------------------------------------------------------------
    if (at >= 62000 && !this.fired.has('fork')) {
      this.fired.add('fork');
      this.forkChosen = null;
      this.forkOpenUntil = at + FORK_WINDOW;
      this.recorder.routePrompt(at);
      this.cb.onFork(FORK_WINDOW);
      this.spawnGates();
      sfx.fork();
    }
    if (this.forkOpenUntil > 0 && this.forkChosen === null && at >= this.forkOpenUntil) {
      this.recorder.routeChosen('timeout', at);
      this.forkChosen = 'timeout';
      this.routeMult = 0.85;
      this.routeSegmentEnd = at + 21000;
      this.cb.onForkClose();
      this.cb.onBanner('AUTOPILOT: SAFE ROUTE', 'info', 1600);
    }
    if (this.routeSegmentEnd > 0 && at >= this.routeSegmentEnd && this.stormOn) {
      this.stormOn = false;
      this.world.setStorm(false);
      this.routeMult = 1;
      this.routeSegmentEnd = 0;
      this.cb.onBanner('STORM CLEARED', 'good', 1500);
    } else if (this.routeSegmentEnd > 0 && at >= this.routeSegmentEnd) {
      this.routeMult = 1;
      this.routeSegmentEnd = 0;
    }

    // --- quiet stretch → radar ping #2 ------------------------------------------
    if (at >= 90000 && !this.fired.has('radar2')) {
      this.fired.add('radar2');
      this.openRadar();
    }

    // --- magnetic zone #2 ----------------------------------------------------------
    if (at >= 96000 && !this.fired.has('mag2')) {
      this.fired.add('mag2');
      this.startMagnetic();
    }
    if (at >= 111000 && this.fired.has('mag2') && !this.fired.has('mag2end')) {
      this.fired.add('mag2end');
      this.endMagnetic();
    }

    // --- finale -------------------------------------------------------------------
    if (at >= 111000) {
      once('finale', () => {
        this.finaleBoost = 1.12;
        this.cb.onBanner('FINAL SPRINT', 'magic', 1800, 'everything counts double now');
      });
    }

    if (at >= RUN_SECONDS * 1000 && this.phase === 'running') {
      this.finishRun();
    }
  }

  private openRadar() {
    const sides: RadarPingState['side'][] = ['tl', 'tr', 'bl', 'br', 'ml', 'mr'];
    const side = sides[Math.floor(Math.random() * sides.length)]!;
    this.radarActive = true;
    this.radarOnsetAt = this.runMs;
    this.radarExpireAt = this.runMs + RADAR_WINDOW;
    this.recorder.stimulusOnset('radar', this.runMs);
    this.cb.onRadar(side, RADAR_WINDOW);
    sfx.ping();
  }

  private startMagnetic() {
    this.inverted = true;
    this.world.setMagnetic(true);
    this.recorder.magneticStart(this.runMs);
    this.cb.onBanner('MAGNETIC INTERFERENCE', 'magic', 2400, 'controls are inverted — 15 s');
    this.shake = Math.max(this.shake, 0.4);
    sfx.magnetic();
    this.syncHud(true);
  }

  private endMagnetic() {
    this.inverted = false;
    this.world.setMagnetic(false);
    this.recorder.magneticEnd(this.runMs);
    this.cb.onBanner('CONTROLS RESTORED', 'good', 1500);
    this.syncHud(true);
  }

  private spawnGates() {
    if (!this.gateSafe) {
      this.gateSafe = this.makeGate(0x4ef0d2);
      this.gateStorm = this.makeGate(0xff8a3a);
      this.scene.add(this.gateSafe, this.gateStorm);
    }
    this.gateSafe.position.set(-6.2, 4.2, -150);
    this.gateStorm.position.set(6.2, 4.2, -150);
    this.gateSafe.visible = true;
    this.gateStorm.visible = true;
  }

  // ---------------------------------------------------------------- loop --

  private tick = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, Math.max(0.0005, (now - this.lastNow) / 1000));
    this.lastNow = now;
    if (this.phase !== 'paused') {
      this.t += dt;
      this.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    const running = this.phase === 'running';

    if (this.phase === 'intro') {
      this.speed += (9 - this.speed) * Math.min(1, dt * 2);
      this.idleMotion(dt);
    } else if (this.phase === 'countdown') {
      this.countdownLeft -= dt;
      const n = Math.max(0, Math.ceil(this.countdownLeft - 0.4));
      if (n !== this.countdownShown) {
        this.countdownShown = n;
        this.cb.onCountdown(n);
        sfx.countdown(n);
      }
      this.speed += (26 - this.speed) * Math.min(1, dt * 1.2);
      this.idleMotion(dt);
      if (this.countdownLeft <= 0) {
        this.phase = 'running';
        this.recorder.reset();
        this.runMs = 0;
        this.cb.onPhase('running');
      }
    } else if (running) {
      this.runMs += dt * 1000;
      this.director();
      const target =
        (26 + Math.min(14, (this.runMs / 1000) * 0.12)) * this.routeMult * this.finaleBoost;
      this.speed += (target - this.speed) * Math.min(1, dt * 0.9);
      this.topSpeed = Math.max(this.topSpeed, this.speed);
      this.updateDriving(dt);
      this.updateEntities(dt);
      this.spawnPassive(dt);
    } else if (this.phase === 'results') {
      this.speed += (10 - this.speed) * Math.min(1, dt * 0.8);
      this.idleMotion(dt);
    }

    this.scroll += this.speed * dt;
    this.world.update(dt, this.scroll, this.speed);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.updateShieldAnim(dt);

    // hit flash + invulnerability + energy regen
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);
    this.invuln = Math.max(0, this.invuln - dt);
    if (running) this.energy = Math.min(100, this.energy + dt * 1.1);

    const groundY = terrainHeight(this.x, 0);
    this.rover.group.position.set(this.x, this.y, 0);
    this.rover.update(dt, this.t, {
      speed: this.speed,
      vx: this.vx,
      vy: this.vy,
      hitFlash: this.hitFlash,
      groundY,
      thrust: Math.min(1, Math.abs(this.vy) / 6 + 0.35),
    });

    this.hudTimer += dt;
    if (this.hudTimer > 0.1) this.syncHud();
  }

  /** Gentle autopilot drift used on the intro / countdown / results cards. */
  private idleMotion(dt: number) {
    const targetX = Math.sin(this.t * 0.4) * 4.5;
    const targetY = 2.6 + Math.sin(this.t * 0.7) * 0.9;
    this.vx = (targetX - this.x) * 1.4;
    this.vy = (targetY - this.y) * 1.4;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.steerX = 0;
    this.steerY = 0;
  }

  private updateDriving(dt: number) {
    let ix = this.steerX + this.touchX;
    let iy = this.steerY + this.touchY;
    ix = THREE.MathUtils.clamp(ix, -1, 1);
    iy = THREE.MathUtils.clamp(iy, -1, 1);
    if (this.inverted) {
      ix = -ix;
      iy = -iy;
    }
    const ACC = 72;
    this.vx += ix * ACC * dt;
    this.vy += iy * 60 * dt;
    const damp = Math.exp(-4.6 * dt);
    this.vx *= damp;
    this.vy *= damp;
    this.vx = THREE.MathUtils.clamp(this.vx, -16, 16);
    this.vy = THREE.MathUtils.clamp(this.vy, -12, 12);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // soft walls of the canyon cross-section
    if (this.x < -11.5) {
      this.x = -11.5;
      this.vx = Math.max(0, this.vx);
    }
    if (this.x > 11.5) {
      this.x = 11.5;
      this.vx = Math.min(0, this.vx);
    }
    if (this.y < 1.15) {
      this.y = 1.15;
      this.vy = Math.max(0, this.vy);
    }
    if (this.y > 8.7) {
      this.y = 8.7;
      this.vy = Math.min(0, this.vy);
    }
  }

  private spawnPassive(dt: number) {
    void dt;
    const at = this.runMs;
    if (at >= this.nextCrystalAt && !this.inExclusion(at, 'pickup', 300)) {
      this.spawnCrystalTrail();
      this.nextCrystalAt = at + (this.stormOn ? 1500 + Math.random() * 900 : 2200 + Math.random() * 1600);
    }
    if (at >= this.nextPodAt && !this.inExclusion(at, 'pickup', 300)) {
      this.spawnPod();
      this.nextPodAt = at + 9000 + Math.random() * 5000;
    }
    if (at >= this.nextDebrisAt && !this.inExclusion(at, 'hazard', 300) && at > 12000) {
      this.spawnDebris();
      this.nextDebrisAt = at + (this.stormOn ? 2200 + Math.random() * 1500 : 4200 + Math.random() * 3000);
    }
  }

  private updateEntities(dt: number) {
    const at = this.runMs;

    // crystals & pods drift with the world scroll
    for (const c of this.crystals) {
      if (!c.active) continue;
      const p = c.group.position;
      p.z += this.speed * dt;
      c.core.rotation.y += dt * 2.4;
      c.core.rotation.x += dt * 1.1;
      const pulse = 1 + Math.sin(this.t * 5 + c.phase) * 0.14;
      c.core.scale.setScalar(pulse);
      if (p.z > 22) {
        c.active = false;
        c.group.visible = false;
        continue;
      }
      if (Math.abs(p.z) < 1.7 && Math.abs(p.x - this.x) < 1.6 && Math.abs(p.y - this.y) < 1.7) {
        this.collectCrystal(c);
      }
    }
    for (const pod of this.pods) {
      if (!pod.active) continue;
      const p = pod.group.position;
      p.z += this.speed * dt;
      pod.group.rotation.y += dt * 0.8;
      p.y += Math.sin(this.t * 2 + pod.phase) * dt * 0.4;
      if (p.z > 22) {
        pod.active = false;
        pod.group.visible = false;
        continue;
      }
      if (Math.abs(p.z) < 2 && Math.abs(p.x - this.x) < 1.9 && Math.abs(p.y - this.y) < 1.9) {
        this.collectPod(pod);
      }
    }

    // meteoroids close in and home toward the rover
    for (const m of this.meteoroids) {
      if (!m.active) continue;
      const p = m.group.position;
      const own = (m.group.userData.ownSpeed as number) ?? 24;
      p.z += (this.speed + own) * dt;
      const homing = Math.min(1, dt * 1.9);
      p.x += (this.x - p.x) * homing;
      p.y += (this.y + 0.6 - p.y) * homing * 0.8;
      m.rock.rotation.x += m.rot.x * dt * 3;
      m.rock.rotation.y += m.rot.y * dt * 3;
      const markerScale = 1.7 + Math.sin(this.t * 11) * 0.35;
      m.marker.scale.setScalar(markerScale);
      m.marker.quaternion.copy(this.camera.quaternion);
      const elapsed = at - (m.group.userData.onsetAt as number);
      void elapsed;
      if (p.z >= -2.6) {
        // impact or near miss
        const hit = Math.abs(p.x - this.x) < 2.9 && Math.abs(p.y - this.y - 0.6) < 2.9;
        if (m.isTrial) this.recorder.stimulusMiss('pvt');
        m.active = false;
        m.group.visible = false;
        if (hit) {
          this.collide('meteoroid', p.x, p.y, p.z);
        } else {
          this.burst(p.x, p.y, p.z, new THREE.Color('#ff8a4a'), 12, 6, 0.9);
        }
        continue;
      }
      if (p.z > 24) {
        if (m.isTrial) this.recorder.stimulusMiss('pvt');
        m.active = false;
        m.group.visible = false;
      }
    }

    // passive debris
    for (const d of this.debris) {
      if (!d.active) continue;
      const p = d.mesh.position;
      p.z += this.speed * dt;
      d.mesh.rotation.y += d.rotSpeed * dt * 0.4;
      if (p.z > 22) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      if (Math.abs(p.z) < d.radius + 1.1 && Math.abs(p.x - this.x) < d.radius + 0.95 && Math.abs(p.y - this.y) < d.radius + 0.9) {
        this.collide('debris', p.x, p.y, p.z);
        d.active = false;
        d.mesh.visible = false;
      }
    }

    // fork gates drift past
    if (this.gateSafe?.visible) {
      this.gateSafe.position.z += this.speed * dt;
      this.gateStorm!.position.z += this.speed * dt;
      const pulse = 1 + Math.sin(this.t * 6) * 0.05;
      this.gateSafe.scale.setScalar(pulse);
      this.gateStorm!.scale.setScalar(2 - pulse);
      if (this.gateSafe.position.z > 18) {
        this.gateSafe.visible = false;
        this.gateStorm!.visible = false;
      }
    }

    // radar expiry
    if (this.radarActive && at >= this.radarExpireAt) {
      this.radarActive = false;
      this.recorder.stimulusMiss('radar');
      this.cb.onRadarClose();
      this.cb.onBanner('SIGNAL LOST', 'warn', 1400);
    }
  }

  private updateParticles(dt: number) {
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    let alive = false;
    for (let i = 0; i < this.pLife.length; i++) {
      if (this.pLife[i]! <= 0) continue;
      alive = true;
      this.pLife[i] = Math.max(0, this.pLife[i]! - dt * this.pDecay[i]!);
      this.pPos[i * 3] += this.pVel[i * 3]! * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1]! * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2]! * dt;
      this.pVel[i * 3 + 1] -= 4.5 * dt; // gravity
      this.pVel[i * 3 + 2] += this.speed * 0.35 * dt; // drift with the world
    }
    if (alive) pos.needsUpdate = true;
    (this.particles.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateShieldAnim(dt: number) {
    if (this.shieldAnim <= 0) return;
    this.shieldAnim = Math.max(0, this.shieldAnim - dt * 1.35);
    const k = 1 - this.shieldAnim; // 0→1 over the animation
    const scale = 0.35 + Math.sin(k * Math.PI) * 0.95;
    this.shieldMesh.scale.setScalar(scale);
    this.shieldMat.uniforms.uOpacity!.value = Math.sin(k * Math.PI) * 0.9;
    this.shieldMat.uniforms.uTime!.value = this.t;
    this.shieldMesh.position.set(this.x, this.y + 0.9, 0);
    if (this.shieldAnim <= 0.001) this.shieldMesh.visible = false;
  }

  private updateCamera(dt: number) {
    if (this.phase === 'results') {
      const a = this.t * 0.22;
      this.camera.position.lerp(
        new THREE.Vector3(this.x + Math.sin(a) * 10.5, this.y + 3.6, Math.cos(a) * 10.5),
        Math.min(1, dt * 2)
      );
      this.camera.lookAt(this.x, this.y + 0.8, 0);
    } else {
      const target = new THREE.Vector3(
        this.x * 0.82,
        this.y + 3.2 + (this.phase === 'countdown' ? 1.2 : 0),
        9.4
      );
      if (this.phase === 'countdown') {
        // sweep from a low front three-quarter view into the chase position
        const k = THREE.MathUtils.clamp(1 - this.countdownLeft / 3.4, 0, 1);
        const ease = k * k * (3 - 2 * k);
        target.set(
          THREE.MathUtils.lerp(this.x + 7.5, this.x * 0.82, ease),
          THREE.MathUtils.lerp(1.7, this.y + 3.2, ease),
          THREE.MathUtils.lerp(-8.5, 9.4, ease)
        );
      }
      this.camera.position.lerp(target, Math.min(1, dt * (this.phase === 'countdown' ? 6 : 5.5)));
      if (this.phase === 'countdown') {
        // during the sweep the gaze travels from the rover to the corridor
        const k = THREE.MathUtils.clamp(1 - this.countdownLeft / 3.4, 0, 1);
        const ease = k * k * (3 - 2 * k);
        const look = new THREE.Vector3(
          THREE.MathUtils.lerp(this.x, this.x * 0.88, ease),
          THREE.MathUtils.lerp(this.y + 1, this.y * 0.62 + 1.7, ease),
          THREE.MathUtils.lerp(0, -26, ease)
        );
        this.camera.lookAt(look);
      } else {
        this.camera.lookAt(this.x * 0.88, this.y * 0.62 + 1.7, -26);
      }
    }

    // shake
    if (this.shake > 0.002) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.8;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake *= Math.exp(-4.6 * dt);
    }

    // speed fov kick
    const targetFov = 58 + THREE.MathUtils.clamp((this.speed - 26) / 26, 0, 1) * 12 + (this.stormOn ? 4 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  private syncHud(force = false) {
    this.hudTimer = 0;
    this.cb.onHud({
      score: Math.round(this.score),
      energy: Math.round(this.energy),
      combo: this.combo,
      mult: this.comboMultiplier(),
      timeLeft: Math.max(0, RUN_SECONDS - this.runMs / 1000),
      speed: Math.round(this.speed),
      distance: Math.round(this.scroll),
      inverted: this.inverted,
      storm: this.stormOn,
      pvtActive: this.meteoroids.some((m) => m.active && m.isTrial),
    });
    void force;
  }

  resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
