'use client';

/** Search palette over the atlas's named concepts and individual pieces. */
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
 CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { SYSTEM_MAP, type Concept, type Part } from '@/lib/anatomy/types';
import { useAtlas } from '@/store/atlas';

const SUGGESTIONS = ['heart', 'brain', 'liver', 'femur', 'kidney', 'lungs', 'skin', 'uterus', 'aorta', 'gluteus maximus'];

export function SearchPalette() {
  const open = useAtlas((s) => s.searchOpen);
  const setOpen = useAtlas((s) => s.setSearchOpen);
  const atlas = useAtlas((s) => s.atlas);
  const selectConcept = useAtlas((s) => s.selectConcept);
  const selectPart = useAtlas((s) => s.selectPart);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const { concepts, parts } = useMemo(() => {
    if (!atlas) return { concepts: [] as Concept[], parts: [] as Part[] };
    const q = query.trim().toLowerCase();
    if (!q) {
      const byName = new Map(atlas.concepts.map((c) => [c.name.toLowerCase(), c]));
      return {
        concepts: SUGGESTIONS.map((s) => byName.get(s)).filter((c): c is Concept => !!c),
        parts: [],
      };
    }
    return {
      concepts: atlas.concepts
        .filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
        .sort((a, b) => a.name.length - b.name.length)
        .slice(0, 40),
      parts: atlas.parts
        .filter((p) => p.name.toLowerCase().includes(q))
        .slice(0, 12),
    };
  }, [atlas, query]);

  const systemOfConcept = (c: Concept): string => {
    const p = atlas?.parts.find((x) => x.id === c.elements[0]);
    return SYSTEM_MAP[p?.system ?? '']?.color ?? '#888';
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
      className="border-white/10 bg-[#0c1219]"
    >
      <CommandInput
        placeholder="Search structures — heart, femur, cranial nerve…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[65vh]">
        <CommandEmpty className="py-8 text-center text-sm text-zinc-500">
          No structures match “{query}”.
        </CommandEmpty>
        {concepts.length > 0 && (
          <CommandGroup heading={query ? 'Named structures' : 'Try searching'}>
            {concepts.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.id} ${c.name}`}
                onSelect={() => {
                  selectConcept(c);
                  setOpen(false);
                }}
                className="gap-2.5 text-zinc-200 aria-selected:bg-white/[0.06]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: systemOfConcept(c) }} />
                <span className="truncate">{c.name}</span>
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-500">
                  {c.elements.length} {c.elements.length === 1 ? 'piece' : 'pieces'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {parts.length > 0 && (
          <CommandGroup heading="Individual pieces">
            {parts.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.id} ${p.name}`}
                onSelect={() => {
                  selectPart(p.id);
                  setOpen(false);
                }}
                className="gap-2.5 text-zinc-300 aria-selected:bg-white/[0.06]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SYSTEM_MAP[p.system]?.color }} />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-zinc-600">{p.id}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <div className="border-t border-white/5 px-3 py-2 text-[11px] text-zinc-500">
        <Search size={11} className="mr-1.5 inline" />
        Searches every named structure in the current body · press <kbd className="rounded bg-white/10 px-1">Esc</kbd> to close
      </div>
    </CommandDialog>
  );
}
