'use client';

/** CORPUS — interactive 3D human anatomy explorer.
 *
 * Mounts three open-CC-BY reference bodies (male, female, and a donor
 * lower-limb muscle set) as individually selectable structures over a dark
 * examination stage. Everything renders client-side from the binary chunks in
 * public/models; there is no backend.
 */
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Dock, Header } from '@/components/anatomy/chrome';
import {
  DetailPanel,
  ErrorCard,
  HoverTooltip,
  LoadingChip,
  SystemsPanel,
} from '@/components/anatomy/panels';
import { SearchPalette } from '@/components/anatomy/search';
import { CreditsDialog } from '@/components/anatomy/credits';
import { useAtlas } from '@/store/atlas';
import { useIsMobile } from '@/lib/hooks/use-media';

const Viewer = dynamic(() => import('@/components/anatomy/Viewer'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center [background:radial-gradient(120%_90%_at_50%_0%,#101821_0%,#0a0e13_55%,#070a0e_100%)]">
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-teal-400" />
        Starting the 3D stage…
      </div>
    </div>
  ),
});

export default function Home() {
  const selected = useAtlas((s) => s.selected);
  const systemsOpen = useAtlas((s) => s.systemsOpen);
  const setSystemsOpen = useAtlas((s) => s.setSystemsOpen);
  const clearSelection = useAtlas((s) => s.clearSelection);
  const setModel = useAtlas((s) => s.setModel);
  const isMobile = useIsMobile();

  // Choose the initial model after hydration so server and client render the
  // same markup; the model can be deep-linked with #model=female|muscles.
  useEffect(() => {
    const m = new URLSearchParams(location.hash.slice(1)).get('model');
    setModel(m === 'female' || m === 'muscles' ? m : 'male');
  }, [setModel]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#070a0e] text-zinc-100">
      <Header />

      <main className="relative min-h-0 flex-1">
        <Viewer />

        {/* Desktop systems panel */}
        <aside className="absolute bottom-20 left-4 top-4 z-20 hidden w-72 rounded-2xl border border-white/10 bg-[#0a0f16]/92 shadow-2xl backdrop-blur-md lg:block">
          <SystemsPanel />
        </aside>

        {/* Desktop details panel */}
        {selected.length > 0 && (
          <aside className="absolute bottom-20 right-4 top-4 z-20 hidden w-80 rounded-2xl border border-white/10 bg-[#0a0f16]/92 shadow-2xl backdrop-blur-md md:block">
            <DetailPanel />
          </aside>
        )}

        {/* Mobile systems sheet — mounted only on mobile so its modal layer
            never traps desktop canvas clicks. */}
        {isMobile && (
          <Sheet open={systemsOpen} onOpenChange={setSystemsOpen}>
            <SheetContent side="left" className="w-[85vw] max-w-sm gap-0 border-white/10 bg-[#0a0f16] p-0">
              <SheetTitle className="sr-only">Anatomical systems</SheetTitle>
              <p className="sr-only">Toggle anatomical systems on and off.</p>
              <div className="h-full [&>div]:h-full">
                <SystemsPanel onDone={() => setSystemsOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Mobile details sheet */}
        {isMobile && (
          <Sheet
            open={selected.length > 0}
            onOpenChange={(open) => {
              if (!open) clearSelection();
            }}
          >
            <SheetContent side="bottom" className="h-[68vh] gap-0 rounded-t-2xl border-white/10 bg-[#0a0f16] p-0">
              <SheetTitle className="sr-only">Structure details</SheetTitle>
              <p className="sr-only">Details about the selected structure.</p>
              <div className="h-full [&>div]:h-full">
                <DetailPanel />
              </div>
            </SheetContent>
          </Sheet>
        )}

        <Dock />
        <HoverTooltip />
        <LoadingChip />
        <ErrorCard />

        {/* Hint strip */}
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden items-center gap-2 rounded-full border border-white/[0.07] bg-[#0c1219]/80 px-3.5 py-1.5 text-[11px] text-zinc-500 backdrop-blur xl:flex">
          Drag to orbit · Scroll to zoom · Click to inspect · Double-click to isolate
        </div>
      </main>

      <SearchPalette />
      <CreditsDialog />
    </div>
  );
}
