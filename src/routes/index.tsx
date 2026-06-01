import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, ScanLine } from "lucide-react";
import { PieceTable } from "@/components/freight/PieceTable";
import { RecommendationPanel } from "@/components/freight/RecommendationPanel";
import { recommend } from "@/lib/freight/recommend";
import { exportLoadSummaryPdf } from "@/lib/freight/exportPdf";
import type { Piece } from "@/lib/freight/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LoadFit — Freight Trailer Estimator" },
      {
        name: "description",
        content:
          "Enter piece dimensions from a build sheet and get an instant trailer recommendation with legal oversize flags.",
      },
      { property: "og:title", content: "LoadFit — Freight Trailer Estimator" },
      {
        property: "og:description",
        content:
          "Enter piece dimensions from a build sheet and get an instant trailer recommendation with legal oversize flags.",
      },
    ],
  }),
  component: EstimatorPage,
});

// Seed data from the user's St Paul's Episcopal Church build sheet.
const SEED_PIECES: Piece[] = [
  {
    id: "seed-1",
    description: '8" Spiral Pipe (120")',
    length: 120,
    width: 8,
    height: 8,
    qty: 1,
    orientation: "as-entered",
  },
  {
    id: "seed-2",
    description: '8" Spiral Pipe (80")',
    length: 80,
    width: 8,
    height: 8,
    qty: 1,
    orientation: "as-entered",
  },
  {
    id: "seed-3",
    description: '24" Spiral Pipe (120")',
    length: 120,
    width: 24,
    height: 24,
    qty: 1,
    orientation: "as-entered",
  },
  {
    id: "seed-4",
    description: '24" Gasketed Fittings',
    length: 36,
    width: 24,
    height: 24,
    qty: 8,
    orientation: "as-entered",
  },
  {
    id: "seed-5",
    description: '8" Fittings & Reducers',
    length: 12,
    width: 8,
    height: 8,
    qty: 12,
    orientation: "as-entered",
  },
];

function EstimatorPage() {
  const [jobName, setJobName] = useState("St Paul's Episcopal Church");
  const [pieces, setPieces] = useState<Piece[]>(SEED_PIECES);

  const rec = useMemo(() => recommend(pieces), [pieces]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-rule bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 bg-rule flex items-center justify-center shrink-0">
              <div className="size-3.5 bg-background" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground leading-none">
                LoadFit
              </p>
              <p className="text-sm font-semibold leading-tight truncate">
                Freight Trailer Estimator
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => exportLoadSummaryPdf({ jobName, pieces, rec })}
            disabled={pieces.filter((p) => p.qty > 0 && p.length > 0).length === 0}
            className="inline-flex items-center gap-2 text-xs font-bold py-2.5 px-4 bg-rule text-background uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 space-y-8 lg:space-y-0">
          <section className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 bg-rule text-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                Field Assessment
              </div>
              <input
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                maxLength={120}
                placeholder="Job name"
                className="w-full text-2xl sm:text-3xl font-semibold tracking-tight bg-transparent focus:outline-none focus:bg-secondary -mx-2 px-2 py-1"
              />
              <p className="text-sm text-muted-foreground max-w-prose">
                Enter each piece&apos;s actual L × W × H in inches. Use the orient button
                to test if rotating eliminates an oversize flag.
              </p>
            </div>

            <button
              type="button"
              disabled
              className="w-full p-5 bg-card ring-2 ring-border flex items-center gap-4 border-2 border-dashed border-border text-left opacity-60 cursor-not-allowed"
              title="Coming next: scan a build sheet photo"
            >
              <div className="size-12 bg-secondary flex items-center justify-center shrink-0">
                <ScanLine className="size-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold uppercase tracking-tight">
                  Scan Build Sheet
                </h3>
                <p className="text-xs text-muted-foreground">
                  Photo OCR auto-populates pieces — coming next
                </p>
              </div>
              <span className="px-2.5 py-1 bg-warning-soft text-foreground text-[10px] font-bold uppercase tracking-widest">
                Soon
              </span>
            </button>

            <PieceTable pieces={pieces} onChange={setPieces} />
          </section>

          <aside className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
            <RecommendationPanel rec={rec} />
          </aside>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-8 border-t border-border mt-12 text-xs text-muted-foreground">
        Federal limits: 8&apos;6&quot; width · 13&apos;6&quot; height · 53&apos; length · 4&apos; rear overhang.
        State permits may vary.
      </footer>
    </div>
  );
}
