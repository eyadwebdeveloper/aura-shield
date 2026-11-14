'use client';

/** Viewer + UI state for the anatomy explorer. */
import { create } from 'zustand';
import type { ViewId } from '@/components/anatomy/engine';
import {
  MODELS,
  MODEL_MAP,
  type AtlasManifest,
  type Concept,
  type ModelId,
  type SystemId,
} from '@/lib/anatomy/types';

export interface HoverInfo {
  id: string;
  name: string;
  system: SystemId;
  x: number;
  y: number;
}

interface AtlasStore {
  model: ModelId;
  atlas: AtlasManifest | null;
  visible: SystemId[];
  selected: string[];
  chosenConcept: Concept | null;
  isolate: boolean;
  explode: number;
  view: ViewId;
  autoRotate: boolean;
  reset: number;
  focus: number;
  hover: HoverInfo | null;
  progress: { loaded: number; total: number } | null;
  error: string;
  searchOpen: boolean;
  creditsOpen: boolean;
  systemsOpen: boolean; // mobile sheet

  setModel: (id: ModelId) => void;
  toggleSystem: (id: SystemId) => void;
  showOnly: (id: SystemId) => void;
  setPreset: (ids: SystemId[]) => void;
  selectPart: (id: string) => void;
  selectConcept: (c: Concept) => void;
  activatePart: (id: string) => void;
  clearSelection: () => void;
  setIsolate: (v: boolean) => void;
  setExplode: (v: number) => void;
  setView: (v: ViewId) => void;
  toggleRotate: () => void;
  resetAll: () => void;
  setHover: (h: HoverInfo | null) => void;
  setProgress: (p: { loaded: number; total: number } | null) => void;
  setError: (e: string) => void;
  setSearchOpen: (v: boolean) => void;
  setCreditsOpen: (v: boolean) => void;
  setSystemsOpen: (v: boolean) => void;
  reloadAtlas: () => void;
}

let manifestCache = new Map<string, Promise<AtlasManifest>>();

function loadManifest(url: string): Promise<AtlasManifest> {
  let p = manifestCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Could not load the atlas catalogue (${r.status}).`);
      return r.json();
    });
    manifestCache.set(url, p);
  }
  return p;
}

/** The most specific concept for a part: the one named by the part's own
 *  conceptId, else the smallest concept that contains it. */
function bestConceptFor(
  atlas: AtlasManifest | null,
  part: { id: string; conceptId: string } | undefined
): Concept | null {
  if (!atlas || !part) return null;
  const direct = atlas.concepts.find((c) => c.id === part.conceptId);
  if (direct) return direct;
  const containing = atlas.concepts
    .filter((c) => c.elements.includes(part.id))
    .sort((a, b) => a.elements.length - b.elements.length);
  return containing[0] ?? null;
}

export const useAtlas = create<AtlasStore>((set, get) => ({
  model: 'male',
  atlas: null,
  visible: MODEL_MAP.male.visible,
  selected: [],
  chosenConcept: null,
  isolate: false,
  explode: 0,
  view: 'three-quarter',
  autoRotate: false,
  reset: 0,
  focus: 0,
  hover: null,
  progress: null,
  error: '',
  searchOpen: false,
  creditsOpen: false,
  systemsOpen: false,

  setModel: (id) => {
    const def = MODEL_MAP[id];
    if (typeof history !== 'undefined') {
      history.replaceState(null, '', `#model=${id}`);
    }
    set((s) => ({
      model: id,
      visible: def.visible,
      selected: [],
      chosenConcept: null,
      isolate: false,
      explode: 0,
      view: 'three-quarter',
      autoRotate: false,
      hover: null,
      error: '',
      progress: null,
      systemsOpen: false,
      reset: s.reset + 1,
    }));
    loadManifest(def.manifest)
      .then((atlas) => {
        if (get().model === id) set({ atlas });
      })
      .catch(() => {
        if (get().model === id)
          set({ error: 'The atlas catalogue could not be loaded. Check your connection and retry.' });
      });
  },
  toggleSystem: (id) =>
    set((s) => ({
      visible: s.visible.includes(id) ? s.visible.filter((x) => x !== id) : [...s.visible, id],
      selected: [],
      isolate: false,
    })),
  showOnly: (id) => set({ visible: [id], selected: [], isolate: false }),
  setPreset: (ids) => set({ visible: ids, selected: [], isolate: false }),
  selectPart: (id) => {
    const { atlas } = get();
    const part = atlas?.parts.find((p) => p.id === id);
    const concept = bestConceptFor(atlas, part) ?? null;
    set({ selected: [id], chosenConcept: concept, isolate: false, autoRotate: false });
  },
  selectConcept: (c) =>
    set({ selected: c.elements, chosenConcept: c, isolate: false, autoRotate: false }),
  activatePart: (id) => {
    const { atlas } = get();
    const part = atlas?.parts.find((p) => p.id === id);
    const concept = bestConceptFor(atlas, part) ?? null;
    set((s) => ({
      selected: [id],
      chosenConcept: concept,
      isolate: true,
      autoRotate: false,
      focus: s.focus + 1,
    }));
  },
  clearSelection: () => set({ selected: [], chosenConcept: null, isolate: false }),
  setIsolate: (v) =>
    set((s) => ({ isolate: v, focus: v && s.selected.length ? s.focus + 1 : s.focus })),
  setExplode: (v) =>
    set((s) => ({
      explode: v,
      view: v > 0.8 ? 'front' : s.view,
      autoRotate: false,
    })),
  setView: (v) => set((s) => ({ view: v, autoRotate: false })),
  toggleRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  resetAll: () =>
    set((s) => {
      const def = MODEL_MAP[s.model];
      return {
        visible: def.visible,
        selected: [],
        chosenConcept: null,
        isolate: false,
        explode: 0,
        view: 'three-quarter',
        autoRotate: false,
        reset: s.reset + 1,
      };
    }),
  setHover: (h) => set({ hover: h }),
  setProgress: (p) => set({ progress: p }),
  setError: (e) => set({ error: e }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setCreditsOpen: (v) => set({ creditsOpen: v }),
  setSystemsOpen: (v) => set({ systemsOpen: v }),
  reloadAtlas: () => {
    manifestCache = new Map();
    get().setModel(get().model);
  },
}));

/** The initial model is chosen by the page after hydration (it may come from
 *  the URL hash, which is invisible during server rendering). */

export const TOTAL_STATS = {
  meshes: 3454,
  triangles: 5053756,
  concepts: 4871,
  models: MODELS.length,
};
