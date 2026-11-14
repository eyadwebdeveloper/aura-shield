'use client';

/** React host for the 3D engine: mounts the canvas, wires store <-> engine. */
import { useEffect, useRef } from 'react';
import { AnatomyEngine, type EngineState } from './engine';
import { MODEL_MAP } from '@/lib/anatomy/types';
import { useAtlas } from '@/store/atlas';

export default function Viewer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<AnatomyEngine | null>(null);

  const model = useAtlas((s) => s.model);
  const visible = useAtlas((s) => s.visible);
  const selected = useAtlas((s) => s.selected);
  const isolate = useAtlas((s) => s.isolate);
  const explode = useAtlas((s) => s.explode);
  const view = useAtlas((s) => s.view);
  const autoRotate = useAtlas((s) => s.autoRotate);
  const reset = useAtlas((s) => s.reset);
  const focus = useAtlas((s) => s.focus);

  useEffect(() => {
    if (!hostRef.current) return;
    let engine: AnatomyEngine;
    try {
      engine = new AnatomyEngine(hostRef.current, {
        onHover: (h) => useAtlas.getState().setHover(h),
        onPick: (id) => {
          if (id) useAtlas.getState().selectPart(id);
        },
        onActivate: (id) => useAtlas.getState().activatePart(id),
        onProgress: (p) => useAtlas.getState().setProgress(p),
        onError: (m) => useAtlas.getState().setError(m),
      });
    } catch (e) {
      useAtlas.getState().setError(e instanceof Error ? e.message : 'WebGL is unavailable.');
      return;
    }
    engineRef.current = engine;
    engine.attachResizeObserver();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Mount the atlas for the active model.
  useEffect(() => {
    const def = MODEL_MAP[model];
    void engineRef.current?.setAtlas(def.manifest, { frameAfterLoad: def.frameOnLoad });
  }, [model]);

  // Push viewer state into the engine.
  const state: EngineState = {
    visible,
    selected,
    isolate,
    explode,
    view,
    autoRotate,
    reset,
    focus,
  };
  useEffect(() => {
    engineRef.current?.setState(state);
  }, [visible, selected, isolate, explode, view, autoRotate, reset, focus, model]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing [background:radial-gradient(120%_90%_at_50%_0%,#101821_0%,#0a0e13_55%,#070a0e_100%)]"
    />
  );
}
