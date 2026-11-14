'use client';

/** The friendly "Daily 2-Minute Crew Challenge" dashboard card (Gluco pastel
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
    <div className="absolute inset-0 z-20 overflow-y-auto bg-gradient-to-b from-[#070a0e]/72 via-[#070a0e]/45 to-[#070a0e]/78">
      <div className="flex min-h-full items-center justify-center p-4 py-10">
        <motion.div
          initial={{ y: 26, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          className="w-full max-w-lg rounded-[2rem] border border-[#dcefe3] bg-[#f6fbf7] p-7 text-[#22352b] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.65)] sm:p-9"
        >
          {/* header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#5f8371]">
                Daily 2-Minute Crew Challenge
              </div>
              <h1 className="mt-1.5 text-[1.7rem] font-black leading-tight">
                Astro-Shield
                <span className="block text-[0.95rem] font-bold text-[#5f8371]">
                  Rover &amp; Debris Run
                </span>
              </h1>
            </div>
            <div className="flex shrink-0 flex-col items-center rounded-2xl bg-[#ffe9d4] px-3.5 py-2.5 text-[#7a4a1d]">
              <Flame size={16} className="text-[#e07b39]" />
              <div className="mt-1 font-mono text-lg font-black leading-none tabular-nums">
                {streak.count}
              </div>
              <div className="text-[9px] font-extrabold tracking-[0.14em]">SOL STREAK</div>
            </div>
          </div>

          {/* copy */}
          <p className="mt-4 rounded-2xl bg-[#e9f6ee] p-4 text-[13.5px] leading-relaxed text-[#2c463a]">
            Pilot the rover through the canyon, power the habitat shield with energy crystals,
            and keep the crew&apos;s <strong>Mission Readiness Streak</strong> alive. Everyone&apos;s
            points count toward the cooperative total.
          </p>

          {/* how to play */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {[
              { icon: Gem, tint: 'bg-[#d8f3e1] text-[#1d5c40]', label: 'Collect crystals', sub: 'charge shield' },
              { icon: Shield, tint: 'bg-[#ffe1d9] text-[#93402a]', label: 'Shield red rocks', sub: 'tap / space' },
              { icon: Route, tint: 'bg-[#e9e6f9] text-[#4a3d7a]', label: 'Pick your route', sub: 'safe or storm' },
            ].map(({ icon: Icon, tint, label, sub }) => (
              <div key={label} className="rounded-2xl border border-black/[0.04] bg-white/70 p-3 text-center">
                <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
                  <Icon size={16} />
                </div>
                <div className="mt-2 text-[11px] font-extrabold leading-tight">{label}</div>
                <div className="text-[10px] font-medium text-[#7d978a]">{sub}</div>
              </div>
            ))}
          </div>

          {/* meta row */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11.5px] font-bold">
            <span className="flex items-center gap-1.5 rounded-full bg-[#e9f6ee] px-3 py-1.5 text-[#2c463a]">
              <Timer size={12} /> 2:00 run
            </span>
            {streak.personalBest > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#fff4dd] px-3 py-1.5 text-[#7a5a1d]">
                <Trophy size={12} /> best {streak.personalBest.toLocaleString()}
              </span>
            )}
            {lastScore != null && (
              <span className="rounded-full bg-[#f0f2f5] px-3 py-1.5 text-[#54626f]">
                last run {lastScore.toLocaleString()}
              </span>
            )}
            {sessions === 0 && (
              <span className="rounded-full bg-[#d8f3e1] px-3 py-1.5 text-[#1d5c40]">first run today</span>
            )}
          </div>

          {/* launch */}
          <button
            onClick={launch}
            className="mt-6 w-full rounded-2xl bg-[#1d3a2c] py-4 text-center text-[15px] font-black tracking-[0.18em] text-[#d8f3e1] shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-[#254737] active:translate-y-0"
          >
            LAUNCH RUN
          </button>
          <p className="mt-3 text-center text-[10.5px] font-medium leading-relaxed text-[#8aa294]">
            Mouse or keyboard · touch controls on mobile · sound on for full effect.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
