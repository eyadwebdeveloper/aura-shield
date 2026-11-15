'use client';

/** Results — two faces of the same data.
 *
 *  CREW VIEW (default): a friendly pastel card that only talks about points,
 *  streaks and fun stats. This is all the astronaut ever needs to see.
 *
 *  FLIGHT SURGEON VIEW (toggle): the clinical readout of the stealth
 *  assessment — PVT reaction times, lapses, impulsivity, disorientation,
 *  decision bias, personal baseline (rolling median ± MAD), the R5 rule card,
 *  the AURA game-AI readout (backend/aura_ai_kit tier 3) and the Module 6.2 "Is it me or the cabin?" cross-check.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowLeftRight,
  Brain,
  ChevronLeft,
  Flag,
  FlaskConical,
  Gauge,
  HeartPulse,
  Repeat,
  Shield,
  Sparkles,
  Stethoscope,
  Timer,
  Trophy,
  Wind,
  Zap,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { engineRef, useAstro } from './store';
import { CREW_COPY, STATE_LABEL, type AiAssessment, type AiState } from './ai';
import { computeMetrics, loadSessions, type ClinicalFlag, type SessionRecord } from './assessment';

const PASTEL_CARD = 'rounded-[1.6rem] border border-black/[0.05] bg-white/75';

function StatChip({
  icon: Icon,
  tint,
  value,
  label,
}: {
  icon: typeof Gauge;
  tint: string;
  value: string;
  label: string;
}) {
  return (
    <div className={`${PASTEL_CARD} flex items-center gap-3 p-3`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-[15px] font-bold tabular-nums">{value}</span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#7d978a]">
          {label}
        </span>
      </span>
    </div>
  );
}

function ReadinessRing({ value }: { value: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const color = value >= 70 ? '#2dd4bf' : value >= 45 ? '#fbbf24' : '#f87171';
  return (
    <div className="relative h-24 w-24 shrink-0" aria-label={`Mission readiness index ${value} of 100`}>
      <svg viewBox="0 0 84 84" className="h-24 w-24 -rotate-90">
        <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - value / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-bold tabular-nums" style={{ color }}>
          {value}
        </span>
        <span className="text-[8px] font-bold tracking-[0.14em] text-zinc-500">READINESS</span>
      </div>
    </div>
  );
}

function TrialStrip({ report }: { report: NonNullable<ReturnType<typeof useAstro.getState>['report']> }) {
  const pvt = report.log.trials.filter((t) => t.kind === 'pvt');
  if (pvt.length === 0) return <p className="text-xs text-zinc-500">No PVT trials recorded.</p>;
  const maxRt = Math.max(600, ...pvt.map((t) => t.rt ?? 0));
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">
        {pvt.map((t, i) => {
          const h = t.rt == null ? 100 : Math.max(8, (t.rt / maxRt) * 100);
          const color = t.outcome === 'hit' ? '#2dd4bf' : t.outcome === 'lapse' ? '#fbbf24' : '#f87171';
          return (
            <div
              key={i}
              title={`Trial ${i + 1}: ${t.rt != null ? `${t.rt} ms` : 'no response'} — ${t.outcome}`}
              className="w-full min-w-[6px] max-w-[26px] rounded-t-sm transition-opacity hover:opacity-70"
              style={{ height: `${h}%`, background: color, opacity: t.outcome === 'miss' ? 0.85 : 1 }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-semibold text-zinc-500">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-teal-400" /> hit</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" /> lapse &gt; 500 ms</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-400" /> miss</span>
      </div>
    </div>
  );
}

function FlagCard({ flag }: { flag: ClinicalFlag }) {
  const styles: Record<ClinicalFlag['level'], string> = {
    act: 'border-red-400/40 bg-[#1d0b09] text-red-200',
    watch: 'border-amber-400/35 bg-[#1f1503] text-amber-200',
    info: 'border-teal-400/30 bg-[#07211d] text-teal-200',
  };
  const label: Record<ClinicalFlag['level'], string> = {
    act: 'ACT',
    watch: 'WATCH',
    info: 'INFO',
  };
  return (
    <div className={`rounded-2xl border p-4 ${styles[flag.level]}`}>
      <div className="flex items-center gap-2">
        {flag.ruleId && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold">
            {flag.ruleId}
          </span>
        )}
        <span className="text-[10px] font-bold tracking-[0.2em] opacity-70">{label[flag.level]}</span>
      </div>
      <div className="mt-1.5 text-sm font-extrabold">{flag.title}</div>
      <p className="mt-1 text-[12px] leading-relaxed opacity-85">{flag.detail}</p>
    </div>
  );
}

// ------------------------------------------------------------------- AI ----

/** Friendly AI debrief on the crew card. Never clinical; falls back quietly. */
function CrewAiCard() {
  const ai = useAstro((s) => s.ai);
  const status = useAstro((s) => s.aiStatus);

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#cfe4d6] bg-white/70 p-3.5">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#4aa57c]" />
        <div className="text-[12.5px] font-semibold text-[#5f8371]">AI coach is reading your run…</div>
      </div>
    );
  }
  if (status === 'offline' || !ai) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-[#cfe4d6] p-3 text-center text-[11.5px] font-medium text-[#8aa294]">
        AI coach is offline. Your points and streak are saved.
      </div>
    );
  }
  const copy = CREW_COPY[ai.state];
  const top = ai.drivers[0];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-2xl border border-[#cfe4d6] bg-white/80 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5f8371]">
          <Sparkles size={13} /> AI coach
        </div>
        <span className={`rounded-full px-3 py-1 text-[11.5px] font-bold ${copy.tone}`}>{copy.label}</span>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#1d3a2c] text-[#d8f3e1]">
          <div className="font-display text-2xl font-bold leading-none tabular-nums">{ai.readiness}</div>
          <div className="mt-0.5 text-[8.5px] font-bold tracking-[0.14em] opacity-80">READY</div>
        </div>
        <p className="text-[12.5px] leading-relaxed text-[#2c463a]">
          {copy.tip}
          {top && ai.state !== 'nominal' && ai.state !== 'cabin_co2' && (
            <span className="mt-1 block text-[11px] text-[#7d978a]">
              Biggest signal: {top.label} was {top.direction} than usual.
            </span>
          )}
        </p>
      </div>
      {ai.pattern.consecutive_non_nominal >= 2 && (
        <div className="mt-3 rounded-xl bg-[#fff4dd] px-3 py-2 text-[11.5px] font-semibold text-[#7a5a1d]">
          {ai.pattern.consecutive_non_nominal} runs in a row felt off. Consider a lighter day, and tell your crew
          medic if it continues.
        </div>
      )}
    </motion.div>
  );
}

const STATE_BAR: Record<AiState, string> = {
  nominal: 'bg-teal-400',
  fatigue: 'bg-amber-400',
  tension: 'bg-red-400',
  low_vigor: 'bg-violet-400',
  cabin_co2: 'bg-sky-400',
};

/** Full model readout for the flight surgeon. */
function AiPanel({ ai, status }: { ai: AiAssessment | null; status: string }) {
  const header = (
    <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-zinc-400">
      <Brain size={13} /> AURA GAME AI · TIER 3
    </div>
  );
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="mt-4">
        {header}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0c1219]/80 p-4 text-[12.5px] text-zinc-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-teal-300" /> Model is analysing this run…
        </div>
      </div>
    );
  }
  if (!ai) {
    return (
      <div className="mt-4">
        {header}
        <div className="rounded-2xl border border-amber-400/25 bg-[#1f1503] p-4 text-[12.5px] leading-relaxed text-amber-200">
          AI backend unreachable, so only the on-device rules engine below is shown. Start it with{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">python backend/server.py</code>.
        </div>
      </div>
    );
  }
  const states = (Object.keys(ai.probabilities) as AiState[]).sort((a, b) => ai.probabilities[b] - ai.probabilities[a]);
  const noticeStyle = {
    act: 'border-red-400/40 bg-[#1d0b09] text-red-200',
    watch: 'border-amber-400/35 bg-[#1f1503] text-amber-200',
    info: 'border-teal-400/30 bg-[#07211d] text-teal-200',
  } as const;
  const cabinTone =
    ai.cabin.verdict === 'cabin'
      ? 'border-sky-400/40 bg-[#07192a] text-sky-200'
      : ai.cabin.verdict === 'mixed'
        ? 'border-amber-400/30 bg-[#1f1503] text-amber-200'
        : 'border-white/10 bg-[#0c1219]/80 text-zinc-300';
  return (
    <div className="mt-4">
      {header}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* classification */}
        <div className="rounded-2xl border border-white/10 bg-[#0c1219]/80 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-display text-lg font-bold text-zinc-50">{STATE_LABEL[ai.state]}</div>
            <div className="font-mono text-xs text-zinc-400">confidence {Math.round(ai.confidence * 100)}%</div>
          </div>
          <div className="mt-3 space-y-1.5">
            {states.map((st) => (
              <div key={st} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-32 shrink-0 text-zinc-400">{STATE_LABEL[st]}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${STATE_BAR[st]}`} style={{ width: `${Math.round(ai.probabilities[st] * 100)}%` }} />
                </div>
                <span className="w-9 text-right font-mono text-zinc-300">{Math.round(ai.probabilities[st] * 100)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11.5px] text-zinc-400">
            <span className="w-32 shrink-0">Strangeness (IsolationForest)</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-fuchsia-400" style={{ width: `${Math.round(ai.strangeness * 100)}%` }} />
            </div>
            <span className="w-9 text-right font-mono text-zinc-300">{ai.strangeness.toFixed(2)}</span>
          </div>
          {ai.drivers.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="mb-1.5 text-[10px] font-bold tracking-[0.2em] text-zinc-500">WHY (TOP DRIVERS)</div>
              <ul className="space-y-1 text-[12px] text-zinc-300">
                {ai.drivers.map((d) => (
                  <li key={d.feature}>
                    {d.label} <span className="text-zinc-500">{d.direction}</span>{' '}
                    <span className="font-mono text-zinc-400">(z {d.z_vs_typical > 0 ? '+' : ''}{d.z_vs_typical})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* cabin, baseline, trend */}
        <div className="space-y-3">
          <div className={`rounded-2xl border p-4 ${cabinTone}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold tracking-[0.2em] opacity-70">IS IT ME OR THE CABIN?</div>
              <div className="font-mono text-[11px] opacity-80">
                cabin-cause p = {(ai.cabin.cabin_probability * 100).toFixed(0)}%
              </div>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed opacity-90">{ai.cabin.text}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0c1219]/80 p-4 text-[12px] text-zinc-300">
            <div className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">PERSONAL BASELINE</div>
            <p className="mt-1.5 leading-relaxed">{ai.baseline.note}</p>
            {ai.baseline.ready && (
              <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px]">
                {(['median_rt', 'lapse_rate', 'radar_rt', 'engagement'] as const).map((k) => (
                  <span key={k} className="rounded-full bg-white/[0.06] px-2.5 py-1">
                    {k.replace('_', ' ')} z {ai.baseline.z[k] ?? 0}
                  </span>
                ))}
              </div>
            )}
            {ai.trend && (
              <p className="mt-2.5 text-zinc-400">
                Trend: reaction time is <strong className="text-zinc-200">{ai.trend.direction}</strong> (
                {ai.trend.slope_ms_per_run > 0 ? '+' : ''}
                {ai.trend.slope_ms_per_run} ms/run). Next run expected near {ai.trend.next_run_estimate} ± {ai.trend.band} ms.
              </p>
            )}
          </div>
        </div>
      </div>

      {ai.notices.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {ai.notices.map((n) => (
            <div key={n.title} className={`rounded-2xl border p-4 ${noticeStyle[n.level]}`}>
              <div className="text-[10px] font-bold tracking-[0.2em] opacity-70">AI NOTICE · {n.level.toUpperCase()}</div>
              <div className="mt-1.5 text-sm font-extrabold">{n.title}</div>
              <p className="mt-1 text-[12px] leading-relaxed opacity-85">{n.text}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-600">
        {ai.model.name} v{ai.model.version}: {ai.model.classifier.replace('_', ' ')} + {ai.model.anomaly.replace('_', ' ')},
        trained on {ai.model.n_train_runs.toLocaleString()} simulated runs (held-out accuracy{' '}
        {Math.round(ai.model.holdout_accuracy * 100)}%). {ai.model.note}
      </p>
    </div>
  );
}

function SurgeonView() {
  const report = useAstro((s) => s.report);
  const setShowSurgeon = useAstro((s) => s.setShowSurgeon);
  const ai = useAstro((s) => s.ai);
  const aiStatus = useAstro((s) => s.aiStatus);
  // Client-only component — lazy initializer reads the session history fresh.
  const [history] = useState<SessionRecord[]>(() => loadSessions());

  const chartData = useMemo(() => {
    if (!report) return [];
    const rows = history.slice(-9).map((s, i) => {
      const m = computeMetrics(s);
      return { name: `${i + 1}`, rt: m.medianRT, lapses: m.lapses };
    });
    const m = report.metrics;
    rows.push({
      name: 'now',
      rt: m.medianRT,
      lapses: m.lapses,
    });
    return rows;
  }, [history, report]);

  if (!report) return null;
  const { metrics: m, baseline: b, log } = report;

  const cards = [
    {
      icon: Timer,
      label: 'PVT median RT',
      value: m.medianRT != null ? `${m.medianRT} ms` : '—',
      sub: b.medianRT != null ? `personal ${b.medianRT} ± ${b.madRT ?? 0} ms · z ${b.zRT ?? '—'}` : 'baseline run',
    },
    {
      icon: Zap,
      label: 'Lapses > 500 ms / miss',
      value: `${m.lapses} / ${m.trials}`,
      sub: m.lapseRate != null ? `${Math.round(m.lapseRate * 100)}% of trials` : 'no trials',
    },
    {
      icon: Flag,
      label: 'False starts',
      value: `${m.falseStarts}`,
      sub: `of ${log.fakeWarnings} fake warnings + premature`,
    },
    {
      icon: Shield,
      label: 'Friendly fire (pods)',
      value: `${m.friendlyFire}`,
      sub: 'impulsivity (POMS tension/anger)',
    },
    {
      icon: Repeat,
      label: 'Inversion adaptation',
      value: m.disorientation.adaptMsAvg != null ? `${(m.disorientation.adaptMsAvg / 1000).toFixed(1)} s` : '—',
      sub: `${m.disorientation.reversalErrors} reversals · ${m.disorientation.collisions} hits`,
    },
    {
      icon: ArrowLeftRight,
      label: 'Route decision',
      value: m.motivation.route.toUpperCase(),
      sub: `decided in ${m.motivation.decisionMs} ms`,
    },
    {
      icon: Brain,
      label: 'Post-error slowing',
      value: m.motivation.postErrorSlowing != null ? `×${m.motivation.postErrorSlowing}` : '—',
      sub: m.motivation.quitAfterError ? 'stopped responding after an error' : 'kept flying after errors',
    },
    {
      icon: HeartPulse,
      label: 'Engagement Δ (2nd half)',
      value: m.motivation.engagementDelta != null ? `×${m.motivation.engagementDelta.toFixed(2)}` : '—',
      sub: `${Math.round(m.motivation.inputRate)} inputs/min`,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute inset-0 z-30 overflow-y-auto bg-[#070a0e]/94 backdrop-blur-md"
    >
      <div className="mx-auto max-w-4xl p-4 pb-14 sm:p-8">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] text-teal-300">
              <Stethoscope size={13} /> FLIGHT SURGEON VIEW
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-zinc-50">Stealth assessment — {report.record.id}</h2>
            <p className="mt-1 text-[11.5px] text-zinc-500">
              Derived from in-game behaviour · PVT &amp; POMS constructs · personal baseline = rolling median &amp; MAD
              of prior sessions
            </p>
          </div>
          <button
            onClick={() => setShowSurgeon(false)}
            className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/10"
          >
            <ChevronLeft size={13} className="mr-1 inline" /> Crew view
          </button>
        </div>

        {/* readiness + summary */}
        <div className="mt-5 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0c1219]/80 p-5 sm:flex-row sm:items-center">
          <ReadinessRing value={ai ? ai.readiness : m.readiness} />
          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
            <div>
              <div className="text-zinc-500">Trials answered</div>
              <div className="font-mono font-bold text-zinc-100">{m.hits} / {m.trials}</div>
            </div>
            <div>
              <div className="text-zinc-500">Fastest / slowest</div>
              <div className="font-mono font-bold text-zinc-100">
                {m.fastestRT ?? '—'} / {m.slowestRT ?? '—'} ms
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Radar pings (lapses)</div>
              <div className="font-mono font-bold text-zinc-100">
                {m.radar.trials} ({m.radar.lapses})
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Collisions</div>
              <div className="font-mono font-bold text-zinc-100">{log.collisions}</div>
            </div>
            <div>
              <div className="text-zinc-500">Distance / top speed</div>
              <div className="font-mono font-bold text-zinc-100">
                {log.distance} m / {log.topSpeed}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Cabin CO₂ (simulated)</div>
              <div className="font-mono font-bold text-zinc-100">{report.record.co2.toFixed(1)} mmHg</div>
            </div>
          </div>
        </div>

        {/* metric cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-[#0c1219]/80 p-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                <Icon size={12} /> {label}
              </div>
              <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-zinc-50">{value}</div>
              <div className="mt-1 text-[10.5px] leading-snug text-zinc-500">{sub}</div>
            </div>
          ))}
        </div>

        {/* trial strip */}
        <div className="mt-4 rounded-3xl border border-white/10 bg-[#0c1219]/80 p-5">
          <div className="mb-3 text-[11px] font-bold tracking-[0.2em] text-zinc-400">
            PVT TRIAL-BY-TRIAL — meteoroid → shield reaction times
          </div>
          <TrialStrip report={report} />
        </div>

        {/* trend */}
        {history.length > 0 && (
          <div className="mt-4 rounded-3xl border border-white/10 bg-[#0c1219]/80 p-5">
            <div className="mb-3 text-[11px] font-bold tracking-[0.2em] text-zinc-400">
              SESSION TREND — median RT vs personal baseline
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} stroke="rgba(255,255,255,0.15)" />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} stroke="rgba(255,255,255,0.15)" domain={[0, 900]} />
                  <Tooltip
                    contentStyle={{
                      background: '#0c1219',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#a1a1aa' }}
                  />
                  {b.medianRT != null && (
                    <ReferenceLine
                      y={b.medianRT}
                      stroke="#2dd4bf"
                      strokeDasharray="5 4"
                      label={{ value: 'baseline', fill: '#2dd4bf', fontSize: 10, position: 'insideTopRight' }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="rt"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#fbbf24' }}
                    name="median RT (ms)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* AI model readout */}
        <AiPanel ai={ai} status={aiStatus} />

        {/* flags */}
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-zinc-400">
            <Activity size={13} /> RULES ENGINE &amp; MODULE 6.2 CROSS-CHECK
          </div>
          {report.flags.length === 0 ? (
            <div className="rounded-2xl border border-teal-400/25 bg-[#07211d] p-4 text-[12.5px] text-teal-200">
              All metrics inside the personal range — no flags raised this session.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {report.flags.map((f) => (
                <FlagCard key={f.id} flag={f} />
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 flex items-start gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-[11px] leading-relaxed text-zinc-500">
          <FlaskConical size={14} className="mt-0.5 shrink-0" />
          Research-inspired demonstration of a stealth assessment workflow, not a medical device.
          Reaction-time and lapse constructs follow the logic of the PVT; mood constructs follow POMS
          dimensions. Cabin CO₂ values are simulated telemetry used to demonstrate the Module 6.2
          &ldquo;is it me or the cabin?&rdquo; attribution rule.
        </p>
      </div>
    </motion.div>
  );
}

export default function Results() {
  const report = useAstro((s) => s.report);
  const showSurgeon = useAstro((s) => s.showSurgeon);
  const setShowSurgeon = useAstro((s) => s.setShowSurgeon);
  const resetForRun = useAstro((s) => s.resetForRun);
  const setPhase = useAstro((s) => s.setPhase);
  const hud = useAstro((s) => s.hud);

  if (!report) return null;
  const { log, metrics: m, streak } = report;
  const newBest = log.score >= streak.personalBest;
  const pickups = log.pickupsFirstHalf + log.pickupsSecondHalf;
  const reflexes = log.trials.filter((t) => t.kind === 'pvt' && t.rt != null && t.rt < 300).length;

  if (showSurgeon) return <SurgeonView />;

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-gradient-to-b from-[#070a0e]/70 via-[#070a0e]/40 to-[#070a0e]/80">
      <div className="flex min-h-full items-center justify-center p-4 py-10">
        <motion.div
          initial={{ y: 26, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          className="w-full max-w-lg rounded-[2rem] border border-[#dcefe3] bg-[#f6fbf7] p-7 text-[#22352b] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.65)] sm:p-9"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5f8371]">
                Daily Astro-Run Complete!
              </div>
              <div className="mt-2 font-display text-[2.8rem] font-bold leading-none tabular-nums">
                {log.score.toLocaleString()}
                <span className="ml-1 text-base font-bold text-[#5f8371]">pts</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center rounded-2xl bg-[#ffe9d4] px-3.5 py-2.5 text-[#7a4a1d]">
              <Trophy size={16} className="text-[#d9922b]" />
              <div className="mt-1 font-mono text-lg font-bold leading-none tabular-nums">
                {streak.count}
              </div>
              <div className="text-[9px] font-extrabold tracking-[0.14em]">SOL STREAK</div>
            </div>
          </div>

          {newBest && (
            <div className="mt-3 w-fit rounded-full bg-[#fff4dd] px-3 py-1 text-[11px] font-extrabold text-[#7a5a1d]">
              NEW PERSONAL BEST!
            </div>
          )}

          <p className="mt-3 rounded-2xl bg-[#e9f6ee] p-3.5 text-[13px] leading-relaxed text-[#2c463a]">
            Shield energy held at <strong>{hud.energy}%</strong> through the final stretch — the habitat
            thanks you. Your points keep the crew&apos;s Mission Readiness Streak alive.
          </p>

          <CrewAiCard />

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatChip icon={Wind} tint="bg-[#d8f3e1] text-[#1d5c40]" value={`${log.distance} m`} label="distance" />
            <StatChip icon={Zap} tint="bg-[#ffe1d9] text-[#93402a]" value={`${reflexes}`} label="reflex saves" />
            <StatChip icon={Gauge} tint="bg-[#e9e6f9] text-[#4a3d7a]" value={`${log.topSpeed}`} label="top speed" />
            <StatChip icon={Activity} tint="bg-[#d8f3e1] text-[#1d5c40]" value={`${pickups}`} label="pickups" />
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <button
              onClick={() => {
                resetForRun();
                engineRef.current?.begin();
              }}
              className="flex-1 rounded-2xl bg-[#1d3a2c] py-3.5 text-center text-sm font-bold tracking-[0.16em] text-[#d8f3e1] transition-transform hover:-translate-y-0.5 hover:bg-[#254737]"
            >
              RUN AGAIN
            </button>
            <button
              onClick={() => setPhase('intro')}
              className="flex-1 rounded-2xl border border-[#c4dccc] bg-white/70 py-3.5 text-center text-sm font-bold tracking-[0.16em] text-[#22352b] transition-colors hover:bg-white"
            >
              BACK TO DASHBOARD
            </button>
          </div>

          <button
            onClick={() => setShowSurgeon(true)}
            className="mx-auto mt-4 flex items-center gap-1.5 text-[11px] font-bold text-[#93a99b] underline decoration-dotted underline-offset-4 hover:text-[#5f8371]"
          >
            <Stethoscope size={12} /> Flight surgeon view
          </button>
        </motion.div>
      </div>
    </div>
  );
}
