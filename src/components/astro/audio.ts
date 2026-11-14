/** Tiny WebAudio synth — every sound effect is generated, no audio assets.
 *  The AudioContext is created lazily on the first user gesture (the launch
 *  button) to satisfy autoplay policies. Muting is a master-gain ramp. */

type Ctx = AudioContext & { _astroMaster?: GainNode };

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let muted = false;

function ac(): Ctx | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC() as Ctx;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.42;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function initAudio() {
  ac();
}

export function setMuted(v: boolean) {
  muted = v;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(v ? 0 : 0.42, ctx.currentTime + 0.08);
  }
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; vol?: number; slideTo?: number; delay?: number } = {}
) {
  const c = ac();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
  const v = (opts.vol ?? 0.25) * 0.9;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { from?: number; to?: number; vol?: number; delay?: number } = {}) {
  const c = ac();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(opts.from ?? 800, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.to ?? 200), t0 + dur);
  const g = c.createGain();
  const v = (opts.vol ?? 0.3) * 0.9;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  pickup() {
    tone(660, 0.09, { type: 'sine', vol: 0.2 });
    tone(990, 0.12, { type: 'sine', vol: 0.16, delay: 0.05 });
  },
  pod() {
    tone(523, 0.1, { vol: 0.18 });
    tone(659, 0.1, { vol: 0.18, delay: 0.07 });
    tone(784, 0.16, { vol: 0.18, delay: 0.14 });
  },
  shield() {
    noise(0.22, { from: 300, to: 2400, vol: 0.22 });
    tone(220, 0.18, { type: 'triangle', vol: 0.22, slideTo: 520 });
  },
  blast() {
    noise(0.3, { from: 1400, to: 120, vol: 0.34 });
    tone(160, 0.26, { type: 'square', vol: 0.1, slideTo: 40 });
  },
  crash() {
    noise(0.42, { from: 700, to: 60, vol: 0.5 });
    tone(110, 0.4, { type: 'sawtooth', vol: 0.22, slideTo: 30 });
  },
  warn() {
    tone(880, 0.07, { type: 'square', vol: 0.16 });
    tone(880, 0.07, { type: 'square', vol: 0.16, delay: 0.11 });
  },
  ping() {
    tone(1320, 0.24, { type: 'sine', vol: 0.14 });
    tone(1320, 0.2, { type: 'sine', vol: 0.08, delay: 0.22 });
  },
  falseStart() {
    tone(300, 0.14, { type: 'sawtooth', vol: 0.16, slideTo: 180 });
  },
  magnetic() {
    tone(620, 0.5, { type: 'triangle', vol: 0.2, slideTo: 240 });
    tone(415, 0.5, { type: 'triangle', vol: 0.14, slideTo: 160, delay: 0.12 });
  },
  fork() {
    tone(392, 0.12, { vol: 0.2 });
    tone(494, 0.12, { vol: 0.2, delay: 0.1 });
    tone(587, 0.2, { vol: 0.2, delay: 0.2 });
  },
  route(chosen: 'safe' | 'storm') {
    if (chosen === 'safe') {
      tone(523, 0.14, { vol: 0.2 });
      tone(659, 0.22, { vol: 0.2, delay: 0.1 });
    } else {
      noise(0.5, { from: 200, to: 900, vol: 0.26 });
      tone(196, 0.42, { type: 'sawtooth', vol: 0.18, slideTo: 240 });
    }
  },
  countdown(n: number) {
    tone(n > 0 ? 440 : 660, n > 0 ? 0.1 : 0.3, { vol: 0.22 });
  },
  finish() {
    tone(523, 0.14, { vol: 0.2 });
    tone(659, 0.14, { vol: 0.2, delay: 0.12 });
    tone(784, 0.14, { vol: 0.2, delay: 0.24 });
    tone(1047, 0.3, { vol: 0.22, delay: 0.36 });
  },
  ui() {
    tone(700, 0.045, { type: 'triangle', vol: 0.12 });
  },
};
