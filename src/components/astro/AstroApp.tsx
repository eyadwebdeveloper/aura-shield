'use client';

/** ASTRO-SHIELD app shell — top bar + the 3D game canvas with its overlay
 *  layers (HUD, intro card, results). Mounted by the root page shell next to
 *  the CORPUS anatomy explorer. */
import dynamic from 'next/dynamic';
import { Activity, Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAstro } from './store';
import Hud from './Hud';
import Intro from './Intro';
import Results from './Results';

const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0708]">
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        Spinning up the canyon…
      </div>
    </div>
  ),
});

export default function AstroApp({ onOpenAtlas }: { onOpenAtlas: () => void }) {
  const phase = useAstro((s) => s.phase);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="relative z-40 flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#080c11]/90 px-3 backdrop-blur-md sm:px-5">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-400/10">
            <Gamepad2 size={15} className="text-amber-300" />
          </div>
          <div className="leading-none">
            <div className="font-display text-[16px] font-bold tracking-[0.22em] text-zinc-50">ASTRO-SHIELD</div>
            <div className="mt-1 hidden font-display text-[9.5px] uppercase tracking-[0.24em] text-zinc-500 sm:block">
              40-Second Crew Challenge
            </div>
          </div>
        </div>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenAtlas}
          className="h-9 gap-2 rounded-lg border-teal-400/25 bg-teal-400/[0.08] pl-2.5 pr-2.5 text-[12.5px] text-teal-200/90 transition-colors hover:bg-teal-400/[0.16] hover:text-teal-100"
          aria-label="Open the Corpus 3D anatomy explorer"
        >
          <Activity size={14} />
          <span className="hidden sm:inline">Corpus Atlas</span>
        </Button>
      </header>

      <main className="relative min-h-0 flex-1 bg-[#0a0708]" role="application">
        <GameCanvas />
        <Hud />
        {phase === 'intro' && <Intro />}
        {phase === 'results' && <Results />}
      </main>
    </div>
  );
}
