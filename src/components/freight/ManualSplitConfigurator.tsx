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
import { QuickAddPieces } from "./QuickAddPieces";

interface Props {
  pieces: Piece[];
  rec: Recommendation;
  maxCurbStack: number;
  smartStack?: boolean;
  /** When provided, ad-hoc pieces can be added directly from the configurator. */
  onAddPieces?: (pieces: Piece[]) => void;
  /** When provided, enables splitting a piece's qty across multiple trucks. */
  onReplacePiece?: (pieceId: string, replacement: Piece[]) => void;
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

function pieceFootprint(piece: Piece | undefined): number {
  return piece ? piece.length * piece.width : 0;
}

export function ManualSplitConfigurator({ pieces, rec, maxCurbStack, smartStack = true, onAddPieces, onReplacePiece }: Props) {
  const validPieces = useMemo(
    () => pieces.filter((p) => p.qty > 0 && p.length > 0),
    [pieces],
  );

  const [enabled, setEnabled] = useState<boolean>(() => !!rec.splitShipment);
  const [configs, setConfigs] = useState<ManualTruckConfig[]>(() => seedConfigs(rec));
  const [adhocTarget, setAdhocTarget] = useState<number>(-1);
  const [splitOpenId, setSplitOpenId] = useState<string | null>(null);
  const [splitDraft, setSplitDraft] = useState<number[]>([]); // index 0 = unassigned, 1..N = trucks

  // Auto-enable + seed when the recommendation flips to a multi-truck split.
  const splitKey = rec.splitShipment
    ? rec.splitShipment.trucks.map((t) => `${t.trailer.id}:${t.pieceIds.join(",")}`).join("|")
    : "";
  useEffect(() => {
    if (!rec.splitShipment) return;
    setEnabled(true);
    setConfigs(seedConfigs(rec));
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

  function bestTrailerFor(pieceIds: string[]): TrailerId {
    const options = TRAILER_OPTIONS.map((opt) => {
      const ev = evaluateManualSplit(validPieces, [{ trailerId: opt.id, pieceIds }], { maxCurbStack, smartStack });
      const t = ev.trucks[0];
      return {
        id: opt.id,
        fits: t.fits,
        issues: t.issues.length,
        area: opt.deckLength * opt.deckWidth,
        deckAreaPct: t.deckAreaPct,
      };
    }).sort((a, b) => {
      if (a.fits !== b.fits) return a.fits ? -1 : 1;
      if (a.issues !== b.issues) return a.issues - b.issues;
      if (a.fits && a.deckAreaPct !== b.deckAreaPct) return b.deckAreaPct - a.deckAreaPct;
      return a.area - b.area;
    });
    return options[0]?.id ?? defaultTrailerId(rec);
  }

  function placeMovedPiece(draft: ManualTruckConfig[], moveId: string, sourceIdx: number): ManualTruckConfig[] {
    const existingTargets = draft
      .map((_, i) => i)
      .filter((i) => i !== sourceIdx)
      .map((i) => {
        const trial = draft.map((c, j) =>
          j === i ? { ...c, pieceIds: [...c.pieceIds, moveId] } : c,
        );
        const ev = evaluateManualSplit(validPieces, trial, { maxCurbStack, smartStack });
        return { idx: i, fits: ev.trucks[i]?.fits ?? false, deckAreaPct: ev.trucks[i]?.deckAreaPct ?? 0 };
      })
      .filter((t) => t.fits)
      .sort((a, b) => b.deckAreaPct - a.deckAreaPct);

    if (existingTargets[0]) {
      const targetIdx = existingTargets[0].idx;
      return draft.map((c, i) =>
        i === targetIdx ? { ...c, pieceIds: [...c.pieceIds, moveId] } : c,
      );
    }

    const upgradeTargets = draft
      .map((c, i) => ({ idx: i, pieceIds: [...c.pieceIds, moveId] }))
      .filter((t) => t.idx !== sourceIdx)
      .map((t) => {
        const trailerId = bestTrailerFor(t.pieceIds);
        const ev = evaluateManualSplit(validPieces, [{ trailerId, pieceIds: t.pieceIds }], { maxCurbStack, smartStack });
        return { ...t, trailerId, fits: ev.trucks[0]?.fits ?? false, deckAreaPct: ev.trucks[0]?.deckAreaPct ?? 0 };
      })
      .filter((t) => t.fits)
      .sort((a, b) => b.deckAreaPct - a.deckAreaPct);
    if (upgradeTargets[0]) {
      const target = upgradeTargets[0];
      return draft.map((c, i) =>
        i === target.idx ? { trailerId: target.trailerId, pieceIds: target.pieceIds } : c,
      );
    }

    const emptyIdx = draft.findIndex((c, i) => i !== sourceIdx && c.pieceIds.length === 0);
    if (emptyIdx >= 0) {
      const trailerId = bestTrailerFor([moveId]);
      return draft.map((c, i) =>
        i === emptyIdx ? { trailerId, pieceIds: [moveId] } : c,
      );
    }

    return [...draft, { trailerId: bestTrailerFor([moveId]), pieceIds: [moveId] }];
  }

  function rebalanceOverflow(configsToBalance: ManualTruckConfig[], protectedByTruck = new Map<number, string>()): ManualTruckConfig[] {
    const piecesById = new Map(validPieces.map((p) => [p.id, p]));
    let next = configsToBalance.map((c) => ({ ...c, pieceIds: [...new Set(c.pieceIds)] }));

    for (let guard = 0; guard < 80; guard++) {
      const ev = evaluateManualSplit(validPieces, next, { maxCurbStack, smartStack });
      const sourceIdx = ev.trucks.findIndex((t) => t.pieceIds.length > 0 && !t.fits);
      if (sourceIdx === -1) break;

      const protectedId = protectedByTruck.get(sourceIdx);
      const movable = next[sourceIdx].pieceIds.filter((id) => id !== protectedId);
      if (movable.length === 0) break;

      const smallestFix = [...movable]
        .sort((a, b) => pieceFootprint(piecesById.get(a)) - pieceFootprint(piecesById.get(b)))
        .find((id) => {
          const trial = next.map((c, i) =>
            i === sourceIdx ? { ...c, pieceIds: c.pieceIds.filter((pid) => pid !== id) } : c,
          );
          return evaluateManualSplit(validPieces, trial, { maxCurbStack, smartStack }).trucks[sourceIdx]?.fits;
        });
      const moveId = smallestFix ?? [...movable].sort(
        (a, b) => pieceFootprint(piecesById.get(b)) - pieceFootprint(piecesById.get(a)),
      )[0];
      if (!moveId) break;

      const withoutSource = next.map((c, i) =>
        i === sourceIdx ? { ...c, pieceIds: c.pieceIds.filter((id) => id !== moveId) } : c,
      );
      next = placeMovedPiece(withoutSource, moveId, sourceIdx);
    }

    return next;
  }

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

      return rebalanceOverflow(next, new Map([[truckIdx, pieceId]]));
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
    // Distribute all pieces, largest first, into the truck that stays fitting
    // with the highest deck usage; create a second truck when needed.
    setConfigs((prev) => {
      let next = prev.length > 0
        ? prev.map((c) => ({ ...c, pieceIds: [...c.pieceIds] }))
        : [{ trailerId: defaultTrailerId(rec), pieceIds: [] }];
      const assigned = new Set(next.flatMap((c) => c.pieceIds));
      const queue = [...validPieces]
        .filter((p) => !assigned.has(p.id))
        .sort((a, b) => b.length * b.width - a.length * a.width);
      for (const p of queue) {
        // Try each truck; pick the one with highest deckAreaPct after adding it that still fits.
        let bestIdx = -1;
        let bestPct = -1;
        for (let i = 0; i < next.length; i++) {
          const trial = next.map((c, j) =>
            j === i ? { ...c, pieceIds: [...c.pieceIds, p.id] } : c,
          );
          const ev = evaluateManualSplit(validPieces, trial, { maxCurbStack, smartStack });
          const t = ev.trucks[i];
          if (t.fits && t.deckAreaPct > bestPct) {
            bestPct = t.deckAreaPct;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) {
          next = [...next, { trailerId: bestTrailerFor([p.id]), pieceIds: [p.id] }];
          continue;
        }
        next[bestIdx].pieceIds.push(p.id);
      }
      return rebalanceOverflow(next);
    });
  }

  function resetToRecommendation() {
    setConfigs(seedConfigs(rec));
  }

  function openSplit(p: Piece) {
    const buckets = new Array(configs.length + 1).fill(0);
    const truckIdx = pieceToTruck.get(p.id);
    if (truckIdx === undefined || truckIdx < 0) buckets[0] = p.qty;
    else buckets[truckIdx + 1] = p.qty;
    setSplitDraft(buckets);
    setSplitOpenId(p.id);
  }

  function applySplit(p: Piece) {
    if (!onReplacePiece) return;
    const sum = splitDraft.reduce((a, b) => a + b, 0);
    if (sum !== p.qty) return;
    const replacement: Piece[] = [];
    const newTargets: { id: string; truckIdx: number }[] = [];
    splitDraft.forEach((q, i) => {
      if (q <= 0) return;
      const newId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${p.id}-${i}-${Date.now()}`;
      replacement.push({ ...p, id: newId, qty: q });
      newTargets.push({ id: newId, truckIdx: i - 1 }); // -1 = unassigned
    });
    onReplacePiece(p.id, replacement);

    // Update configs: strip old id, place new ids on their target trucks.
    setConfigs((prev) => {
      let next = prev.map((c) => ({
        ...c,
        pieceIds: c.pieceIds.filter((id) => id !== p.id),
      }));
      for (const { id, truckIdx } of newTargets) {
        if (truckIdx < 0 || truckIdx >= next.length) continue;
        next = next.map((c, i) =>
          i === truckIdx ? { ...c, pieceIds: [...c.pieceIds, id] } : c,
        );
      }
      return next;
    });
    setSplitOpenId(null);
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
                disabled={evalResult.unassignedPieceIds.length === 0 && evalResult.allFit}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-2 bg-background ring-2 ring-rule hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className="size-3.5" />
                Auto-fit trucks
              </button>
              <button
                type="button"
                onClick={resetToRecommendation}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-2 bg-background ring-2 ring-rule hover:bg-secondary"
              >
                Reset to recommendation
              </button>
            </div>

            {onAddPieces && (
              <div className="ring-1 ring-border bg-secondary/40 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Add ad-hoc piece by raw dimensions
                  </p>
                  <label className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                    Assign to
                    <select
                      value={adhocTarget}
                      onChange={(e) => setAdhocTarget(Number(e.target.value))}
                      className="text-[11px] font-mono px-2 py-1 border-2 border-rule bg-background focus:outline-none"
                    >
                      <option value={-1}>— unassigned —</option>
                      {configs.map((_, i) => (
                        <option key={i} value={i}>
                          Truck {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <QuickAddPieces
                  hideHeader
                  compact
                  showDescription={false}
                  ctaLabel="Add piece"
                  onAdd={(added) => {
                    onAddPieces(added);
                    if (adhocTarget >= 0 && adhocTarget < configs.length) {
                      added.forEach((p) => assign(p.id, adhocTarget));
                    }
                  }}
                />
              </div>
            )}

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
