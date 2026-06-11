import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2, Truck, Wand2 } from "lucide-react";
import {
  evaluateManualSplit,
  MANUAL_SPLIT_TRAILER_IDS,
  type ManualTruckConfig,
} from "@/lib/freight/recommend";
import { TRAILERS } from "@/lib/freight/trailers";
import type { Piece, Recommendation, TrailerId } from "@/lib/freight/types";
import { TrailerLoadDiagram } from "./TrailerLoadDiagram";

interface Props {
  pieces: Piece[];
  rec: Recommendation;
  maxCurbStack: number;
  smartStack?: boolean;
}

const TRAILER_OPTIONS = TRAILERS.filter((t) =>
  (MANUAL_SPLIT_TRAILER_IDS as readonly string[]).includes(t.id),
);

function defaultTrailerId(rec: Recommendation): TrailerId {
  return (
    rec.trailer?.id ??
    rec.splitShipment?.trucks[0]?.trailer.id ??
    "flatbed-48"
  );
}

function seedConfigs(rec: Recommendation): ManualTruckConfig[] {
  if (rec.splitShipment) {
    return rec.splitShipment.trucks.map((t) => ({
      trailerId: t.trailer.id,
      pieceIds: [...t.pieceIds],
    }));
  }
  return [];
}

export function ManualSplitConfigurator({ pieces, rec, maxCurbStack, smartStack = true }: Props) {
  const validPieces = useMemo(
    () => pieces.filter((p) => p.qty > 0 && p.length > 0),
    [pieces],
  );

  const [enabled, setEnabled] = useState<boolean>(() => !!rec.splitShipment);
  const [configs, setConfigs] = useState<ManualTruckConfig[]>(() => seedConfigs(rec));

  // Auto-enable + seed when the recommendation flips to a multi-truck split.
  const splitKey = rec.splitShipment
    ? rec.splitShipment.trucks.map((t) => `${t.trailer.id}:${t.pieceIds.join(",")}`).join("|")
    : "";
  useEffect(() => {
    if (!rec.splitShipment) return;
    setEnabled(true);
    setConfigs((prev) => {
      const allEmpty = prev.length === 0 || prev.every((c) => c.pieceIds.length === 0);
      if (allEmpty) return seedConfigs(rec);
      return prev;
    });
  }, [splitKey, rec]);

  // Drop pieces from configs when removed from the manifest.
  useEffect(() => {
    const ids = new Set(validPieces.map((p) => p.id));
    setConfigs((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        const filtered = c.pieceIds.filter((id) => ids.has(id));
        if (filtered.length !== c.pieceIds.length) changed = true;
        return { ...c, pieceIds: filtered };
      });
      return changed ? next : prev;
    });
  }, [validPieces]);

  const evalResult = useMemo(
    () => evaluateManualSplit(validPieces, configs, { maxCurbStack, smartStack }),
    [validPieces, configs, maxCurbStack, smartStack],
  );

  const pieceToTruck = useMemo(() => {
    const m = new Map<string, number>();
    configs.forEach((c, i) => c.pieceIds.forEach((id) => m.set(id, i)));
    return m;
  }, [configs]);

  /**
   * Assign a piece to a truck. If the assignment causes the target truck
   * to overflow, automatically peel the largest OTHER pieces off that
   * truck onto the next available truck (creating a new one if needed)
   * until the just-assigned piece fits.
   */
  function assign(pieceId: string, truckIdx: number | -1) {
    setConfigs((prev) => {
      // Strip the piece from every truck first.
      let next: ManualTruckConfig[] = prev.map((c) => ({
        ...c,
        pieceIds: c.pieceIds.filter((id) => id !== pieceId),
      }));
      if (truckIdx === -1) return next;
      if (truckIdx < 0 || truckIdx >= next.length) return next;
      next = next.map((c, i) =>
        i === truckIdx ? { ...c, pieceIds: [...c.pieceIds, pieceId] } : c,
      );

      const piecesById = new Map(validPieces.map((p) => [p.id, p]));
      // Safety cap to prevent infinite loop on pathological inputs.
      for (let guard = 0; guard < 50; guard++) {
        const ev = evaluateManualSplit(validPieces, next, { maxCurbStack, smartStack });
        const t = ev.trucks[truckIdx];
        if (!t || t.fits) break;

        // Find the largest piece on this truck OTHER than the one just
        // assigned — moving the biggest frees the most space fastest.
        const movable = next[truckIdx].pieceIds.filter((id) => id !== pieceId);
        if (movable.length === 0) break;
        movable.sort((a, b) => {
          const pa = piecesById.get(a);
          const pb = piecesById.get(b);
          const fa = pa ? pa.length * pa.width : 0;
          const fb = pb ? pb.length * pb.width : 0;
          return fb - fa;
        });
        const moveId = movable[0];

        // Pick the next truck (any other truck), or create one.
        let targetIdx = next.findIndex((_, i) => i !== truckIdx);
        if (targetIdx === -1) {
          next = [...next, { trailerId: defaultTrailerId(rec), pieceIds: [] }];
          targetIdx = next.length - 1;
        }
        next = next.map((c, i) => {
          if (i === truckIdx) return { ...c, pieceIds: c.pieceIds.filter((id) => id !== moveId) };
          if (i === targetIdx) return { ...c, pieceIds: [...c.pieceIds, moveId] };
          return c;
        });
      }
      return next;
    });
  }

  function addTruck() {
    setConfigs((prev) => [...prev, { trailerId: defaultTrailerId(rec), pieceIds: [] }]);
  }

  function removeTruck(idx: number) {
    setConfigs((prev) => prev.filter((_, i) => i !== idx));
  }

  function setTrailer(idx: number, trailerId: TrailerId) {
    setConfigs((prev) => prev.map((c, i) => (i === idx ? { ...c, trailerId } : c)));
  }

  function autoFill() {
    // Distribute unassigned pieces, longest first, to the truck with most
    // remaining deck area capacity.
    setConfigs((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.map((c) => ({ ...c, pieceIds: [...c.pieceIds] }));
      const assigned = new Set<string>(next.flatMap((c) => c.pieceIds));
      const queue = [...validPieces]
        .filter((p) => !assigned.has(p.id))
        .sort((a, b) => b.length * b.width - a.length * a.width);
      for (const p of queue) {
        // Try each truck; pick the one with lowest deckAreaPct after adding it that still fits.
        let bestIdx = -1;
        let bestPct = Number.POSITIVE_INFINITY;
        for (let i = 0; i < next.length; i++) {
          const trial = next.map((c, j) =>
            j === i ? { ...c, pieceIds: [...c.pieceIds, p.id] } : c,
          );
          const ev = evaluateManualSplit(validPieces, trial, { maxCurbStack, smartStack });
          const t = ev.trucks[i];
          if (t.fits && t.deckAreaPct < bestPct) {
            bestPct = t.deckAreaPct;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) {
          // Fall back: assign to least-loaded truck even if overflow.
          let minPct = Number.POSITIVE_INFINITY;
          for (let i = 0; i < next.length; i++) {
            const ev = evaluateManualSplit(validPieces, next, { maxCurbStack, smartStack });
            if (ev.trucks[i].deckAreaPct < minPct) {
              minPct = ev.trucks[i].deckAreaPct;
              bestIdx = i;
            }
          }
          if (bestIdx === -1) bestIdx = 0;
        }
        next[bestIdx].pieceIds.push(p.id);
      }
      return next;
    });
  }

  function resetToRecommendation() {
    setConfigs(seedConfigs(rec));
  }

  if (validPieces.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="inline-flex items-center gap-2 bg-rule text-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
        Manual Split Configurator
      </div>

      <div className="bg-card ring-2 ring-rule p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Configure trucks manually</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-prose leading-snug">
              Override the auto recommendation: add trucks, pick trailer types, and
              assign individual pieces. Confidence updates live based on fit,
              utilization, and unassigned pieces.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                const on = e.target.checked;
                setEnabled(on);
                if (on && configs.length === 0) {
                  setConfigs(
                    seedConfigs(rec).length > 0
                      ? seedConfigs(rec)
                      : [{ trailerId: defaultTrailerId(rec), pieceIds: validPieces.map((p) => p.id) }],
                  );
                }
              }}
              className="size-4 accent-foreground"
            />
            Enable
          </label>
        </div>

        {enabled && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border ring-1 ring-rule">
              <div className="bg-card p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Confidence
                </p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-semibold tabular-nums">
                    {Math.round(evalResult.confidence)}
                  </span>
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <div className="w-full h-1.5 bg-secondary overflow-hidden mt-2">
                  <div
                    className={`h-full transition-all ${
                      evalResult.confidence >= 80
                        ? "bg-success"
                        : evalResult.confidence >= 60
                          ? "bg-primary"
                          : "bg-warning"
                    }`}
                    style={{ width: `${evalResult.confidence}%` }}
                  />
                </div>
              </div>
              <div className="bg-card p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Trucks
                </p>
                <p className="text-2xl font-semibold mt-1 tabular-nums">
                  {configs.length}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {evalResult.allFit ? (
                    <span className="inline-flex items-center gap-1 text-success font-bold uppercase tracking-widest">
                      <CheckCircle2 className="size-3" />
                      All fit
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-warning font-bold uppercase tracking-widest">
                      <AlertTriangle className="size-3" />
                      Needs work
                    </span>
                  )}
                </p>
              </div>
              <div className="bg-card p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Unassigned
                </p>
                <p
                  className={`text-2xl font-semibold mt-1 tabular-nums ${
                    evalResult.unassignedPieceIds.length > 0 ? "text-warning" : ""
                  }`}
                >
                  {evalResult.unassignedPieceIds.length}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  of {validPieces.length} pieces
                </p>
              </div>
            </div>

            <p className="text-xs text-foreground/80 leading-snug">{evalResult.reason}</p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addTruck}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-2 bg-rule text-background hover:opacity-90"
              >
                <Plus className="size-3.5" />
                Add truck
              </button>
              <button
                type="button"
                onClick={autoFill}
                disabled={configs.length === 0 || evalResult.unassignedPieceIds.length === 0}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-2 bg-background ring-2 ring-rule hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className="size-3.5" />
                Auto-fill unassigned
              </button>
              <button
                type="button"
                onClick={resetToRecommendation}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-2 bg-background ring-2 ring-rule hover:bg-secondary"
              >
                Reset to recommendation
              </button>
            </div>

            {configs.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No trucks configured. Click <strong>Add truck</strong> to begin.
              </p>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {configs.map((cfg, i) => {
                const t = evalResult.trucks[i];
                return (
                  <div
                    key={i}
                    className={`bg-card ring-2 p-4 space-y-3 ${
                      t.pieceIds.length === 0
                        ? "ring-border"
                        : t.fits
                          ? "ring-success"
                          : "ring-warning"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Truck className="size-5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Truck {i + 1}
                          </p>
                          <p className="text-sm font-bold truncate">{t.trailer.name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTruck(i)}
                        aria-label="Remove truck"
                        className="text-muted-foreground hover:text-warning p-1"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <select
                      value={cfg.trailerId}
                      onChange={(e) => setTrailer(i, e.target.value as TrailerId)}
                      className="w-full text-xs font-mono bg-secondary border-2 border-rule px-2 py-1.5 focus:outline-none focus:bg-background"
                    >
                      {TRAILER_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-3 gap-px bg-border">
                      <div className="bg-card p-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          Deck %
                        </p>
                        <p className="text-sm font-mono font-bold mt-0.5 tabular-nums">
                          {Math.round(t.deckAreaPct)}%
                        </p>
                      </div>
                      <div className="bg-card p-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          Length
                        </p>
                        <p className="text-sm font-mono font-bold mt-0.5 tabular-nums">
                          {t.linearFt.toFixed(1)}ʹ
                        </p>
                      </div>
                      <div className="bg-card p-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          Pieces
                        </p>
                        <p className="text-sm font-mono font-bold mt-0.5 tabular-nums">
                          {t.pieceIds.length}
                        </p>
                      </div>
                    </div>

                    {t.issues.length > 0 && (
                      <ul className="space-y-1">
                        {t.issues.map((iss, k) => (
                          <li
                            key={k}
                            className="text-[11px] text-warning border-l-2 border-warning pl-2 py-0.5 leading-snug"
                          >
                            {iss}
                          </li>
                        ))}
                      </ul>
                    )}

                    {t.pieceIds.length > 0 && (
                      <TrailerLoadDiagram trailer={t.trailer} layout={t.layout} />
                    )}
                  </div>
                );
              })}
            </div>

            {configs.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Piece assignments
                </p>
                <div className="ring-1 ring-border divide-y divide-border">
                  {validPieces.map((p) => {
                    const truckIdx = pieceToTruck.get(p.id) ?? -1;
                    const isUnassigned = truckIdx === -1;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 px-3 py-2 text-xs ${
                          isUnassigned ? "bg-warning-soft" : "bg-card"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">
                            {p.description || "(unnamed)"}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {p.length}″ × {p.width}″ × {p.height}″ · qty {p.qty}
                          </p>
                        </div>
                        <select
                          value={truckIdx}
                          onChange={(e) => assign(p.id, Number(e.target.value))}
                          className={`text-[11px] font-mono px-2 py-1 border-2 border-rule focus:outline-none ${
                            isUnassigned ? "bg-warning-soft" : "bg-secondary"
                          }`}
                        >
                          <option value={-1}>— unassigned —</option>
                          {configs.map((_, i) => (
                            <option key={i} value={i}>
                              Truck {i + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
