'use client';

/** The friendly "40-Second Crew Challenge" briefing card (dark mission-control
 *  theme) the astronaut sees before a run. Deliberately shows nothing
 *  clinical — the stealth assessment stays invisible on the crew side. */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Gem, Route, Shield, Timer, Trophy } from 'lucide-react';
import { engineRef, useAstro } from './store';
import { loadSessions, loadStreak } from './assessment';
import { initAudio } from './audio';

export default function Intro() {
  const resetForRun = useAstro((s) => s.resetForRun);
  // This component only mounts client-side (under a ssr:false dynamic import)
  // and remounts on every return to the dashboard, so a lazy initializer
  // reads fresh localStorage each time without an effect.
  const [info] = useState(() => {
    const runs = loadSessions();
    return {
      streak: loadStreak(),
      sessions: runs.length,
      lastScore: runs.length ? runs[runs.length - 1]!.score : null,
    };
  });
  const { streak, sessions, lastScore } = info;

  const launch = () => {
    initAudio();
    resetForRun();
    engineRef.current?.begin();
  };

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-gradient-to-b from-[#070a0e]/75 via-[#070a0e]/35 to-[#070a0e]/85">
      <div className="flex min-h-full items-center justify-center p-4 py-10">
        <motion.div
          initial={{ y: 26, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          className="hud-glass relative w-full max-w-lg overflow-hidden rounded-[1.75rem] p-7 text-zinc-100 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)] sm:p-9"
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl" />

          {/* header */}
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300/90">
                40-Second Crew Challenge
              </div>
              <h1 className="glow-amber mt-2 font-display text-[2.4rem] font-bold uppercase leading-[0.95] tracking-[0.04em]">
                Astro-Shield
                <span className="mt-1.5 block text-[0.85rem] font-medium tracking-[0.3em] text-zinc-400">
                  Rover &amp; Debris Run
                </span>
              </h1>
            </div>
            <div className="flex shrink-0 flex-col items-center rounded-2xl border border-amber-300/25 bg-amber-400/10 px-3.5 py-2.5">
              <Flame size={16} className="text-amber-300" />
              <div className="mt-1 font-mono text-lg font-bold leading-none tabular-nums text-amber-100">
                {streak.count}
              </div>
              <div className="mt-0.5 font-display text-[9px] font-semibold tracking-[0.16em] text-amber-200/80">
                SOL STREAK
              </div>
            </div>
          </div>

          {/* copy */}
          <p className="relative mt-5 text-[13.5px] leading-relaxed text-zinc-300">
            Pilot the rover through the canyon, power the habitat shield with energy crystals,
            and keep the crew&apos;s <strong className="font-semibold text-zinc-50">Mission Readiness Streak</strong>{' '}
            alive. Everyone&apos;s points count toward the cooperative total.
          </p>

          {/* how to play */}
          <div className="relative mt-5 grid grid-cols-3 gap-2.5">
            {[
              { icon: Gem, tint: 'bg-teal-400/15 text-teal-300', label: 'Collect crystals', sub: 'charge shield' },
              { icon: Shield, tint: 'bg-red-400/15 text-red-300', label: 'Shield red rocks', sub: 'tap / space' },
              { icon: Route, tint: 'bg-violet-400/15 text-violet-300', label: 'Pick your route', sub: 'safe or storm' },
            ].map(({ icon: Icon, tint, label, sub }) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-center">
                <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
                  <Icon size={16} />
                </div>
                <div className="mt-2 font-display text-[11.5px] font-semibold leading-tight text-zinc-100">{label}</div>
                <div className="text-[10px] font-medium text-zinc-500">{sub}</div>
              </div>
            ))}
          </div>

          {/* meta row */}
          <div className="relative mt-5 flex flex-wrap items-center gap-2 text-[11.5px] font-semibold">
            <span className="flex items-center gap-1.5 rounded-full border border-teal-300/25 bg-teal-400/10 px-3 py-1.5 font-mono text-teal-200">
              <Timer size={12} /> 0:40 run
            </span>
            {streak.personalBest > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-amber-200">
                <Trophy size={12} /> best {streak.personalBest.toLocaleString()}
              </span>
            )}
            {lastScore != null && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-zinc-400">
                last run {lastScore.toLocaleString()}
              </span>
            )}
            {sessions === 0 && (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-emerald-200">
                first run today
              </span>
            )}
          </div>

          {/* launch */}
          <button
            onClick={launch}
            className="relative mt-7 w-full rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 py-4 text-center font-display text-[15px] font-bold tracking-[0.3em] text-[#2a1604] shadow-[0_10px_30px_-8px_rgba(255,170,70,0.6)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            LAUNCH RUN
          </button>
          <p className="relative mt-3 text-center text-[10.5px] font-medium leading-relaxed text-zinc-500">
            Mouse or keyboard · touch controls on mobile · sound on for full effect.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
