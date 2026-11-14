'use client';

/** React host for the 3D game engine — same pattern as the anatomy Viewer:
 *  mount once, wire store <-> engine through callbacks, dispose on unmount. */
import { useEffect, useRef } from 'react';
import { AstroEngine } from './engine';
import { engineRef, useAstro } from './store';
import { saveRun } from './assessment';

export default function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    let engine: AstroEngine;
    try {
      engine = new AstroEngine(hostRef.current, {
        onHud: (p) => useAstro.getState().syncHud(p),
        onBanner: (text, tone, ms, sub) => useAstro.getState().pushBanner(text, tone, ms, sub),
        onPhase: (p) => useAstro.getState().setPhase(p),
        onCountdown: (n) => useAstro.getState().setCountdown(n),
        onRadar: (side, ms) => useAstro.getState().openRadar(side, ms),
        onRadarClose: () => useAstro.getState().closeRadar(),
        onFork: (ms) => useAstro.getState().openFork(ms),
        onForkClose: () => useAstro.getState().closeFork(),
        onEnd: (log) => {
          try {
            const report = saveRun(log);
            useAstro.getState().setReport(report);
            useAstro.getState().bumpRunsToday();
          } catch {
            useAstro.getState().pushBanner('Could not save this session', 'warn', 3000);
          }
        },
      });
    } catch {
      useAstro
        .getState()
        .pushBanner('WebGL is unavailable in this browser — the 3D run cannot start.', 'bad', 60000);
      return;
    }
    engineRef.current = engine;
    // QA hook for automated browser checks (window.__astroEngine.debugAdvance).
    (window as unknown as { __astroEngine?: AstroEngine | null }).__astroEngine = engine;
    return () => {
      engineRef.current = null;
      (window as unknown as { __astroEngine?: AstroEngine | null }).__astroEngine = null;
      engine.destroy();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" aria-label="Astro-Shield 3D viewport" />;
}
