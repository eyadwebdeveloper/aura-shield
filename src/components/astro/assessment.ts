/** Stealth assessment core — "Astro-Shield: Rover & Debris Run".
 *
 * Everything in this module runs invisibly while the crew member plays an
 * arcade mini-game. Raw gameplay events are recorded on the run clock (which
 * freezes during pauses, so reaction times stay honest) and reduced to the
 * clinical constructs NASA uses operationally:
 *
 *   · Psychomotor Vigilance (PVT)      — reaction time to sudden meteoroids
 *   · Vigilance lapses ("space fog")   — RT > 500 ms or missed stimuli
 *   · Tension / impulsivity (POMS T/A) — false starts & friendly-fire blasts
 *   · Disorientation (POMS Confusion)  — adaptation to inverted controls
 *   · Vigor / motivation (POMS V/F)    — risk seeking, post-error slowing,
 *                                        engagement fade, quit-after-error
 *
 * Session records persist to localStorage. Baselines are personal, not
 * population: each new run is compared against the astronaut's own rolling
 * median and MAD (median absolute deviation) of prior sessions, which is
 * exactly how the dashboard's Rule R5 ("worse than your own range on two
 * tests in a row") is phrased.
 *
 * NOTE: this is a research-inspired demo, not a medical device. Cabin CO₂
 * values are clearly labelled simulated telemetry used to demonstrate the
 * Module 6.2 "Is it me or the cabin?" cross-check.
 */

// ----------------------------------------------------------------- types --

export type TrialKind = 'pvt' | 'radar';
export type TrialOutcome = 'hit' | 'lapse' | 'miss';
export type RouteChoice = 'safe' | 'storm' | 'timeout';

export interface Trial {
  kind: TrialKind;
  onsetAt: number; // ms on the run clock
  rt: number | null;
  outcome: TrialOutcome;
}

export interface MagneticZone {
  startedAt: number;
  endedAt: number;
  /** ms until stable control (first correct press that is never followed by
   *  a reversal error or collision inside the zone), null if never reached. */
  adaptMs: number | null;
  reversalErrors: number;
  collisions: number;
}

export interface SessionLog {
  version: 1;
  startedAt: number; // wall clock (Date.now)
  durationMs: number; // run-clock duration (pauses excluded)
  trials: Trial[];
  fakeWarnings: number;
  falseStarts: number;
  friendlyFire: number;
  collisions: number;
  magnetic: MagneticZone[];
  route: { chosen: RouteChoice; decisionMs: number };
  /** steering / shield inputs used for input-rate and post-error slowing */
  inputs: { at: number; kind: 'steer' | 'shield' | 'ping' }[];
  pickupsFirstHalf: number;
  pickupsSecondHalf: number;
  score: number;
  maxCombo: number;
  distance: number;
  topSpeed: number;
}

export interface SessionRecord extends SessionLog {
  id: string;
  dayKey: string; // YYYY-MM-DD (local)
  co2: number; // simulated cabin snapshot, mmHg
}

export interface DisorientationMetrics {
  zones: number;
  adaptMsAvg: number | null;
  reversalErrors: number;
  collisions: number;
}

export interface MotivationMetrics {
  route: RouteChoice;
  decisionMs: number;
  engagementDelta: number | null;
  inputRate: number; // inputs per minute
  postErrorSlowing: number | null;
  quitAfterError: boolean;
}

export interface SessionMetrics {
  trials: number;
  hits: number;
  misses: number;
  medianRT: number | null;
  meanRT: number | null;
  fastestRT: number | null;
  slowestRT: number | null;
  lapses: number;
  lapseRate: number | null;
  radar: { trials: number; medianRT: number | null; lapses: number };
  falseStarts: number;
  friendlyFire: number;
  impulsivityScore: number; // falseStarts + friendlyFire
  disorientation: DisorientationMetrics;
  motivation: MotivationMetrics;
  readiness: number; // 0..100 demo composite
}

export type FlagLevel = 'info' | 'watch' | 'act';

export interface ClinicalFlag {
  id: 'BASELINE' | 'R5' | 'R5_STREAK' | 'M62_CABIN' | 'M62_SELF' | 'ENGAGE';
  level: FlagLevel;
  title: string;
  detail: string;
  ruleId?: string;
}

export interface BaselineInfo {
  priorSessions: number;
  medianRT: number | null;
  madRT: number | null;
  medianLapses: number | null;
  madLapses: number | null;
  /** robust z of this session's median RT against the personal baseline */
  zRT: number | null;
  zLapses: number | null;
  worseThanBaseline: boolean;
}

export interface RunReport {
  log: SessionLog;
  record: SessionRecord;
  metrics: SessionMetrics;
  baseline: BaselineInfo;
  flags: ClinicalFlag[];
  r5Streak: number;
  streak: CrewStreak;
}

export interface CrewStreak {
  count: number;
  lastDayKey: string;
  personalBest: number;
}

// -------------------------------------------------------------- utilities --

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function mad(values: number[], med: number | null): number | null {
  if (values.length === 0 || med == null) return null;
  return median(values.map((v) => Math.abs(v - med)));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function dayKeyOf(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function yesterdayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d);
  dt.setDate(dt.getDate() - 1);
  return dayKeyOf(dt);
}

// -------------------------------------------------------------- recorder --

interface PendingTrial {
  kind: TrialKind;
  onsetAt: number;
  rt: number | null;
  outcome: TrialOutcome | 'pending';
}

/** Collects raw events during one run. The engine owns the run clock and
 *  passes elapsed milliseconds to every call. */
export class Recorder {
  private trials: PendingTrial[] = [];
  private inputs: SessionLog['inputs'] = [];
  private magnetic: MagneticZone[] = [];
  private activeZone: MagneticZone | null = null;
  private zoneStableFrom: number | null = null;
  private fakeWarnings = 0;
  private falseStarts = 0;
  private friendlyFire = 0;
  private collisions = 0;
  private pickupsFirstHalf = 0;
  private pickupsSecondHalf = 0;
  private route: SessionLog['route'] = { chosen: 'timeout', decisionMs: 2000 };
  private routePromptAt: number | null = null;
  private startedAt = Date.now();
  private lastSteerDir: { dir: number; at: number } | null = null;

  reset() {
    this.trials = [];
    this.inputs = [];
    this.magnetic = [];
    this.activeZone = null;
    this.zoneStableFrom = null;
    this.fakeWarnings = 0;
    this.falseStarts = 0;
    this.friendlyFire = 0;
    this.collisions = 0;
    this.pickupsFirstHalf = 0;
    this.pickupsSecondHalf = 0;
    this.route = { chosen: 'timeout', decisionMs: 2000 };
    this.routePromptAt = null;
    this.startedAt = Date.now();
    this.lastSteerDir = null;
  }

  // -- PVT / vigilance trials ------------------------------------------------

  stimulusOnset(kind: TrialKind, at: number) {
    this.trials.push({ kind, onsetAt: at, rt: null, outcome: 'pending' });
  }

  /** Response to the most recent pending trial of a kind. */
  stimulusResponse(kind: TrialKind, at: number): { rt: number; lapse: boolean } | null {
    const t = [...this.trials].reverse().find((x) => x.kind === kind && x.outcome === 'pending');
    if (!t) return null;
    t.rt = Math.max(0, Math.round(at - t.onsetAt));
    t.outcome = t.rt > 500 ? 'lapse' : 'hit';
    return { rt: t.rt, lapse: t.outcome === 'lapse' };
  }

  /** Trial window expired with no response. */
  stimulusMiss(kind: TrialKind) {
    const t = [...this.trials].reverse().find((x) => x.kind === kind && x.outcome === 'pending');
    if (t) t.outcome = 'miss';
  }

  // -- impulsivity -----------------------------------------------------------

  fakeWarning(_at: number) {
    this.fakeWarnings += 1;
  }

  falseStart(_at: number) {
    this.falseStarts += 1;
  }

  friendlyFireBlast(_at: number) {
    this.friendlyFire += 1;
  }

  // -- inputs & post-error behaviour ------------------------------------------

  input(kind: SessionLog['inputs'][number]['kind'], at: number) {
    this.inputs.push({ at, kind });
    if (this.inputs.length > 400) this.inputs.shift();
  }

  steerPress(dir: number, at: number) {
    this.input('steer', at);
    if (this.activeZone) {
      // A rapid direction reversal (< 500 ms) is the signature of a spatial
      // disorientation error inside a magnetic inversion zone.
      const reversal =
        this.lastSteerDir != null &&
        this.lastSteerDir.dir !== dir &&
        at - this.lastSteerDir.at < 500;
      if (reversal) {
        this.activeZone.reversalErrors += 1;
        this.zoneStableFrom = null;
      } else if (this.zoneStableFrom == null) {
        this.zoneStableFrom = at;
      }
    }
    this.lastSteerDir = { dir, at };
  }

  collision(_at: number) {
    this.collisions += 1;
    if (this.activeZone) {
      this.activeZone.collisions += 1;
      this.zoneStableFrom = null;
    }
  }

  // -- magnetic zones ---------------------------------------------------------

  magneticStart(at: number) {
    this.activeZone = {
      startedAt: at,
      endedAt: at,
      adaptMs: null,
      reversalErrors: 0,
      collisions: 0,
    };
    this.zoneStableFrom = null;
    this.lastSteerDir = null;
  }

  magneticEnd(at: number) {
    if (!this.activeZone) return;
    const zone = this.activeZone;
    zone.endedAt = at;
    if (this.zoneStableFrom != null) {
      zone.adaptMs = Math.round(this.zoneStableFrom - zone.startedAt);
    }
    this.magnetic.push(zone);
    this.activeZone = null;
  }

  // -- route & pickups ----------------------------------------------------------

  routePrompt(at: number) {
    this.routePromptAt = at;
  }

  routeChosen(chosen: RouteChoice, at: number) {
    this.route = {
      chosen,
      decisionMs:
        this.routePromptAt == null ? 2000 : Math.max(0, Math.round(at - this.routePromptAt)),
    };
  }

  pickup(at: number, half: 'first' | 'second') {
    if (half === 'first') this.pickupsFirstHalf += 1;
    else this.pickupsSecondHalf += 1;
    void at;
  }

  // -- finish -------------------------------------------------------------------

  finish(meta: {
    durationMs: number;
    score: number;
    maxCombo: number;
    distance: number;
    topSpeed: number;
  }): SessionLog {
    for (const t of this.trials) {
      if (t.outcome === 'pending') t.outcome = 'miss';
    }
    return {
      version: 1,
      startedAt: this.startedAt,
      durationMs: Math.round(meta.durationMs),
      trials: this.trials.map((t) => ({
        kind: t.kind,
        onsetAt: Math.round(t.onsetAt),
        rt: t.rt,
        outcome: t.outcome === 'pending' ? 'miss' : t.outcome,
      })),
      fakeWarnings: this.fakeWarnings,
      falseStarts: this.falseStarts,
      friendlyFire: this.friendlyFire,
      collisions: this.collisions,
      magnetic: this.magnetic,
      route: this.route,
      inputs: this.inputs,
      pickupsFirstHalf: this.pickupsFirstHalf,
      pickupsSecondHalf: this.pickupsSecondHalf,
      score: Math.round(meta.score),
      maxCombo: meta.maxCombo,
      distance: Math.round(meta.distance),
      topSpeed: Math.round(meta.topSpeed),
    };
  }
}

// ----------------------------------------------------------- metrics math --

export function computeMetrics(log: SessionLog): SessionMetrics {
  const pvt = log.trials.filter((t) => t.kind === 'pvt');
  const radar = log.trials.filter((t) => t.kind === 'radar');
  const pvtHits = pvt.filter((t) => t.rt != null);
  const rts = pvtHits.map((t) => t.rt as number);
  const radarRts = radar.filter((t) => t.rt != null).map((t) => t.rt as number);

  const pvtLapses = pvt.filter((t) => t.outcome === 'lapse' || t.outcome === 'miss').length;
  const radarLapses = radar.filter((t) => t.outcome === 'lapse' || t.outcome === 'miss').length;

  const zones = log.magnetic;
  const adaptValues = zones.map((z) => z.adaptMs).filter((v): v is number => v != null);
  const disorientation: DisorientationMetrics = {
    zones: zones.length,
    adaptMsAvg: adaptValues.length ? Math.round(mean(adaptValues) as number) : null,
    reversalErrors: zones.reduce((a, z) => a + z.reversalErrors, 0),
    collisions: zones.reduce((a, z) => a + z.collisions, 0),
  };

  // Engagement: pickup rate per 30 s in each half of the run.
  const half = log.durationMs / 2;
  const firstRate = half > 0 ? (log.pickupsFirstHalf / half) * 30000 : 0;
  const secondRate = half > 0 ? (log.pickupsSecondHalf / half) * 30000 : 0;
  const engagementDelta = firstRate > 0 ? secondRate / firstRate : null;

  // Input rate & post-error slowing.
  const gaps: number[] = [];
  for (let i = 1; i < log.inputs.length; i++) {
    const gap = log.inputs[i]!.at - log.inputs[i - 1]!.at;
    if (gap > 0 && gap < 4000) gaps.push(gap);
  }
  const meanGap = mean(gaps) ?? 800;
  const ratios: number[] = [];
  let quitAfterError = false;
  for (const t of log.trials) {
    if (t.kind === 'pvt' && t.outcome === 'miss') {
      const next = log.inputs.find((i) => i.at > t.onsetAt);
      if (!next) {
        if (log.durationMs - t.onsetAt > 5000) quitAfterError = true;
      } else {
        const gap = next.at - t.onsetAt;
        if (gap > 5000) quitAfterError = true;
        if (gap > 0 && gap < 6000) ratios.push(gap / meanGap);
      }
    }
  }

  const motivation: MotivationMetrics = {
    route: log.route.chosen,
    decisionMs: log.route.decisionMs,
    engagementDelta,
    inputRate: log.durationMs > 0 ? (log.inputs.length / log.durationMs) * 60000 : 0,
    postErrorSlowing: mean(ratios) != null ? Math.round((mean(ratios) as number) * 100) / 100 : null,
    quitAfterError,
  };

  // Mission Readiness Index — a demo composite, not a validated score.
  let readiness = 100;
  readiness -= clamp((pvtLapses / Math.max(1, pvt.length)) * 100, 0, 25);
  const mrt = median(rts);
  if (mrt != null) readiness -= clamp((mrt - 220) / 12, 0, 20);
  readiness -= clamp(log.falseStarts * 4, 0, 12);
  readiness -= clamp(log.friendlyFire * 6, 0, 12);
  if (disorientation.adaptMsAvg != null) readiness -= clamp(disorientation.adaptMsAvg / 1000, 0, 8);
  if (engagementDelta != null && engagementDelta < 0.5) readiness -= 8;
  if (quitAfterError) readiness -= 8;
  readiness = clamp(Math.round(readiness), 5, 100);

  const meanRT = mean(rts);
  return {
    trials: pvt.length,
    hits: pvtHits.length,
    misses: pvt.filter((t) => t.outcome === 'miss').length,
    medianRT: mrt != null ? Math.round(mrt) : null,
    meanRT: meanRT != null ? Math.round(meanRT) : null,
    fastestRT: rts.length ? Math.round(Math.min(...rts)) : null,
    slowestRT: rts.length ? Math.round(Math.max(...rts)) : null,
    lapses: pvtLapses,
    lapseRate: pvt.length ? pvtLapses / pvt.length : null,
    radar: {
      trials: radar.length,
      medianRT: median(radarRts) != null ? Math.round(median(radarRts) as number) : null,
      lapses: radarLapses,
    },
    falseStarts: log.falseStarts,
    friendlyFire: log.friendlyFire,
    impulsivityScore: log.falseStarts + log.friendlyFire,
    disorientation,
    motivation,
    readiness,
  };
}

// ------------------------------------------------------------- baseline --

export function computeBaseline(record: SessionRecord, prior: SessionRecord[]): BaselineInfo {
  const priorMetrics = prior.map((s) => computeMetrics(s));
  const priorRT = priorMetrics.map((m) => m.medianRT).filter((v): v is number => v != null);
  const priorLapses = priorMetrics.map((m) => m.lapses);
  const medRT = median(priorRT);
  const madRTv = mad(priorRT, medRT);
  const medLapses = median(priorLapses);
  const madLapsesV = mad(priorLapses, medLapses);

  const metrics = computeMetrics(record);
  const zRT =
    medRT != null && metrics.medianRT != null
      ? madRTv && madRTv > 0
        ? (0.6745 * (metrics.medianRT - medRT)) / madRTv
        : (metrics.medianRT - medRT) / Math.max(40, medRT * 0.08)
      : null;
  const zLapses =
    medLapses != null && madLapsesV != null
      ? madLapsesV > 0
        ? (0.6745 * (metrics.lapses - medLapses)) / madLapsesV
        : metrics.lapses > medLapses
          ? 1.5
          : 0
      : null;

  const worseThanBaseline =
    prior.length > 0 && ((zRT != null && zRT >= 1.5) || (zLapses != null && zLapses >= 1.5));

  return {
    priorSessions: prior.length,
    medianRT: medRT != null ? Math.round(medRT) : null,
    madRT: madRTv != null ? Math.round(madRTv) : null,
    medianLapses: medLapses,
    madLapses: madLapsesV,
    zRT: zRT != null ? Math.round(zRT * 10) / 10 : null,
    zLapses: zLapses != null ? Math.round(zLapses * 10) / 10 : null,
    worseThanBaseline,
  };
}

// ------------------------------------------------------------- storage --

const KEY_SESSIONS = 'astroshield.sessions.v1';
const KEY_STREAK = 'astroshield.streak.v1';
const KEY_CABIN = 'astroshield.cabin.v1';
const KEY_R5 = 'astroshield.r5streak.v1';

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — results simply won't persist */
  }
}

export function loadSessions(): SessionRecord[] {
  const sessions = safeGet<unknown>(KEY_SESSIONS, []);
  if (!Array.isArray(sessions)) return [];
  return sessions.filter((s): s is SessionRecord => !!s && (s as SessionRecord).version === 1);
}

export function loadStreak(): CrewStreak {
  const s = safeGet<CrewStreak>(KEY_STREAK, { count: 0, lastDayKey: '', personalBest: 0 });
  // A streak survives if the last completed run was today or yesterday.
  if (s.lastDayKey && s.lastDayKey !== dayKeyOf() && s.lastDayKey !== yesterdayKey(dayKeyOf())) {
    return { count: 0, lastDayKey: s.lastDayKey, personalBest: s.personalBest };
  }
  return s;
}

/** Simulated cabin CO₂ snapshot for this session (Module 6.2 demo cross-check).
 *  A slow random walk between 2.3 and 6.2 mmHg so the "me or the cabin"
 *  attribution has something to work with. Clearly labelled as simulated. */
function nextCabinCO2(): number {
  const prev = safeGet<{ co2: number }>(KEY_CABIN, { co2: 3.4 });
  const next = clamp(prev.co2 + (Math.random() - 0.45) * 0.7, 2.3, 6.2);
  safeSet(KEY_CABIN, { co2: next });
  return Math.round(next * 10) / 10;
}

/** Persist a finished run, update the crew streak and the R5 two-in-a-row
 *  counter, and produce the full clinical report. */
export function saveRun(log: SessionLog): RunReport {
  const sessions = loadSessions();
  const prior = sessions.slice(-10);
  const record: SessionRecord = {
    ...log,
    id: `run-${Date.now().toString(36)}`,
    dayKey: dayKeyOf(),
    co2: nextCabinCO2(),
  };

  const metrics = computeMetrics(record);
  const baseline = computeBaseline(record, prior);

  // Rule R5: worse than the astronaut's own range. Two consecutive flagged
  // sessions escalate to an "act" card, mirroring the dashboard alert copy.
  const prevR5 = safeGet<number>(KEY_R5, 0);
  const flagged = baseline.worseThanBaseline;
  const r5Streak = flagged ? prevR5 + 1 : 0;
  safeSet(KEY_R5, r5Streak);

  const streakBefore = loadStreak();
  const today = dayKeyOf();
  let streak: CrewStreak;
  if (streakBefore.lastDayKey === today) {
    streak = streakBefore;
  } else if (streakBefore.lastDayKey === yesterdayKey(today) || streakBefore.count === 0) {
    streak = { ...streakBefore, count: streakBefore.count + 1, lastDayKey: today };
  } else {
    streak = { count: 1, lastDayKey: today, personalBest: streakBefore.personalBest };
  }
  streak.personalBest = Math.max(streakBefore.personalBest, record.score);
  safeSet(KEY_STREAK, streak);

  sessions.push(record);
  safeSet(KEY_SESSIONS, sessions.slice(-12));

  // ---- flags -------------------------------------------------------------
  const flags: ClinicalFlag[] = [];
  if (baseline.priorSessions === 0) {
    flags.push({
      id: 'BASELINE',
      level: 'info',
      title: 'Personal baseline established',
      detail:
        'First logged run. Reaction times and lapses will be compared against this session on future runs — each crew member is their own control.',
    });
  }
  if (r5Streak >= 2) {
    flags.push({
      id: 'R5_STREAK',
      level: 'act',
      title: 'Vigilance lapse',
      ruleId: 'R5',
      detail: `Reaction time and lapses were worse than your own range on ${r5Streak} tests in a row (${
        metrics.medianRT ?? '—'
      } ms median · ${metrics.lapses} lapses). Reduce workload, plan a break, and review safety-critical tasks such as EVAs.`,
    });
  } else if (flagged) {
    flags.push({
      id: 'R5',
      level: 'watch',
      ruleId: 'R5',
      title: 'Below personal range',
      detail: `This run was outside your own usual range (z_RT ${
        baseline.zRT ?? '—'
      }, z_lapses ${baseline.zLapses ?? '—'}). One more consecutive decline triggers Rule R5.`,
    });
  }
  if (flagged || r5Streak >= 2) {
    // Module 6.2 — "Is it me or the cabin?"
    if (record.co2 >= 5.0) {
      flags.push({
        id: 'M62_CABIN',
        level: 'act',
        title: 'Is it me or the cabin?',
        detail: `Cabin CO₂ is elevated (simulated telemetry: ${record.co2.toFixed(
          1
        )} mmHg). The vigilance decline is consistent with CO₂ exposure rather than the crew member — check scrubber load and increase ventilation before attributing this to the individual (Module 6.2).`,
      });
    } else {
      flags.push({
        id: 'M62_SELF',
        level: 'watch',
        title: 'Is it me or the cabin?',
        detail: `Cabin CO₂ is in the normal band (simulated telemetry: ${record.co2.toFixed(
          1
        )} mmHg), so the cabin is unlikely to explain the decline. Screen for short sleep, heavy workload or low mood, and schedule a rest day (Module 6.2).`,
      });
    }
  }
  if (
    metrics.motivation.engagementDelta != null &&
    metrics.motivation.engagementDelta < 0.5 &&
    log.durationMs > 20000
  ) {
    flags.push({
      id: 'ENGAGE',
      level: 'watch',
      title: 'Engagement faded late in the run',
      detail:
        'Pickup rate dropped by more than half in the second half of the run while the game kept offering rewards — a soft signal of fatigue or low vigor (POMS Vigor/Fatigue).',
    });
  }

  return { log, record, metrics, baseline, flags, r5Streak, streak };
}
