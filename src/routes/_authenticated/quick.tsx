import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { QuickAddPieces } from "@/components/freight/QuickAddPieces";
import { RecommendationPanel } from "@/components/freight/RecommendationPanel";
import { recommend } from "@/lib/freight/recommend";
import type { Piece } from "@/lib/freight/types";

export const Route = createFileRoute("/_authenticated/quick")({
  head: () => ({
    meta: [
      { title: "Quick Estimate — LoadFit" },
      {
        name: "description",
        content:
          "Punch in raw L × W × H × quantity and get an instant trailer recommendation, no job required.",
      },
    ],
  }),
  component: QuickEstimatePage,
});

function QuickEstimatePage() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [smartStack, setSmartStack] = useState(true);
  const [maxCurbStack, setMaxCurbStack] = useState(3);

  const rec = useMemo(
    () => recommend(pieces, { maxCurbStack, smartStack }),
    [pieces, maxCurbStack, smartStack],
  );

  const total = pieces.reduce((n, p) => n + p.qty, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-rule bg-card sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs font-bold py-2.5 px-3 bg-background ring-2 ring-rule uppercase tracking-widest hover:bg-secondary"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground leading-none">
                LoadFit
              </p>
              <p className="text-sm font-semibold leading-tight truncate">
                Quick Estimate — raw dimensions
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-6 sm:py-8 space-y-8">
        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 bg-rule text-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
            Raw input
          </div>
          <p className="text-sm text-muted-foreground max-w-prose">
            Skip the manifest — type each shape&apos;s L × W × H and quantity to
            get an instant trailer pick. Useful for fast phone-call quotes.
          </p>

          <QuickAddPieces
            onAdd={(added) => setPieces((prev) => [...prev, ...added])}
            showWeight
            title="Add a shape"
          />

          {pieces.length > 0 && (
            <div className="ring-2 ring-rule bg-card overflow-hidden">
              <div className="bg-rule px-4 sm:px-5 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-background uppercase tracking-widest">
                  Pieces — {total} {total === 1 ? "unit" : "units"}
                </span>
                <button
                  type="button"
                  onClick={() => setPieces([])}
                  className="text-[10px] font-bold uppercase tracking-widest text-background/80 hover:text-background"
                >
                  Clear all
                </button>
              </div>
              <ul className="divide-y divide-border">
                {pieces.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[10px] font-mono font-bold text-muted-foreground w-5">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium flex-1 truncate">
                      {p.description}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.length}″ × {p.width}″ × {p.height}″
                    </span>
                    <span className="font-mono text-xs font-bold w-12 text-right">
                      ×{p.qty}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove piece"
                      onClick={() =>
                        setPieces((prev) => prev.filter((x) => x.id !== p.id))
                      }
                      className="size-8 inline-flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {pieces.length > 0 && (
          <section className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-rule text-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
              Recommendation
            </div>
            <div className="bg-card ring-2 ring-rule p-4 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smartStack}
                  onChange={(e) => setSmartStack(e.target.checked)}
                  className="mt-0.5 size-4 accent-foreground shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                    Smart Stack — {smartStack ? "ON" : "OFF"}
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                    Auto-stacks compatible pieces.
                  </p>
                </div>
              </label>
              <div className="border-t border-rule pt-4">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="curb-stack-quick"
                    className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
                  >
                    Max Curbs / Stack
                  </label>
                  <span className="font-mono text-sm font-bold">{maxCurbStack}</span>
                </div>
                <input
                  id="curb-stack-quick"
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={maxCurbStack}
                  onChange={(e) => setMaxCurbStack(Number(e.target.value))}
                  className="w-full accent-foreground mt-2"
                />
              </div>
            </div>
            <RecommendationPanel rec={rec} />
          </section>
        )}
      </main>
    </div>
  );
}
