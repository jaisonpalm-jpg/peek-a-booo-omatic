import { useState } from "react";
import { AlertTriangle, CheckCircle2, Truck } from "lucide-react";
import type { Recommendation } from "@/lib/freight/types";
import { CurbStackDiagram } from "./CurbStackDiagram";

interface RecommendationPanelProps {
  rec: Recommendation;
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function RecommendationPanel({ rec }: RecommendationPanelProps) {
  const { trailer, totals, oversize, withinLegalLimits, utilizationPct, deckAreaPct, alternates, candidates, notes } = rec;
  const [tab, setTab] = useState<"enclosed" | "open">("enclosed");

  return (
    <div className="space-y-6">
      <div className="bg-card ring-2 ring-rule overflow-hidden">
        <div className="p-5 border-b-2 border-rule bg-success-soft">
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="px-2.5 py-1 bg-rule text-background text-[10px] font-bold uppercase tracking-widest">
              Recommendation
            </span>
            {trailer ? (
              withinLegalLimits ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-success">
                  <CheckCircle2 className="size-3.5" />
                  Within legal limits
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-warning">
                  <AlertTriangle className="size-3.5" />
                  Permit required
                </span>
              )
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <Truck className="size-7 text-foreground" />
            <h2 className="text-3xl font-semibold tracking-tight">
              {trailer ? trailer.name : "—"}
            </h2>
          </div>
          {trailer && (
            <p className="text-sm text-muted-foreground mt-1.5">{trailer.description}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-px bg-border">
          <Stat label="Total Volume" value={`${fmt(totals.cubeFt3, 0)}`} unit="ft³" />
          <Stat label="Pieces" value={`${fmt(totals.pieces)}`} unit="pcs" />
          <Stat label="Packing Boxes" value={`${fmt(totals.boxes)}`} unit={`36"x36"x24"`} />
          <Stat
            label="Space Used"
            value={trailer ? `${fmt(totals.linearFt, 1)} / ${fmt(trailer.deckLength / 12, 0)}` : fmt(totals.linearFt, 1)}
            unit="ft"
          />
          <Stat
            label="Deck Area"
            value={fmt(totals.deckAreaFt2, 1)}
            unit="ft²"
          />
          <Stat
            label="Longest"
            value={fmt(totals.longestIn / 12, 1)}
            unit="ft"
          />
          <Stat
            label="Widest"
            value={fmt(totals.widestIn / 12, 1)}
            unit="ft"
          />
          <Stat
            label="Tallest"
            value={fmt(totals.tallestIn / 12, 1)}
            unit="ft"
          />
        </div>

        {trailer && (
          <div className="p-5 border-t-2 border-border space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Deck Length Used
                </span>
                <span className="text-sm font-mono font-bold">
                  {fmt(totals.linearFt, 1)} / {fmt(trailer.deckLength / 12, 0)} ft · {Math.round(utilizationPct)}%
                </span>
              </div>
              <div className="w-full h-2 bg-secondary overflow-hidden">
                <div
                  className="h-full bg-success transition-all"
                  style={{ width: `${Math.min(100, utilizationPct)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Deck Area Occupied
                </span>
                <span className="text-sm font-mono font-bold">
                  {fmt(totals.deckAreaFt2, 1)} / {fmt((trailer.deckLength * trailer.deckWidth) / 144, 0)} ft² · {Math.round(deckAreaPct)}%
                </span>
              </div>
              <div className="w-full h-2 bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, deckAreaPct)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="bg-card ring-2 ring-rule">
          <div className="p-4 border-b-2 border-rule">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Floor-Area Utilization by Truck
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px bg-border">
            {candidates.map((c) => {
              const isPick = trailer?.id === c.trailer.id;
              return (
                <div
                  key={c.trailer.id}
                  className={`p-4 bg-card ${isPick ? "ring-2 ring-success ring-inset" : ""}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-tight">
                      {c.trailer.shortName}
                    </p>
                    {isPick && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-success">
                        Pick
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {Math.round(c.deckAreaPct)}
                    <span className="text-xs text-muted-foreground font-normal">%</span>
                  </p>
                  <div className="w-full h-1.5 bg-secondary overflow-hidden mt-2">
                    <div
                      className={`h-full transition-all ${
                        !c.fits ? "bg-warning" : c.deckAreaPct > 90 ? "bg-warning" : "bg-success"
                      }`}
                      style={{ width: `${Math.min(100, c.deckAreaPct)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                    {c.linearFt.toFixed(1)} / {Math.round(c.trailer.deckLength / 12)} ft
                  </p>
                  {!c.fits && (
                    <p className="text-[10px] text-warning font-bold uppercase tracking-widest mt-1">
                      Won't fit
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {candidates.some((c) => c.curbStacks.length > 0) && (
        <div className="bg-card ring-2 ring-rule">
          <div className="p-4 border-b-2 border-rule">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Curb Stacking Per Trailer
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Height-limited stacking — taller decks fit more layers. 4&quot; strap buffer
              shown dashed around each base; 2&quot; dunnage gap between layers.
            </p>
          </div>
          <div className="divide-y-2 divide-rule">
            {candidates
              .filter((c) => c.curbStacks.length > 0)
              .map((c) => {
                const isPick = trailer?.id === c.trailer.id;
                return (
                  <div key={c.trailer.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{c.trailer.name}</p>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        max {(c.trailer.maxHeight / 12).toFixed(1)}&apos; tall
                        {isPick && (
                          <span className="ml-2 text-success font-bold">· pick</span>
                        )}
                      </span>
                    </div>
                    <CurbStackDiagram
                      stacks={c.curbStacks}
                      maxHeightIn={c.trailer.maxHeight}
                    />
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((n, i) => (
            <li
              key={i}
              className="text-xs text-muted-foreground border-l-2 border-border pl-3 py-1"
            >
              {n}
            </li>
          ))}
        </ul>
      )}

      {oversize.length > 0 && (
        <div className="p-4 bg-warning-soft ring-2 ring-warning/40">
          <div className="flex items-start gap-3">
            <div className="size-7 bg-warning text-warning-foreground shrink-0 flex items-center justify-center font-bold">
              !
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold uppercase tracking-tight">
                {oversize.length} Oversize {oversize.length === 1 ? "Flag" : "Flags"}
              </p>
              <ul className="mt-2 space-y-1">
                {oversize.map((o, i) => (
                  <li key={i} className="text-xs leading-snug">
                    {o.detail}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-3 leading-snug">
                Try rotating the affected piece (cycle the orient button) to see if a different
                orientation eliminates the flag.
              </p>
            </div>
          </div>
        </div>
      )}

      {alternates.length > 0 && (
        <div className="bg-card ring-1 ring-border p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Alternate Trailers
          </p>
          {alternates.map((a) => (
            <div
              key={a.trailer.id}
              className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
            >
              <span className="text-sm font-semibold">{a.trailer.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                {Math.round(a.utilizationPct)}% util
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold mt-1">
        {value} <span className="text-xs text-muted-foreground font-normal">{unit}</span>
      </p>
    </div>
  );
}
