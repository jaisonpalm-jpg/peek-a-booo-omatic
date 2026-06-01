import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw, RefreshCw, AlertTriangle } from "lucide-react";
import { effectiveDims } from "@/lib/freight/recommend";
import type { Piece, Recommendation } from "@/lib/freight/types";

interface Props {
  pieces: Piece[];
  rec: Recommendation;
}

interface Instance {
  /** stable id: `${pieceId}#${index}` */
  id: string;
  pieceId: string;
  label: string;
  /** Base (un-rotated) plan-view dims, in inches */
  baseL: number;
  baseW: number;
}

interface Placement {
  x: number; // inches from nose
  y: number; // inches from left edge
  rotated: boolean; // 90° in plan view (swap L/W)
}

const SNAP_IN = 6; // snap to 6"
const PIECE_COLORS = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function buildInstances(pieces: Piece[]): Instance[] {
  const out: Instance[] = [];
  pieces.forEach((p) => {
    if (p.qty <= 0 || p.length <= 0) return;
    const d = effectiveDims(p);
    for (let i = 0; i < p.qty; i++) {
      out.push({
        id: `${p.id}#${i}`,
        pieceId: p.id,
        label: p.qty > 1 ? `${p.description} #${i + 1}` : p.description,
        baseL: d.length,
        baseW: d.width,
      });
    }
  });
  return out;
}

/** Initial shelf-pack placements keyed by instance id. */
function autoPack(insts: Instance[], deckWidthIn: number): Record<string, Placement> {
  const placements: Record<string, Placement> = {};
  // sort by width desc, then length desc
  const sorted = [...insts].sort((a, b) => (b.baseW - a.baseW) || (b.baseL - a.baseL));
  let cursorX = 0;
  let rowY = 0;
  let rowLen = 0;
  let widthLeft = deckWidthIn;
  for (const inst of sorted) {
    if (inst.baseW > widthLeft) {
      cursorX += rowLen;
      rowY = 0;
      rowLen = 0;
      widthLeft = deckWidthIn;
    }
    placements[inst.id] = { x: cursorX, y: rowY, rotated: false };
    rowY += inst.baseW;
    widthLeft -= inst.baseW;
    if (inst.baseL > rowLen) rowLen = inst.baseL;
  }
  return placements;
}

function dims(inst: Instance, p: Placement) {
  return p.rotated
    ? { length: inst.baseW, width: inst.baseL }
    : { length: inst.baseL, width: inst.baseW };
}

function snap(v: number) {
  return Math.round(v / SNAP_IN) * SNAP_IN;
}

export function LoadingDiagram({ pieces, rec }: Props) {
  const trailer = rec.trailer;

  const instances = useMemo(() => buildInstances(pieces), [pieces]);

  // Key to detect when the pool of instances or trailer geometry changes.
  const layoutKey = useMemo(
    () =>
      `${trailer?.id ?? "none"}|${instances
        .map((i) => `${i.id}:${i.baseL}x${i.baseW}`)
        .join(",")}`,
    [trailer?.id, instances],
  );

  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layoutKeyRef = useRef<string>("");

  // Re-seed placements only when the pool actually changes (preserves user drags otherwise).
  useEffect(() => {
    if (!trailer) {
      setPlacements({});
      layoutKeyRef.current = layoutKey;
      return;
    }
    if (layoutKeyRef.current !== layoutKey) {
      setPlacements(autoPack(instances, trailer.deckWidth));
      layoutKeyRef.current = layoutKey;
    }
  }, [layoutKey, instances, trailer]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    id: string;
    grabDx: number; // inches offset from piece origin to pointer
    grabDy: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);

  if (!trailer) {
    return (
      <div className="bg-card ring-1 ring-border p-6 text-center text-xs text-muted-foreground uppercase tracking-widest">
        No trailer recommended — add pieces to see the diagram.
      </div>
    );
  }

  // Color map by pieceId (stable across rotations/drags)
  const colorByPiece = new Map<string, string>();
  let ci = 0;
  for (const inst of instances) {
    if (!colorByPiece.has(inst.pieceId)) {
      colorByPiece.set(inst.pieceId, PIECE_COLORS[ci % PIECE_COLORS.length]);
      ci++;
    }
  }

  // Per-instance violations + farthest extent
  let totalLengthUsed = 0;
  let overhangCount = 0;
  let widthViolationCount = 0;
  const status: Record<
    string,
    { overhang: boolean; oversizeWidth: boolean; offDeck: boolean }
  > = {};
  for (const inst of instances) {
    const p = placements[inst.id];
    if (!p) continue;
    const d = dims(inst, p);
    const farX = p.x + d.length;
    const farY = p.y + d.width;
    totalLengthUsed = Math.max(totalLengthUsed, farX);
    const overhang = farX > trailer.deckLength;
    const offDeck = farX > trailer.deckLength + trailer.maxOverhang;
    const oversizeWidth = farY > trailer.deckWidth;
    status[inst.id] = { overhang, oversizeWidth, offDeck };
    if (overhang) overhangCount++;
    if (oversizeWidth) widthViolationCount++;
  }

  const capacityLen = trailer.deckLength + trailer.maxOverhang;
  const padTop = 28;
  const padSide = 20;
  const labelGutter = 28;
  const vbW = capacityLen + padSide * 2;
  const vbH = trailer.deckWidth + padTop + labelGutter;

  const ticks: number[] = [];
  for (let ft = 0; ft <= capacityLen / 12; ft += 5) ticks.push(ft);

  // Convert client coords → SVG inch coords
  function clientToInches(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x - padSide, y: loc.y - padTop };
  }

  function onPointerDown(e: React.PointerEvent<SVGGElement>, inst: Instance) {
    const p = placements[inst.id];
    if (!p) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = clientToInches(e.clientX, e.clientY);
    dragRef.current = {
      id: inst.id,
      grabDx: x - p.x,
      grabDy: y - p.y,
      pointerId: e.pointerId,
      moved: false,
    };
    setSelectedId(inst.id);
  }

  function onPointerMove(e: React.PointerEvent<SVGGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const inst = instances.find((i) => i.id === drag.id);
    if (!inst) return;
    const p = placements[drag.id];
    if (!p) return;
    const d = dims(inst, p);
    const { x, y } = clientToInches(e.clientX, e.clientY);
    let nx = snap(x - drag.grabDx);
    let ny = snap(y - drag.grabDy);
    // Constrain origin: allow overhang past deck end up to capacityLen; keep y within deck width.
    nx = Math.max(0, Math.min(nx, capacityLen - Math.min(d.length, capacityLen)));
    ny = Math.max(0, Math.min(ny, trailer.deckWidth - Math.min(d.width, trailer.deckWidth)));
    if (nx !== p.x || ny !== p.y) {
      drag.moved = true;
      setPlacements((prev) => ({ ...prev, [drag.id]: { ...prev[drag.id], x: nx, y: ny } }));
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGGElement>) {
    if (dragRef.current) {
      (e.target as Element).releasePointerCapture?.(dragRef.current.pointerId);
      dragRef.current = null;
    }
  }

  function rotate(id: string) {
    setPlacements((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const inst = instances.find((i) => i.id === id);
      if (!inst) return prev;
      const rotated = !cur.rotated;
      const next = rotated
        ? { length: inst.baseW, width: inst.baseL }
        : { length: inst.baseL, width: inst.baseW };
      // Keep on deck if possible after rotation
      const nx = Math.max(0, Math.min(cur.x, capacityLen - Math.min(next.length, capacityLen)));
      const ny = Math.max(
        0,
        Math.min(cur.y, trailer.deckWidth - Math.min(next.width, trailer.deckWidth)),
      );
      return { ...prev, [id]: { x: nx, y: ny, rotated } };
    });
  }

  function reset() {
    setPlacements(autoPack(instances, trailer.deckWidth));
    setSelectedId(null);
  }

  const selectedInst = selectedId ? instances.find((i) => i.id === selectedId) : null;
  const selectedPlacement = selectedId ? placements[selectedId] : null;

  return (
    <div className="bg-card ring-2 ring-rule overflow-hidden">
      <div className="px-5 py-3 border-b-2 border-rule flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Loading Diagram — Interactive
          </p>
          <p className="text-sm font-semibold mt-0.5">{trailer.name} — top-down</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => selectedId && rotate(selectedId)}
            disabled={!selectedId}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-2 ring-1 ring-rule hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCw className="size-3.5" />
            Rotate
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-2 bg-rule text-background hover:opacity-90"
          >
            <RefreshCw className="size-3.5" />
            Auto-pack
          </button>
        </div>
      </div>

      {(overhangCount > 0 || widthViolationCount > 0) && (
        <div className="px-5 py-2.5 bg-warning-soft border-b border-warning/30 flex items-center gap-2 text-xs">
          <AlertTriangle className="size-3.5 text-warning shrink-0" />
          <span className="font-semibold">
            {overhangCount > 0 && `${overhangCount} piece${overhangCount === 1 ? "" : "s"} past deck end`}
            {overhangCount > 0 && widthViolationCount > 0 && " · "}
            {widthViolationCount > 0 &&
              `${widthViolationCount} extends beyond deck width`}
          </span>
        </div>
      )}

      <div className="p-4 overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="w-full h-auto touch-none select-none"
          style={{ minWidth: 520 }}
          role="img"
          aria-label="Interactive top-down loading diagram"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerDown={() => setSelectedId(null)}
        >
          <defs>
            <pattern
              id="hatch-warn"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="#f59e0b" strokeWidth="1.5" />
            </pattern>
            <pattern
              id="hatch-err"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="2" />
            </pattern>
          </defs>

          <text
            x={padSide}
            y={padTop - 10}
            className="fill-muted-foreground"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2 }}
          >
            NOSE →
          </text>
          <text
            x={padSide + capacityLen}
            y={padTop - 10}
            textAnchor="end"
            className="fill-muted-foreground"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2 }}
          >
            ← REAR
          </text>

          {/* Deck */}
          <rect
            x={padSide}
            y={padTop}
            width={trailer.deckLength}
            height={trailer.deckWidth}
            fill="hsl(220 14% 96%)"
            stroke="currentColor"
            strokeWidth={2}
            className="text-foreground"
          />
          {/* Overhang zone */}
          {trailer.maxOverhang > 0 && (
            <rect
              x={padSide + trailer.deckLength}
              y={padTop}
              width={trailer.maxOverhang}
              height={trailer.deckWidth}
              fill="none"
              stroke="currentColor"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              className="text-muted-foreground"
            />
          )}
          {/* Deck-end marker */}
          {trailer.maxOverhang > 0 && (
            <line
              x1={padSide + trailer.deckLength}
              y1={padTop - 4}
              x2={padSide + trailer.deckLength}
              y2={padTop + trailer.deckWidth + 4}
              stroke="currentColor"
              strokeWidth={2}
              className="text-foreground"
            />
          )}

          {/* Pieces */}
          {instances.map((inst) => {
            const p = placements[inst.id];
            if (!p) return null;
            const d = dims(inst, p);
            const s = status[inst.id] ?? { overhang: false, oversizeWidth: false, offDeck: false };
            const x = padSide + p.x;
            const y = padTop + p.y;
            const color = colorByPiece.get(inst.pieceId)!;
            const selected = selectedId === inst.id;
            const showLabel = d.length >= 36 && d.width >= 18;
            return (
              <g
                key={inst.id}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => onPointerDown(e, inst)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  rotate(inst.id);
                }}
              >
                <rect
                  x={x}
                  y={y}
                  width={d.length}
                  height={d.width}
                  fill={color}
                  fillOpacity={selected ? 0.45 : 0.28}
                  stroke={color}
                  strokeWidth={selected ? 3 : 1.5}
                />
                {(s.overhang || s.oversizeWidth) && (
                  <rect
                    x={x}
                    y={y}
                    width={d.length}
                    height={d.width}
                    fill={s.offDeck || s.oversizeWidth ? "url(#hatch-err)" : "url(#hatch-warn)"}
                    pointerEvents="none"
                  />
                )}
                {showLabel && (
                  <text
                    x={x + d.length / 2}
                    y={y + d.width / 2 + 3}
                    textAnchor="middle"
                    style={{
                      fontSize: Math.min(11, d.width / 4),
                      fontWeight: 600,
                      pointerEvents: "none",
                    }}
                    className="fill-foreground"
                  >
                    {inst.label.length > 24 ? inst.label.slice(0, 22) + "…" : inst.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Foot ruler */}
          {ticks.map((ft) => {
            const xt = padSide + ft * 12;
            return (
              <g key={ft}>
                <line
                  x1={xt}
                  y1={padTop + trailer.deckWidth}
                  x2={xt}
                  y2={padTop + trailer.deckWidth + 6}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-muted-foreground"
                />
                <text
                  x={xt}
                  y={padTop + trailer.deckWidth + 18}
                  textAnchor="middle"
                  style={{ fontSize: 9, fontWeight: 600 }}
                  className="fill-muted-foreground"
                >
                  {ft}′
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="px-5 py-3 border-t-2 border-border space-y-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 border-2 border-foreground" />
            Deck
          </span>
          {trailer.maxOverhang > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 border-2 border-dashed border-muted-foreground" />
              Legal Overhang
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3" style={{ background: "#f59e0b", opacity: 0.6 }} />
            In Overhang
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3" style={{ background: "#ef4444", opacity: 0.6 }} />
            Past Limit
          </span>
          <span className="ml-auto font-mono normal-case tracking-normal text-foreground">
            {(totalLengthUsed / 12).toFixed(1)}′ used of {(trailer.deckLength / 12).toFixed(0)}′ +{" "}
            {(trailer.maxOverhang / 12).toFixed(0)}′ legal
          </span>
        </div>
        {selectedInst && selectedPlacement && (
          <div className="pt-2 border-t border-border font-mono normal-case tracking-normal text-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-bold uppercase tracking-widest text-muted-foreground">
              Selected:
            </span>
            <span>{selectedInst.label}</span>
            <span>x {(selectedPlacement.x / 12).toFixed(1)}′</span>
            <span>y {(selectedPlacement.y / 12).toFixed(1)}′</span>
            <span>{selectedPlacement.rotated ? "rotated 90°" : "as-laid"}</span>
          </div>
        )}
        <p className="pt-1 normal-case tracking-normal font-normal text-muted-foreground">
          Drag pieces to reposition · double-click or use Rotate to spin 90° · snaps to 6″ grid.
        </p>
      </div>
    </div>
  );
}
