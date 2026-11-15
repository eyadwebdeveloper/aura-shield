'use client';

/** UI + game state for Astro-Shield. The 3D engine never imports this store
 *  directly — it pushes updates through callbacks (see GameCanvas), which
 *  keeps the engine testable and the React layer free of frame-rate churn:
 *  HUD values are synced at ~10 Hz plus immediate event pushes. */
import { create } from 'zustand';
import type { CrewStreak, RunReport, RouteChoice } from './assessment';
import { loadStreak } from './assessment';
import type { AiAssessment, AiStatus } from './ai';

export type Phase = 'intro' | 'countdown' | 'running' | 'paused' | 'results';

export interface HudState {
  score: number;
  energy: number; // 0..100 shield energy
  combo: number;
  mult: number;
  timeLeft: number; // seconds
  speed: number; // units/s
  distance: number; // meters
  inverted: boolean; // magnetic interference active
  storm: boolean; // storm route active
  pvtActive: boolean; // a meteoroid currently demands a shield
}

export type BannerTone = 'info' | 'good' | 'warn' | 'bad' | 'magic';

export interface Banner {
  id: number;
  text: string;
  sub?: string;
  tone: BannerTone;
  until: number; // Date.now() expiry
}

export interface RadarPingState {
  id: number;
  side: 'tl' | 'tr' | 'bl' | 'br' | 'ml' | 'mr';
  until: number;
}

let bannerSeq = 1;
let pingSeq = 1;

interface AstroStore {
  phase: Phase;
  countdown: number; // 3..0 during countdown phase
  hud: HudState;
  banners: Banner[];
  radar: RadarPingState | null;
  forkOpen: boolean; // route-choice overlay visible
  forkDeadline: number; // Date.now() when the 2 s window closes
  muted: boolean;
  showSurgeon: boolean; // clinical view toggle on the results card
  report: RunReport | null;
  ai: AiAssessment | null; // result of the backend game-session AI
  aiStatus: AiStatus;
  streak: CrewStreak;
  lastScore: number;
  runsToday: number;

  setPhase: (p: Phase) => void;
  setCountdown: (n: number) => void;
  syncHud: (patch: Partial<HudState>) => void;
  pushBanner: (text: string, tone: BannerTone, ms?: number, sub?: string) => void;
  pruneBanners: (now: number) => void;
  openRadar: (side: RadarPingState['side'], ms: number) => void;
  closeRadar: () => void;
  openFork: (ms: number) => void;
  closeFork: () => void;
  toggleMute: () => void;
  setShowSurgeon: (v: boolean) => void;
  setReport: (r: RunReport | null) => void;
  setAi: (ai: AiAssessment | null, status: AiStatus) => void;
  bumpRunsToday: () => void;
  resetForRun: () => void;
}

const initialHud: HudState = {
  score: 0,
  energy: 100,
  combo: 0,
  mult: 1,
  timeLeft: 40,
  speed: 0,
  distance: 0,
  inverted: false,
  storm: false,
  pvtActive: false,
};

export const useAstro = create<AstroStore>((set) => ({
  phase: 'intro',
  countdown: 3,
  hud: initialHud,
  banners: [],
  radar: null,
  forkOpen: false,
  forkDeadline: 0,
  muted: false,
  showSurgeon: false,
  report: null,
  ai: null,
  aiStatus: 'idle',
  streak: { count: 0, lastDayKey: '', personalBest: 0 },
  lastScore: 0,
  runsToday: 0,

  setPhase: (p) => set({ phase: p }),
  setCountdown: (n) => set({ countdown: n }),
  syncHud: (patch) => set((s) => ({ hud: { ...s.hud, ...patch } })),
  pushBanner: (text, tone, ms = 2000, sub) =>
    set((s) => ({
      banners: [...s.banners.slice(-2), { id: bannerSeq++, text, sub, tone, until: Date.now() + ms }],
    })),
  pruneBanners: (now) =>
    set((s) => (s.banners.some((b) => b.until <= now) ? { banners: s.banners.filter((b) => b.until > now) } : s)),
  openRadar: (side, ms) => set({ radar: { id: pingSeq++, side, until: Date.now() + ms } }),
  closeRadar: () => set({ radar: null }),
  openFork: (ms) => set({ forkOpen: true, forkDeadline: Date.now() + ms }),
  closeFork: () => set({ forkOpen: false }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setShowSurgeon: (v) => set({ showSurgeon: v }),
  setReport: (r) =>
    set((s) => ({
      report: r,
      streak: r ? r.streak : loadStreak(),
      lastScore: r ? r.log.score : s.lastScore,
      showSurgeon: false,
    })),
  setAi: (ai, status) => set({ ai, aiStatus: status }),
  bumpRunsToday: () => set((s) => ({ runsToday: s.runsToday + 1 })),
  resetForRun: () =>
    set({
      hud: { ...initialHud },
      banners: [],
      radar: null,
      forkOpen: false,
      report: null,
      ai: null,
      aiStatus: 'idle',
      showSurgeon: false,
    }),
}));

/** Non-reactive bridge so overlay UI can reach the live engine instance
 *  (shield button, radar taps, route choice, pause) without re-renders. */
export const engineRef: { current: import('./engine').AstroEngine | null } = { current: null };

export type { RouteChoice };
