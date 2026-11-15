/** Client for the AURA game-session AI (backend/server.py → POST /api/game/assess).
 *
 *  The game never depends on it: if the backend is down or slow, the results
 *  screen keeps working with the on-device rules engine in assessment.ts and
 *  simply shows an "AI offline" note. */
import type { SessionRecord } from './assessment';

export type AiState = 'nominal' | 'fatigue' | 'tension' | 'low_vigor' | 'cabin_co2';

export interface AiDriver {
  feature: string;
  label: string;
  direction: string;
  z_vs_typical: number;
  weight: number;
}

export interface AiNotice {
  level: 'info' | 'watch' | 'act';
  title: string;
  text: string;
}

export interface AiAssessment {
  simulated_training: boolean;
  model: {
    name: string;
    version: string;
    classifier: string;
    anomaly: string;
    n_train_runs: number;
    holdout_accuracy: number;
    note: string;
  };
  state: AiState;
  confidence: number;
  probabilities: Record<AiState, number>;
  strangeness: number;
  readiness: number;
  drivers: AiDriver[];
  cabin: { co2: number; verdict: 'none' | 'person' | 'mixed' | 'cabin'; text: string; cabin_probability: number };
  baseline: {
    prior_runs: number;
    ready: boolean;
    z: Record<string, number>;
    worse_than_own_range: boolean;
    worse_features?: string[];
    note: string;
  };
  pattern: { consecutive_non_nominal: number; history_states: AiState[] };
  notices: AiNotice[];
  trend: {
    signal: string;
    slope_ms_per_run: number;
    next_run_estimate: number;
    band: number;
    direction: 'slowing' | 'speeding' | 'steady';
  } | null;
}

export type AiStatus = 'idle' | 'loading' | 'ready' | 'offline';

const API_BASE = process.env.NEXT_PUBLIC_AURA_API ?? 'https://eyad1ashraff.pythonanywhere.com';

/** Ask the AI to assess one finished run. `history` = this crew member's
 *  earlier runs (oldest → newest), excluding `record`. Throws on any failure. */
export async function assessRun(record: SessionRecord, history: SessionRecord[]): Promise<AiAssessment> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${API_BASE}/api/game/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: record, co2: record.co2, history: history.slice(-10) }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`AI backend returned ${res.status}`);
    return (await res.json()) as AiAssessment;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Friendly, non-clinical wording for the crew-facing card. */
export const CREW_COPY: Record<AiState, { label: string; tip: string; tone: string }> = {
  nominal: {
    label: 'Sharp & steady',
    tip: 'Your reflexes and focus looked great today. Keep your routine going.',
    tone: 'bg-[#d8f3e1] text-[#1d5c40]',
  },
  fatigue: {
    label: 'Running a bit tired',
    tip: 'Reactions were slower than usual. A short break, water and an earlier night would help.',
    tone: 'bg-[#fff0d2] text-[#7a5a1d]',
  },
  tension: {
    label: 'Wired & quick-fingered',
    tip: 'Fast, but a few jumpy shots. Take three slow breaths before your next run.',
    tone: 'bg-[#ffe1d9] text-[#93402a]',
  },
  low_vigor: {
    label: 'Low spark today',
    tip: 'Pickups and drive dipped late in the run. A walk or a call home can lift energy.',
    tone: 'bg-[#e9e6f9] text-[#4a3d7a]',
  },
  cabin_co2: {
    label: 'Stuffy air? Not you',
    tip: 'Your play looked sluggish, but the cabin air readings are high. It may not be you at all.',
    tone: 'bg-[#dcecf9] text-[#1f4f7a]',
  },
};

export const STATE_LABEL: Record<AiState, string> = {
  nominal: 'Nominal',
  fatigue: 'Fatigue pattern',
  tension: 'Tension / impulsivity',
  low_vigor: 'Low vigor',
  cabin_co2: 'Cabin-CO₂ pattern',
};
