import { useState } from "react";
import { AlertTriangle, CheckCircle2, Truck } from "lucide-react";
import type { Recommendation } from "@/lib/freight/types";
import { CurbStackDiagram } from "./CurbStackDiagram";
import { TrailerLoadDiagram } from "./TrailerLoadDiagram";

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
  const { trailer, totals, oversize, withinLegalLimits, utilizationPct, deckAreaPct, alternates, candidates, notes, confidence, reason, splitShipment } = rec;
  const isSplit = !!splitShipment;
  const hasEnclosed = candidates.some((c) => ["box-16", "box-26", "dryvan-53"].includes(c.trailer.id));
  const hasEnclosedFit = candidates.some((c) => c.fits && ["box-16", "box-26", "dryvan-53"].includes(c.trailer.id));
  const [tab, setTab] = useState<"enclosed" | "open">(hasEnclosedFit ? "enclosed" : "open");
  const [selectedEnclosedId, setSelectedEnclosedId] = useState<string | undefined>(
    trailer && ["box-16", "box-26", "dryvan-53"].includes(trailer.id) ? trailer.id : candidates.find((c) => ["box-16", "box-26", "dryvan-53"].includes(c.trailer.id) && c.fits)?.trailer.id ?? candidates.find((c) => ["box-16", "box-26", "dryvan-53"].includes(c.trailer.id))?.trailer.id,
  );
  const [selectedOpenId, setSelectedOpenId] = useState<string | undefined>(
    trailer && ["hotshot-40", "flatbed-48", "conestoga-48", "stepdeck-53", "rgn-53"].includes(trailer.id) ? trailer.id : candidates.find((c) => ["hotshot-40", "flatbed-48", "conestoga-48", "stepdeck-53", "rgn-53"].includes(c.trailer.id) && c.fits)?.trailer.id ?? candidates.find((c) => ["hotshot-40", "flatbed-48", "conestoga-48", "stepdeck-53", "rgn-53"].includes(c.trailer.id))?.trailer.id,
  );

  return (
    <div className="space-y-6">
      <div className="bg-card ring-2 ring-rule overflow-hidden">
        <div className="p-5 border-b-2 border-rule bg-success-soft">
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="px-2.5 py-1 bg-rule text-background text-[10px] font-bold uppercase tracking-widest">
              Recommendation
            </span>
            {isSplit ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-warning">
                <AlertTriangle className="size-3.5" />
                Multi-truck split
              </span>
            ) : trailer ? (
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
          <div className="flex items-center gap-3 flex-wrap">
            <Truck className="size-7 text-foreground" />
            {isSplit ? (
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                {splitShipment!.trucks.map((t) => t.trailer.shortName ?? t.trailer.name).join(" + ")}
              </h2>
            ) : (
              <h2 className="text-3xl font-semibold tracking-tight">
                {trailer ? trailer.name : "—"}
              </h2>
            )}
          </div>
          {isSplit ? (
            <p className="text-sm text-foreground/80 mt-2 leading-snug">
              {splitShipment!.reason}
            </p>
          ) : trailer && (
            <p className="text-sm text-muted-foreground mt-1.5">{trailer.description}</p>
          )}
          {(trailer || isSplit) && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Confidence
                </span>
                <span className="text-sm font-mono font-bold">{Math.round(confidence)}%</span>
              </div>
              <div className="w-full h-1.5 bg-secondary overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    confidence >= 80 ? "bg-success" : confidence >= 60 ? "bg-primary" : "bg-warning"
                  }`}
                  style={{ width: `${Math.min(100, confidence)}%` }}
                />
              </div>
              <p className="text-xs text-foreground/80 leading-snug pt-1">{reason}</p>
            </div>
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
          {totals.weightLb > 0 && (
            <Stat label="Weight" value={fmt(totals.weightLb)} unit="lb" />
          )}
          {totals.insulated && (
            <Stat label="Insulated" value="Yes" unit="weather-sensitive" />
          )}
          {totals.savedLinearFt > 0.05 && (
            <Stat
              label="Saved by Stacking"
              value={fmt(totals.savedLinearFt, 1)}
              unit={`ft (vs ${fmt(totals.unstackedLinearFt, 1)} flat)`}
            />
          )}

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

      {!isSplit && candidates.length > 0 && (
        <div className="bg-card ring-2 ring-rule">
          <div className={`flex border-b-2 border-rule ${!hasEnclosed ? "hidden" : ""}`}>
            <button
              type="button"
              onClick={() => setTab("enclosed")}
              className={`flex-1 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                tab === "enclosed"
                  ? "bg-card text-foreground border-b-0"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Box Trucks & Dry Van
            </button>
            <button
              type="button"
              onClick={() => setTab("open")}
              className={`flex-1 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                tab === "open"
                  ? "bg-card text-foreground border-b-0"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Flatbed / Conestoga / Hotshot
            </button>
          </div>

          <div className="p-4">
            {tab === "enclosed" && (
              <EnclosedCandidates candidates={candidates} pickId={trailer?.id} selectedId={selectedEnclosedId} onSelect={setSelectedEnclosedId} />
            )}
            {tab === "open" && (
              <OpenDeckCandidates candidates={candidates} pickId={trailer?.id} selectedId={selectedOpenId} onSelect={setSelectedOpenId} />
            )}
          </div>
        </div>
      )}


      {rec.splitShipment && (
        <div className="bg-card ring-2 ring-warning/60 overflow-hidden">
          <div className="p-4 bg-warning-soft border-b-2 border-warning/40">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              <p className="text-[10px] font-bold uppercase tracking-widest">
                Split shipment recommended
              </p>
            </div>
            <p className="text-xs text-foreground/80 mt-1.5 leading-snug">
              {rec.splitShipment.reason}
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border">
            {rec.splitShipment.trucks.map((tr, i) => (
              <div key={i} className="bg-card p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Truck {i + 1}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Truck className="size-5 text-foreground" />
                    <p className="text-lg font-semibold">{tr.trailer.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{tr.trailer.description}</p>
                  <div className="mt-3 space-y-1 font-mono text-[11px]">
                    <div>
                      Carries <span className="font-bold text-foreground">{tr.summary}</span>
                    </div>
                    <div>
                      Deck used{" "}
                      <span className="font-bold text-foreground">{tr.linearFt.toFixed(1)} ft</span> ·{" "}
                      {Math.round(tr.deckAreaPct)}% area
                    </div>
                  </div>
                </div>
                <TrailerLoadDiagram trailer={tr.trailer} layout={tr.layout} />
              </div>
            ))}
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

function EnclosedCandidates({ candidates, pickId, selectedId, onSelect }: { candidates: Recommendation["candidates"]; pickId?: string; selectedId?: string; onSelect: (id: string) => void }) {
  const list = candidates.filter((c) => ["box-16", "box-26", "dryvan-53"].includes(c.trailer.id));
  if (list.length === 0) return <p className="text-xs text-muted-foreground">No enclosed candidates.</p>;
  const selected = list.find((c) => c.trailer.id === selectedId) ?? list.find((c) => c.trailer.id === pickId) ?? list[0];
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Floor-Area Utilization by Truck · tap to view layout
      </p>
      <div className="grid grid-cols-3 gap-px bg-border">
        {list.map((c) => {
          const isPick = pickId === c.trailer.id;
          const isSelected = selected.trailer.id === c.trailer.id;
          return (
            <button
              key={c.trailer.id}
              type="button"
              onClick={() => onSelect(c.trailer.id)}
              className={`p-4 bg-card text-left transition-colors ${isSelected ? "ring-2 ring-rule ring-inset" : "hover:bg-secondary"}`}
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
                  Won&apos;t fit
                </p>
              )}
            </button>
          );
        })}
      </div>
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <p className="text-sm font-bold">{selected.trailer.name}</p>
          <span className="text-[10px] font-mono text-muted-foreground uppercase">
            max {(selected.trailer.maxHeight / 12).toFixed(1)}&apos; tall
            {pickId === selected.trailer.id && (
              <span className="ml-2 text-success font-bold">· pick</span>
            )}
          </span>
        </div>
        <ScenarioComparison candidate={selected} />
        {selected.curbStacks.length > 0 && (
          <div className="pt-2">
            <CurbStackDiagram stacks={selected.curbStacks} maxHeightIn={selected.trailer.maxHeight} />
          </div>
        )}
      </div>
    </div>
  );
}

function OpenDeckCandidates({ candidates, pickId, selectedId, onSelect }: { candidates: Recommendation["candidates"]; pickId?: string; selectedId?: string; onSelect: (id: string) => void }) {
  const list = candidates.filter((c) => ["hotshot-40", "flatbed-48", "conestoga-48", "stepdeck-53", "rgn-53"].includes(c.trailer.id));
  if (list.length === 0) return <p className="text-xs text-muted-foreground">No open-deck candidates.</p>;
  const selected = list.find((c) => c.trailer.id === selectedId) ?? list.find((c) => c.trailer.id === pickId) ?? list[0];
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Tap a trailer to view its layout
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-border">
        {list.map((c) => {
          const isPick = pickId === c.trailer.id;
          const isSelected = selected.trailer.id === c.trailer.id;
          return (
            <button
              key={c.trailer.id}
              type="button"
              onClick={() => onSelect(c.trailer.id)}
              className={`p-4 bg-card text-left transition-colors ${isSelected ? "ring-2 ring-rule ring-inset" : "hover:bg-secondary"}`}
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
                  Won&apos;t fit
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OpenDeckCandidates({ candidates, pickId }: { candidates: Recommendation["candidates"]; pickId?: string }) {
  const list = candidates.filter((c) => ["hotshot-40", "flatbed-48", "conestoga-48", "stepdeck-53", "rgn-53"].includes(c.trailer.id));
  if (list.length === 0) return <p className="text-xs text-muted-foreground">No open-deck candidates.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-border">
        {list.map((c) => {
          const isPick = pickId === c.trailer.id;
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
                  Won&apos;t fit
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="space-y-3 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Recommended Load Layout — Compare Packing Scenarios
        </p>
        <p className="text-xs text-muted-foreground">
          Switch between scenarios to compare trade-offs: <strong>Balanced</strong> is the
          default shelf pack; <strong>Min Overhang</strong> rotates and reorders to keep
          freight on-deck; <strong>Max Gaskets</strong> fills leftover deck area with extra
          gasket pallets.
        </p>
        <div className="divide-y-2 divide-rule">
          {list.filter((c) => c.trailer.id === pickId).map((c) => {
            const isPick = true;

            return (
              <div key={c.trailer.id} className="py-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-sm font-bold">{c.trailer.name}</p>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">
                    max {(c.trailer.maxHeight / 12).toFixed(1)}&apos; tall
                    {isPick && (
                      <span className="ml-2 text-success font-bold">· pick</span>
                    )}
                  </span>
                </div>
                <ScenarioComparison candidate={c} />
                {c.curbStacks.length > 0 && (
                  <div className="pt-2">
                    <CurbStackDiagram stacks={c.curbStacks} maxHeightIn={c.trailer.maxHeight} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

function ScenarioComparison({ candidate }: { candidate: Recommendation["candidates"][number] }) {
  const scenarios = candidate.scenarios.length > 0
    ? candidate.scenarios
    : [{ id: "balanced" as const, name: "Balanced", description: "", layout: candidate.layout, extraGasketPallets: 0 }];
  const [active, setActive] = useState<string>(scenarios[0].id);
  const current = scenarios.find((s) => s.id === active) ?? scenarios[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-px bg-border border border-rule">
        {scenarios.map((s) => {
          const isActive = s.id === active;
          const overhangFt = s.layout.totalOverhangIn / 12;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`p-2.5 text-left transition-colors ${
                isActive ? "bg-card ring-2 ring-rule ring-inset" : "bg-secondary hover:bg-card"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest">
                {s.name}
              </p>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground space-y-0.5">
                <div>
                  Items <span className="text-foreground font-bold">{s.layout.placedCount}</span>
                  {s.layout.unplacedCount > 0 && (
                    <span className="text-warning"> (+{s.layout.unplacedCount} unplaced)</span>
                  )}
                </div>
                <div>
                  Overhang{" "}
                  <span className={overhangFt > 0 ? "text-warning font-bold" : "text-foreground font-bold"}>
                    {overhangFt.toFixed(1)}&apos;
                  </span>
                </div>
                {s.extraGasketPallets > 0 && (
                  <div>
                    Extra pallets{" "}
                    <span className="text-success font-bold">+{s.extraGasketPallets}</span>
                  </div>
                )}
                {s.layout.weightLb > 0 && (
                  <div>
                    Weight{" "}
                    <span className="text-foreground font-bold">
                      {Math.round(s.layout.weightLb).toLocaleString()} lb
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground italic">{current.description}</p>
      <TrailerLoadDiagram trailer={candidate.trailer} layout={current.layout} />
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
