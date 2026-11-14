'use client';

/** Top bar (brand, model switcher, stats, search) and bottom control dock. */
import { Activity, Gamepad2, Info, Layers3, Pause, RotateCcw, RotateCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { MODELS } from '@/lib/anatomy/types';
import { useAtlas } from '@/store/atlas';
import type { ViewId } from './engine';

export function Header({ onLaunchGame }: { onLaunchGame?: () => void }) {
  const model = useAtlas((s) => s.model);
  const setModel = useAtlas((s) => s.setModel);
  const atlas = useAtlas((s) => s.atlas);
  const setSearchOpen = useAtlas((s) => s.setSearchOpen);
  const setCreditsOpen = useAtlas((s) => s.setCreditsOpen);
  const setSystemsOpen = useAtlas((s) => s.setSystemsOpen);

  return (
    <header className="relative z-40 flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#080c11]/90 px-3 backdrop-blur-md sm:px-5">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal-400/25 bg-teal-400/10">
          <Activity size={15} className="text-teal-300" />
        </div>
        <div className="leading-none">
          <div className="text-[15px] font-bold tracking-[0.18em] text-zinc-50">CORPUS</div>
          <div className="mt-1 hidden text-[9.5px] uppercase tracking-[0.22em] text-zinc-500 sm:block">
            3D Anatomy Explorer
          </div>
        </div>
      </div>

      {/* Model switcher */}
      <nav
        aria-label="Reference model"
        className="ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto sm:ml-4 sm:justify-center"
      >
        {MODELS.map((m) => {
          const active = model === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              aria-pressed={active}
              className={`group flex shrink-0 flex-col items-start rounded-lg px-3 py-1.5 text-left transition-colors ${
                active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span
                className={`text-[13px] font-medium leading-tight ${
                  active ? 'text-zinc-50' : 'text-zinc-400 group-hover:text-zinc-200'
                }`}
              >
                {m.label}
              </span>
              <span className="mt-0.5 text-[10px] leading-tight text-zinc-500">
                {atlas && active ? `${atlas.parts.length.toLocaleString('en')} pieces · ` : ''}
                {m.dataset}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {onLaunchGame && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLaunchGame}
            className="h-9 gap-2 rounded-lg border-amber-400/25 bg-amber-400/[0.08] pl-2.5 pr-2.5 text-[12.5px] text-amber-200/90 transition-colors hover:bg-amber-400/[0.16] hover:text-amber-100"
            aria-label="Open the Astro-Shield crew challenge game"
          >
            <Gamepad2 size={14} />
            <span className="hidden sm:inline">Astro-Shield</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSearchOpen(true)}
          className="h-9 gap-2 rounded-lg border-white/10 bg-white/[0.03] pl-2.5 pr-2 text-[12.5px] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200"
          aria-label="Search structures"
        >
          <Search size={14} />
          <span className="hidden md:inline">Search</span>
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 md:inline">
            /
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 lg:hidden"
          onClick={() => setSystemsOpen(true)}
          aria-label="Open systems panel"
        >
          <Layers3 size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
          onClick={() => setCreditsOpen(true)}
          aria-label="Sources and credits"
        >
          <Info size={17} />
        </Button>
      </div>
    </header>
  );
}

const VIEWS: { id: ViewId; label: string; glyph: string; title: string }[] = [
  { id: 'three-quarter', label: '¾', glyph: '¾', title: 'Three-quarter view' },
  { id: 'front', label: 'F', glyph: 'F', title: 'Front view' },
  { id: 'side', label: 'S', glyph: 'S', title: 'Side view' },
  { id: 'back', label: 'B', glyph: 'B', title: 'Back view' },
];

export function Dock() {
  const explode = useAtlas((s) => s.explode);
  const setExplode = useAtlas((s) => s.setExplode);
  const view = useAtlas((s) => s.view);
  const setView = useAtlas((s) => s.setView);
  const autoRotate = useAtlas((s) => s.autoRotate);
  const toggleRotate = useAtlas((s) => s.toggleRotate);
  const resetAll = useAtlas((s) => s.resetAll);

  const label =
    explode > 0.95 ? 'Anatomical inventory' : explode > 0.05 ? 'Separated' : 'Assembled';

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-[#0c1219]/92 px-3 py-2.5 shadow-2xl backdrop-blur-md sm:gap-3 sm:px-4">
      {/* Views */}
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Camera view">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            title={v.title}
            aria-label={v.title}
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
            className={`h-8 w-8 rounded-lg text-[12px] font-semibold transition-colors ${
              view === v.id
                ? 'bg-teal-400/15 text-teal-300'
                : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200'
            }`}
          >
            {v.glyph}
          </button>
        ))}
      </div>

      <div className="h-8 w-px shrink-0 bg-white/[0.07]" />

      {/* Explode */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          <span className="truncate">{label}</span>
          <span className="tabular-nums text-teal-300/90">{Math.round(explode * 100)}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[Math.round(explode * 100)]}
          onValueChange={(v) => setExplode((Array.isArray(v) ? v[0] : v) / 100)}
          aria-label="Explode anatomy"
          className="py-1 [&_[data-slot=slider-range]]:bg-teal-400 [&_[data-slot=slider-thumb]]:border-teal-300 [&_[data-slot=slider-thumb]]:bg-[#0c1219] [&_[data-slot=slider-track]]:bg-white/10"
        />
      </div>

      <div className="h-8 w-px shrink-0 bg-white/[0.07]" />

      {/* Rotate + reset */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          title={autoRotate ? 'Pause rotation' : 'Auto rotate'}
          aria-label={autoRotate ? 'Pause rotation' : 'Auto rotate'}
          aria-pressed={autoRotate}
          onClick={toggleRotate}
          disabled={explode > 0.4}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
            autoRotate ? 'bg-teal-400/15 text-teal-300' : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200'
          }`}
        >
          {autoRotate ? <Pause size={14} /> : <RotateCw size={14} />}
        </button>
        <button
          title="Reset view and layers"
          aria-label="Reset view and layers"
          onClick={resetAll}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  );
}
