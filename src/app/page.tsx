'use client';

/** App shell — hosts the two 3D applications:
 *  · ASTRO-SHIELD  — playable 3D crew challenge with stealth assessment
 *  · CORPUS        — interactive 3D human anatomy explorer (atlas viewer)
 *
 * The choice persists in localStorage and can be deep-linked with #atlas.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

const AtlasApp = dynamic(() => import('@/components/anatomy/AtlasApp'), {
  ssr: false,
  loading: () => <Splash label="Loading the anatomy stage…" dot="#2dd4bf" />,
});

const AstroApp = dynamic(() => import('@/components/astro/AstroApp'), {
  ssr: false,
  loading: () => <Splash label="Warming up the rover…" dot="#f59e0b" />,
});

export type AppId = 'astro' | 'atlas';

function Splash({ label, dot }: { label: string; dot: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#070a0e]">
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: dot }} />
        {label}
      </div>
    </div>
  );
}

export default function Home() {
  const [app, setApp] = useState<AppId | null>(null);

  useEffect(() => {
    // Read the persisted choice after paint (keeps SSR markup stable and
    // avoids a synchronous setState inside the effect).
    const id = requestAnimationFrame(() => {
      const hash = new URLSearchParams(location.hash.slice(1));
      const saved = localStorage.getItem('corpus.app');
      let next: AppId = saved === 'atlas' ? 'atlas' : 'astro';
      if (hash.get('app') === 'atlas') next = 'atlas';
      if (hash.get('app') === 'astro') next = 'astro';
      setApp(next);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (app) localStorage.setItem('corpus.app', app);
  }, [app]);

  const openAtlas = useCallback(() => setApp('atlas'), []);
  const openAstro = useCallback(() => setApp('astro'), []);

  return (
    <div className="h-dvh overflow-hidden bg-[#070a0e] text-zinc-100">
      {app === 'atlas' && <AtlasApp onLaunchGame={openAstro} />}
      {app === 'astro' && <AstroApp onOpenAtlas={openAtlas} />}
      {app === null && <Splash label="Starting…" dot="#2dd4bf" />}
    </div>
  );
}
