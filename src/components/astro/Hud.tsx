'use client';

/** In-game HUD overlay — everything the crew member sees while flying.
 *  The layer is pointer-transparent except for real controls (radar ping,
 *  route cards, touch stick, shield button), so taps on the canvas still
 *  raise the shield. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Gauge,
  Leaf,
  Pause,
  Play,
  Radar,
  Repeat,
  RotateCcw,
  Route,
  Shield,
  ShieldAlert,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import { engineRef, useAstro, type Banner } from './store';
import { RUN_SECONDS } from './engine';
import { setMuted } from './audio';

const TONE_STYLES: Record<Banner['tone'], string> = {
  info: 'border-white/15 bg-[#0c1219]/85 text-zinc-100',
  good: 'border-emerald-400/30 bg-[#08251d]/90 text-emerald-100',
  warn: 'border-amber-400/30 bg-[#2a1c06]/90 text-amber-100',
  bad: 'border-red-400/40 bg-[#2a0d0a]/90 text-red-100',
  magic: 'border-violet-400/35 bg-[#170f2a]/90 text-violet-100',
};

const PING_POS: Record<string, string> = {
  tl: 'top-24 left-4 sm:left-8',
  tr: 'top-24 right-4 sm:right-8',
  bl: 'bottom-40 left-4 sm:left-8',
  br: 'bottom-40 right-4 sm:right-8',
  ml: 'top-1/2 left-2 -translate-y-1/2',
  mr: 'top-1/2 right-2 -translate-y-1/2',
};

function TimerRing({ left }: { left: number }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, left / RUN_SECONDS));
  const danger = left <= 20;
  return (
    <div className="relative h-16 w-16" role="timer" aria-label={`${Math.ceil(left)} seconds remaining`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={R} fill="rgba(8,12,17,0.72)" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke={danger ? '#f87171' : '#4ef0d2'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.4s' }}
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center font-mono text-sm font-bold tabular-nums ${
          danger ? 'text-red-300' : 'text-zinc-100'
        }`}
      >
        {Math.ceil(left)}
      </div>
    </div>
  );
}

function RadarPing() {
  const radar = useAstro((s) => s.radar);
  if (!radar) return null;
  return (
    <button
      key={radar.id}
      onClick={(e) => {
        e.stopPropagation();
        engineRef.current?.respondRadar();
      }}
      aria-label="Acknowledge the peripheral sensor ping"
      className={`pointer-events-auto absolute z-40 ${PING_POS[radar.side]} flex h-16 w-16 items-center justify-center`}
    >
      <motion.span
        className="absolute inset-0 rounded-full border-2 border-teal-300/70"
        animate={{ scale: [0.6, 2.1], opacity: [0.8, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
      />
      <motion.span
        className="absolute inset-0 rounded-full border border-teal-200/50"
        animate={{ scale: [0.6, 2.1], opacity: [0.6, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut', delay: 0.35 }}
      />
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-teal-300/60 bg-[#062a24]/90 text-teal-200 shadow-[0_0_24px_rgba(45,212,191,0.5)]">
        <Radar size={18} />
      </span>
    </button>
  );
}

function ForkChoice() {
  const open = useAstro((s) => s.forkOpen);
  const deadline = useAstro((s) => s.forkDeadline);
  if (!open) return null;
  const remaining = Math.max(0, deadline - Date.now());
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 px-4">
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="rounded-2xl border border-white/15 bg-[#0c1219]/90 px-5 py-2.5 text-center backdrop-blur-md"
      >
        <div className="flex items-center gap-2 text-sm font-bold tracking-[0.2em] text-zinc-100">
          <Route size={15} className="text-amber-300" /> FORK AHEAD — CHOOSE IN 2 SECONDS
        </div>
        <div className="mt-2 h-1 w-56 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-amber-300"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: remaining / 1000, ease: 'linear' }}
          />
        </div>
      </motion.div>
      <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
        <motion.button
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => engineRef.current?.chooseRoute('safe')}
          className="pointer-events-auto flex flex-1 items-center gap-4 rounded-3xl border border-emerald-300/40 bg-gradient-to-br from-[#d9f5e5] to-[#b8e6cd] p-5 text-left text-[#1d3a2c] shadow-xl"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1d3a2c]/10">
            <Leaf size={22} />
          </span>
          <span>
            <span className="block text-lg font-extrabold">SAFE ROUTE · +50</span>
            <span className="block text-xs font-medium opacity-70">left — calm corridor, low risk (←)</span>
          </span>
        </motion.button>
        <motion.button
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => engineRef.current?.chooseRoute('storm')}
          className="pointer-events-auto flex flex-1 items-center gap-4 rounded-3xl border border-orange-300/50 bg-gradient-to-br from-[#ffe3c2] to-[#ffc78f] p-5 text-left text-[#4a2a10] shadow-xl"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#4a2a10]/10">
            <Zap size={22} />
          </span>
          <span>
            <span className="block text-lg font-extrabold">STORM ROUTE · +200</span>
            <span className="block text-xs font-medium opacity-70">right — high speed, ×2 scoring (→)</span>
          </span>
        </motion.button>
      </div>
    </div>
  );
}

function TouchControls() {
  const phase = useAstro((s) => s.phase);
  const stickRef = useRef<HTMLDivElement>(null);
  const [nub, setNub] = useState({ x: 0, y: 0, active: false });
  const pointerId = useRef<number | null>(null);

  if (phase !== 'running' && phase !== 'countdown') return null;

  const RADIUS = 46;
  const handleMove = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId || !stickRef.current) return;
    const rect = stickRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (e.clientX - cx) / RADIUS;
    let dy = (e.clientY - cy) / RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setNub({ x: dx, y: dy, active: true });
    engineRef.current?.setTouchSteer(dx, -dy, true);
  };
  const end = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setNub({ x: 0, y: 0, active: false });
    engineRef.current?.setTouchSteer(0, 0, false);
  };

  return (
    <>
      <div
        ref={stickRef}
        role="application"
        aria-label="Steering stick"
        onPointerDown={(e) => {
          e.stopPropagation();
          pointerId.current = e.pointerId;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          handleMove(e);
        }}
        onPointerMove={handleMove}
        onPointerUp={end}
        onPointerCancel={end}
        className="pointer-events-auto absolute bottom-5 left-5 z-30 flex h-32 w-32 touch-none items-center justify-center rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-sm"
      >
        <div
          className="h-14 w-14 rounded-full border border-teal-200/50 bg-teal-300/25 shadow-[0_0_18px_rgba(78,240,210,0.35)]"
          style={{
            transform: `translate(${nub.x * RADIUS * 0.62}px, ${nub.y * RADIUS * 0.62}px)`,
            transition: nub.active ? 'none' : 'transform 0.15s ease-out',
          }}
        />
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-[0.18em] text-zinc-400">
          STEER
        </span>
      </div>
      <button
        aria-label="Activate shield"
        onPointerDown={(e) => {
          e.stopPropagation();
          engineRef.current?.shield();
        }}
        className="pointer-events-auto absolute bottom-6 right-5 z-30 flex h-24 w-24 touch-none flex-col items-center justify-center rounded-full border-2 border-teal-300/50 bg-[#062a24]/85 text-teal-100 shadow-[0_0_28px_rgba(45,212,191,0.35)] active:scale-95 active:bg-[#083a30]"
      >
        <Shield size={26} />
        <span className="mt-1 text-[10px] font-extrabold tracking-[0.16em]">SHIELD</span>
      </button>
    </>
  );
}

export default function Hud() {
  const phase = useAstro((s) => s.phase);
  const hud = useAstro((s) => s.hud);
  const banners = useAstro((s) => s.banners);
  const countdown = useAstro((s) => s.countdown);
  const muted = useAstro((s) => s.muted);
  const toggleMute = useAstro((s) => s.toggleMute);
  const pruneBanners = useAstro((s) => s.pruneBanners);

  const isTouch = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if (window.location.hash.includes('touch')) return true; // QA: force the touch UI
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => pruneBanners(Date.now()), 300);
    return () => window.clearInterval(id);
  }, [pruneBanners]);

  useEffect(() => {
    setMuted(muted);
  }, [muted]);

  const live = phase === 'running' || phase === 'countdown' || phase === 'paused';
  if (!live) return null;

  const energyColor =
    hud.energy > 50 ? 'bg-teal-300' : hud.energy > 25 ? 'bg-amber-300' : 'bg-red-400';

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* atmosphere tints */}
      {hud.inverted && (
        <div className="absolute inset-0 animate-pulse bg-[radial-gradient(120%_90%_at_50%_50%,transparent_60%,rgba(139,92,246,0.22)_100%)]" />
      )}
      {hud.storm && (
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,transparent_62%,rgba(255,138,58,0.2)_100%)]" />
      )}
      {hud.pvtActive && phase === 'running' && (
        <div className="absolute inset-0 animate-pulse bg-[radial-gradient(120%_90%_at_50%_50%,transparent_55%,rgba(248,88,58,0.26)_100%)]" />
      )}

      {/* top-left: score */}
      <div className="absolute left-4 top-3 flex flex-col gap-2 sm:left-6">
        <div className="rounded-2xl border border-white/10 bg-[#0c1219]/80 px-4 py-2.5 backdrop-blur-md">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">Score</div>
          <div className="font-mono text-2xl font-black tabular-nums text-zinc-50">
            {hud.score.toLocaleString()}
          </div>
        </div>
        <AnimatePresence>
          {hud.combo >= 3 && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              className="w-fit rounded-full border border-amber-300/30 bg-[#2a1c06]/85 px-3 py-1 text-xs font-bold text-amber-200"
            >
              COMBO {hud.combo} · ×{hud.mult.toFixed(2).replace(/0$/, '')}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* top-center: timer */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2">
        <TimerRing left={hud.timeLeft} />
      </div>

      {/* top-right: energy + telemetry + buttons */}
      <div className="absolute right-4 top-3 flex flex-col items-end gap-2 sm:right-6">
        <div className="rounded-2xl border border-white/10 bg-[#0c1219]/80 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            {hud.energy > 25 ? (
              <Shield size={14} className="text-teal-300" />
            ) : (
              <ShieldAlert size={14} className="animate-pulse text-red-400" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">Shield</span>
            <span className="font-mono text-xs font-bold tabular-nums text-zinc-300">{hud.energy}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${energyColor} transition-[width] duration-200`}
              style={{ width: `${hud.energy}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0c1219]/80 px-3 py-1 font-mono text-[11px] tabular-nums text-zinc-400 backdrop-blur-md">
            <Gauge size={12} className="text-zinc-500" />
            {hud.speed}
            <span className="text-zinc-600">·</span>
            {hud.distance} m
          </div>
          <button
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0c1219]/80 text-zinc-400 backdrop-blur-md hover:text-zinc-100"
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button
            aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
            onClick={(e) => {
              e.stopPropagation();
              engineRef.current?.togglePause();
            }}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0c1219]/80 text-zinc-400 backdrop-blur-md hover:text-zinc-100"
          >
            {phase === 'paused' ? <Play size={14} /> : <Pause size={14} />}
          </button>
        </div>
      </div>

      {/* banners */}
      <div className="absolute left-1/2 top-24 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-1.5 px-4">
        <AnimatePresence>
          {banners.map((b) => (
            <motion.div
              key={b.id}
              initial={{ y: -14, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className={`rounded-xl border px-4 py-2 text-center text-[13px] font-bold tracking-wide backdrop-blur-md ${TONE_STYLES[b.tone]}`}
            >
              {b.text}
              {b.sub && <div className="mt-0.5 text-[10px] font-medium opacity-70">{b.sub}</div>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* status chips */}
      <div className="absolute bottom-28 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-24">
        {hud.inverted && phase === 'running' && (
          <div className="flex items-center gap-2 rounded-full border border-violet-300/40 bg-[#170f2a]/90 px-4 py-1.5 text-xs font-extrabold tracking-[0.18em] text-violet-200 backdrop-blur-md">
            <Repeat size={13} /> CONTROLS INVERTED
          </div>
        )}
        {hud.storm && phase === 'running' && (
          <div className="flex items-center gap-2 rounded-full border border-orange-300/40 bg-[#2a1608]/90 px-4 py-1.5 text-xs font-extrabold tracking-[0.18em] text-orange-200 backdrop-blur-md">
            <Wind size={13} /> STORM · ×2 SCORING
          </div>
        )}
        {hud.pvtActive && phase === 'running' && (
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 0.55, repeat: Infinity }}
            className="flex items-center gap-2 rounded-2xl border-2 border-red-400/60 bg-[#2a0d0a]/95 px-5 py-2.5 text-sm font-black tracking-[0.14em] text-red-200 shadow-[0_0_32px_rgba(248,88,58,0.4)] backdrop-blur-md"
          >
            <AlertTriangle size={16} className="text-red-400" />
            METEOROID — SHIELD NOW
            <span className="hidden rounded bg-red-400/20 px-1.5 py-0.5 text-[10px] font-bold sm:inline">
              SPACE / CLICK / TAP
            </span>
          </motion.div>
        )}
      </div>

      {/* desktop control hints */}
      {!isTouch && phase === 'running' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.07] bg-[#0c1219]/70 px-4 py-1.5 text-[11px] text-zinc-500 backdrop-blur">
          A/D or ←/→ steer · W/S climb &amp; dive · SPACE or click = shield · P pause
        </div>
      )}

      <RadarPing />
      <ForkChoice />
      {isTouch && phase !== 'paused' && <TouchControls />}

      {/* countdown */}
      <AnimatePresence>
        {phase === 'countdown' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/35"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 2.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="text-center"
            >
              <div
                className={`font-mono text-[7rem] font-black leading-none ${
                  countdown === 0 ? 'text-teal-300' : 'text-zinc-50'
                }`}
              >
                {countdown === 0 ? 'GO' : countdown}
              </div>
              <div className="mt-2 text-xs font-bold tracking-[0.3em] text-zinc-400">
                {countdown === 0 ? 'SHIELD THE HABITAT' : 'PREPARE FOR LAUNCH'}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* paused */}
      <AnimatePresence>
        {phase === 'paused' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm"
          >
            <div className="pointer-events-auto flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-[#0c1219]/95 px-10 py-8 text-center">
              <RotateCcw size={22} className="text-zinc-500" />
              <div className="text-lg font-black tracking-[0.24em] text-zinc-100">PAUSED</div>
              <p className="max-w-56 text-xs leading-relaxed text-zinc-500">
                The mission clock is frozen — reaction measurements resume only when you do.
              </p>
              <button
                onClick={() => engineRef.current?.resume()}
                className="rounded-full bg-teal-300 px-6 py-2.5 text-sm font-extrabold text-[#062a24] hover:bg-teal-200"
              >
                Resume run
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
