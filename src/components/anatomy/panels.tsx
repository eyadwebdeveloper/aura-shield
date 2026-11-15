'use client';

/** Overlay panels around the 3D canvas: systems list, structure details,
 *  hover tooltip, streaming progress, and error card. */
import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Focus, X, AlertTriangle, RefreshCw, ChevronRight, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  type Part,
  SYSTEM_META,
  SYSTEM_MAP,
  STRUCTURE_NOTES,
  type SystemId,
} from '@/lib/anatomy/types';
import { useAtlas } from '@/store/atlas';

/* ------------------------------------------------------------------ models */
export function VisibleCount() {
  const atlas = useAtlas((s) => s.atlas);
  const visible = useAtlas((s) => s.visible);
  const selected = useAtlas((s) => s.selected);
  const isolate = useAtlas((s) => s.isolate);
  const count = useMemo(() => {
    if (!atlas) return 0;
    if (isolate) return selected.length;
    const vis = new Set(visible);
    const sel = new Set(selected);
    return atlas.parts.filter((p) => vis.has(p.system) || sel.has(p.id)).length;
  }, [atlas, visible, selected, isolate]);
  return <span className="tabular-nums">{count.toLocaleString('en')}</span>;
}

/* ----------------------------------------------------------------- systems */
export function SystemsPanel({ onDone }: { onDone?: () => void }) {
  const atlas = useAtlas((s) => s.atlas);
  const visible = useAtlas((s) => s.visible);
  const toggleSystem = useAtlas((s) => s.toggleSystem);
  const showOnly = useAtlas((s) => s.showOnly);
  const setPreset = useAtlas((s) => s.setPreset);

  const rows = useMemo(() => {
    if (!atlas) return [];
    const counts = new Map<SystemId, number>();
    atlas.parts.forEach((p) => counts.set(p.system, (counts.get(p.system) ?? 0) + 1));
    return SYSTEM_META.filter((s) => (counts.get(s.id) ?? 0) > 0).map((s) => ({
      ...s,
      count: counts.get(s.id)!,
    }));
  }, [atlas]);

  const presets: { label: string; ids: SystemId[] }[] = [
    { label: 'All', ids: rows.map((r) => r.id) },
    { label: 'Skeleton', ids: ['skeletal', 'connective'] },
    { label: 'Organs', ids: ['cardiac', 'respiratory', 'digestive', 'urinary', 'endocrine', 'reproductive'] },
    { label: 'Vessels', ids: ['arterial', 'venous'] },
    { label: 'Neuro', ids: ['nervous', 'brain', 'sensory'] },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          <Layers3 size={13} className="text-teal-400" /> Systems
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-5 tabular-nums">{rows.length}</Badge>
          {onDone && (
            <Button variant="ghost" size="icon" className="h-6 w-6 lg:hidden" onClick={onDone} aria-label="Close systems">
              <X size={14} />
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {presets.map((p) => (
          <Button
            key={p.label}
            variant="outline"
            size="sm"
            className="h-6 rounded-full border-white/10 bg-white/[0.03] px-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
            onClick={() => setPreset(p.ids)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <Separator className="bg-white/5" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 py-2" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.length === 0 && (
            <p className="px-3 py-6 text-xs text-zinc-500">Loading systems…</p>
          )}
          {rows.map((r) => {
            const on = visible.includes(r.id);
            return (
              <div
                key={r.id}
                className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                  on ? 'bg-white/[0.045]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  onClick={() => showOnly(r.id)}
                  title={`Show only ${r.name}`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: r.color, boxShadow: on ? `0 0 8px ${r.color}66` : undefined, opacity: on ? 1 : 0.45 }}
                  />
                  <span className={`truncate text-[13px] ${on ? 'text-zinc-100' : 'text-zinc-400'}`}>{r.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-500">{r.count}</span>
                </button>
                <Switch
                  checked={on}
                  onCheckedChange={() => toggleSystem(r.id)}
                  aria-label={`Toggle ${r.name}`}
                  className="scale-90 data-[state=checked]:bg-teal-500/80"
                />
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <Separator className="bg-white/5" />
      <div className="flex items-center justify-between px-4 py-2.5 text-[11px] text-zinc-400">
        <span><VisibleCount /> pieces visible</span>
        <button className="text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline" onClick={() => setPreset([])}>
          Hide all
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- details */
function structureNote(name: string, system: SystemId | undefined): string {
  const key = name.toLowerCase().trim();
  const direct = STRUCTURE_NOTES[key];
  if (direct) return direct;
  const stripped = key.replace(/\s*\((left|right)\)\s*$/, '').replace(/^(left|right)\s+/, '');
  const base = Object.keys(STRUCTURE_NOTES).find((k) => stripped.startsWith(`${k} `) || stripped === k);
  if (base) return STRUCTURE_NOTES[base];
  return system ? SYSTEM_MAP[system]?.blurb ?? '' : '';
}

export function DetailPanel() {
  const atlas = useAtlas((s) => s.atlas);
  const selected = useAtlas((s) => s.selected);
  const chosenConcept = useAtlas((s) => s.chosenConcept);
  const isolate = useAtlas((s) => s.isolate);
  const setIsolate = useAtlas((s) => s.setIsolate);
  const clearSelection = useAtlas((s) => s.clearSelection);
  const selectPart = useAtlas((s) => s.selectPart);

  const info = useMemo(() => {
    if (!atlas || !selected.length) return null;
    const parts = selected
      .map((id) => atlas.parts.find((p) => p.id === id))
      .filter((p): p is Part => !!p);
    if (!parts.length) return null;
    const first = parts[0]!;
    const vertices = parts.reduce((n, p) => n + p.vertexCount, 0);
    const triangles = parts.reduce((n, p) => n + p.indexCount / 3, 0);
    const size = [0, 1, 2].map((k) => {
      const lo = Math.min(...parts.map((p) => p.bounds[0][k]));
      const hi = Math.max(...parts.map((p) => p.bounds[1][k]));
      return Math.round((hi - lo) * 1000);
    });
    return { first, parts, vertices, triangles, size };
  }, [atlas, selected]);

  if (!info) return null;
  const meta = SYSTEM_MAP[info.first.system];
  const title =
    selected.length === 1 ? info.first.name : chosenConcept?.name ?? info.first.name;
  const reference = selected.length === 1 ? info.first.conceptId : chosenConcept?.id ?? info.first.conceptId;
  const note = structureNote(title, info.first.system);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: meta?.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: meta?.color }} />
            {meta?.name ?? info.first.system}
          </div>
          <h2 className="mt-1.5 text-[17px] font-semibold leading-tight text-zinc-50">
            {title}
          </h2>
          <p className="mt-0.5 font-mono text-[10.5px] text-zinc-500">
            {reference}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-7 w-7 text-zinc-400" onClick={clearSelection} aria-label="Close details">
          <X size={15} />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 py-4">
          {note && <p className="text-[13px] leading-relaxed text-zinc-300">{note}</p>}

          <div className="grid grid-cols-3 gap-2">
            {[
              ['Pieces', selected.length.toLocaleString('en')],
              ['Triangles', Math.round(info.triangles).toLocaleString('en')],
              ['Vertices', info.vertices.toLocaleString('en')],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</div>
                <div className="mt-0.5 text-[13px] font-semibold tabular-nums text-zinc-100">{v}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-[12px] text-zinc-400">
            <span className="text-zinc-500">Approx. size</span>{' '}
            <span className="font-mono text-zinc-200">
              {info.size[1]} × {info.size[0]} × {info.size[2]} mm
            </span>
          </div>

          {info.parts.length > 1 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Included pieces
              </div>
              <div className="space-y-0.5">
                {info.parts.slice(0, 40).map((p) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px] text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                    onClick={() => selectPart(p.id)}
                  >
                    <span className="truncate">{p.name}</span>
                    <ChevronRight size={13} className="shrink-0 text-zinc-600" />
                  </button>
                ))}
                {info.parts.length > 40 && (
                  <p className="px-2 pt-1 text-[11px] text-zinc-500">+ {info.parts.length - 40} more pieces</p>
                )}
              </div>
            </div>
          )}

          {meta && <p className="text-[11.5px] leading-relaxed text-zinc-500">{meta.blurb}</p>}
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t border-white/5 p-3">
        <Button
          size="sm"
          className={`h-8 flex-1 gap-1.5 text-[12px] ${
            isolate
              ? 'bg-teal-500/15 text-teal-300 hover:bg-teal-500/25'
              : 'bg-teal-500/90 text-[#04211d] hover:bg-teal-400'
          }`}
          onClick={() => setIsolate(!isolate)}
        >
          <Focus size={13} />
          {isolate ? 'Show surroundings' : 'Isolate'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-white/10 bg-transparent px-3 text-[12px] text-zinc-300 hover:bg-white/[0.06]"
          onClick={clearSelection}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tooltip */
export function HoverTooltip() {
  const hover = useAtlas((s) => s.hover);
  return (
    <AnimatePresence>
      {hover && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none absolute z-30 max-w-[260px] rounded-lg border border-white/10 bg-[#0c1219]/95 px-3 py-2 shadow-xl backdrop-blur"
          style={{
            left: `min(${hover.x + 14}px, calc(100% - 272px))`,
            top: `min(${hover.y + 16}px, calc(100% - 76px))`,
          }}
        >
          <div className="text-[13px] font-medium leading-tight text-zinc-100">{hover.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SYSTEM_MAP[hover.system]?.color }} />
            {SYSTEM_MAP[hover.system]?.name}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------- loading/error */
export function LoadingChip() {
  const progress = useAtlas((s) => s.progress);
  return (
    <AnimatePresence>
      {progress && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="absolute bottom-4 left-4 z-30 w-56 rounded-xl border border-white/10 bg-[#0c1219]/95 px-3.5 py-3 shadow-xl backdrop-blur"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-300">
            <span className="uppercase tracking-wider">Streaming geometry</span>
            <span className="tabular-nums text-teal-300">
              {progress.loaded}/{progress.total}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-teal-400 transition-all duration-300"
              style={{ width: `${progress.total ? (progress.loaded / progress.total) * 100 : 0}%` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ErrorCard() {
  const error = useAtlas((s) => s.error);
  const setError = useAtlas((s) => s.setError);
  const reloadAtlas = useAtlas((s) => s.reloadAtlas);
  if (!error) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#070a0e]/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-red-400/20 bg-[#0d1219] p-5 shadow-2xl">
        <div className="flex items-center gap-2.5 text-red-300">
          <AlertTriangle size={18} />
          <h3 className="text-[15px] font-semibold">Something interrupted the atlas</h3>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{error}</p>
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            className="h-8 flex-1 gap-1.5 bg-teal-500/90 text-[12px] text-[#04211d] hover:bg-teal-400"
            onClick={() => {
              setError('');
              reloadAtlas();
            }}
          >
            <RefreshCw size={13} /> Retry
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-transparent px-3 text-[12px] text-zinc-300 hover:bg-white/[0.06]"
            onClick={() => setError('')}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
