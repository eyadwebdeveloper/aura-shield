'use client';

/** Licence credits — the three model sets are CC BY 4.0 and must be credited. */
import { ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAtlas } from '@/store/atlas';

const SOURCES = [
  {
    name: 'Male body — BodyParts3D 4.0',
    credit: 'BodyParts3D, © The Database Center for Life Science (DBCLS), licensed CC BY 4.0.',
    links: [
      { label: 'License', href: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html' },
      { label: 'Dataset', href: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html' },
    ],
  },
  {
    name: 'Female body — Human Reference Atlas v1.10',
    credit:
      '3D Reference Organ Set for Female v1.10 by Kristen Browne and Heidi Schlehlein, HuBMAP Human Reference Atlas, CC BY 4.0. Built on the Visible Human Dataset of the U.S. National Library of Medicine.',
    links: [{ label: 'Reference library', href: 'https://humanatlas.io/3d-reference-library' }],
  },
  {
    name: 'Leg muscles — Visible Human Female',
    credit:
      'Andreassen et al., “Three Dimensional Lower Extremity Musculoskeletal Geometry of the Visible Human Female and Male”, Scientific Data 10, 34 (2023), CC BY 4.0.',
    links: [{ label: 'Publication', href: 'https://doi.org/10.1038/s41597-022-01905-2' }],
  },
];

export function CreditsDialog() {
  const open = useAtlas((s) => s.creditsOpen);
  const setOpen = useAtlas((s) => s.setCreditsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto border-white/10 bg-[#0c1219] p-0 text-zinc-200 sm:max-w-lg">
        <DialogHeader className="space-y-2 px-6 pt-6">
          <DialogTitle className="text-[17px] font-semibold text-zinc-50">Sources &amp; credits</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-zinc-400">
            Three open anatomical reference datasets, each CC BY 4.0. Geometry is simplified
            (meshoptimizer, ≤ 0.2% per-structure error), re-packed into custom binary chunks, and
            rendered here by an independent viewer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          {SOURCES.map((s) => (
            <div key={s.name} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <h4 className="text-[13.5px] font-semibold text-zinc-100">{s.name}</h4>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">{s.credit}</p>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {s.links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] text-teal-300 hover:text-teal-200 hover:underline"
                  >
                    {l.label} <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11.5px] leading-relaxed text-zinc-500">
            Structures borrowed between the two reference bodies are labelled in the interface
            (“Male-derived bones”, “Leg muscles (donor)”) and stay switched off until asked for.
            This is an educational reference — not a clinical, diagnostic, or surgical tool.
            Model packaging adapted from the{' '}
            <a
              href="https://github.com/slorksmo/Human-Atlas"
              target="_blank"
              rel="noreferrer"
              className="text-teal-300 hover:underline"
            >
              Human-Atlas
            </a>{' '}
            open-source project.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
