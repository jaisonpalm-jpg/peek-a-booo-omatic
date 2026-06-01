import { useMemo } from "react";
import { effectiveDims } from "@/lib/freight/recommend";
import type { Piece, Recommendation } from "@/lib/freight/types";

interface Props {
  pieces: Piece[];
  rec: Recommendation;
}

interface Placed {
  pieceId: string;
  label: string;
  x: number; // inches from nose
  y: number; // inches from left edge
  length: number;
  width: number;
  overhang: boolean;
  oversizeWidth: boolean;
}

// Simple shelf bin-packing (top-down): rows across deck width.
function packPieces(pieces: Piece[], deckWidthIn: number, deckLengthIn: number) {
  // Expand qty into individual instances; sort by width desc then length desc.
  type Inst = { piece: Piece; L: number; W: number; idx: number };
  const insts: Inst[] = [];
  pieces.forEach((p) => {
    if (p.qty <= 0 || p.length <= 0) return;
    const d = effectiveDims(p);
    for (let i = 0; i < p.qty; i++) {
      insts.push({ piece: p, L: d.length, W: d.width, idx: i + 1 });
    }
  });
  insts.sort((a, b) => (b.W - a.W) || (b.L - a.L));

  const placed: Placed[] = [];
  let cursorX = 0; // along length
  let rowY = 0;
  let rowLen = 0;
  let rowsWidthRemaining = deckWidthIn;

  for (const inst of insts) {
    // Start a new row if this piece doesn't fit width-wise in current row
    if (inst.W > rowsWidthRemaining) {
      cursorX += rowLen;
      rowY = 0;
      rowLen = 0;
      rowsWidthRemaining = deckWidthIn;
    }
    const overhang = cursorX + inst.L > deckLengthIn;
    const oversizeWidth = inst.W > deckWidthIn;
    placed.push({
      pieceId: inst.piece.id,
      label: inst.piece.qty > 1 ? `${inst.piece.description} #${inst.idx}` : inst.piece.description,
      x: cursorX,
      y: rowY,
      length: inst.L,
      width: Math.min(inst.W, deckWidthIn),
      overhang,
      oversizeWidth,
    });
    rowY += inst.W;
    rowsWidthRemaining -= inst.W;
    if (inst.L > rowLen) rowLen = inst.L;
  }
  const totalLengthUsed = cursorX + rowLen;
  return { placed, totalLengthUsed };
}

// Curated palette using design tokens via inline opacity blends.
const PIECE_COLORS = [
  "var(--chart-1, #4f46e5)",
  "var(--chart-2, #0ea5e9)",
  "var(--chart-3, #10b981)",
  "var(--chart-4, #f59e0b)",
  "var(--chart-5, #ef4444)",
  "var(--chart-6, #8b5cf6)",
];

export function LoadingDiagram({ pieces, rec }: Props) {
  const trailer = rec.trailer;
  const { placed, totalLengthUsed } = useMemo(() => {
    if (!trailer) return { placed: [] as Placed[], totalLengthUsed: 0 };
    return packPieces(pieces, trailer.deckWidth, trailer.deckLength);
  }, [pieces, trailer]);

  if (!trailer) {
    return (
      <div className="bg-card ring-1 ring-border p-6 text-center text-xs text-muted-foreground uppercase tracking-widest">
        No trailer recommended — add pieces to see the diagram.
      </div>
    );
  }

  // Color map by pieceId
  const colorByPiece = new Map<string, string>();
  let ci = 0;
  for (const p of placed) {
    if (!colorByPiece.has(p.pieceId)) {
      colorByPiece.set(p.pieceId, PIECE_COLORS[ci % PIECE_COLORS.length]);
      ci++;
    }
  }

  // SVG geometry: 1 inch = 1 unit; viewBox sized to capacity (deck + overhang).
  const capacityLen = trailer.deckLength + trailer.maxOverhang;
  const padTop = 24;
  const padSide = 16;
  const labelGutter = 28; // for the foot-tick ruler at bottom
  const vbW = capacityLen + padSide * 2;
  const vbH = trailer.deckWidth + padTop + labelGutter;

  // Foot ticks every 5 ft
  const ticks: number[] = [];
  for (let ft = 0; ft <= capacityLen / 12; ft += 5) ticks.push(ft);

  return (
    <div className="bg-card ring-2 ring-rule overflow-hidden">
      <div className="px-5 py-3 border-b-2 border-rule flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Loading Diagram
          </p>
          <p className="text-sm font-semibold mt-0.5">{trailer.name} — top-down</p>
        </div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {(trailer.deckLength / 12).toFixed(0)}′ × {(trailer.deckWidth / 12).toFixed(1)}′
        </p>
      </div>

      <div className="p-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="w-full h-auto"
          style={{ minWidth: 480 }}
          role="img"
          aria-label="Top-down loading diagram"
        >
          {/* Nose label */}
          <text
            x={padSide}
            y={padTop - 8}
            className="fill-muted-foreground"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}
          >
            NOSE →
          </text>
          <text
            x={padSide + capacityLen}
            y={padTop - 8}
            textAnchor="end"
            className="fill-muted-foreground"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}
          >
            ← REAR
          </text>

          {/* Deck (solid border) */}
          <rect
            x={padSide}
            y={padTop}
            width={trailer.deckLength}
            height={trailer.deckWidth}
            fill="hsl(var(--secondary, 220 14% 96%))"
            stroke="currentColor"
            strokeWidth={2}
            className="text-foreground"
          />
          {/* Legal overhang zone (dashed) */}
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

          {/* Pieces */}
          {placed.map((p, i) => {
            const color = colorByPiece.get(p.pieceId)!;
            const x = padSide + p.x;
            const y = padTop + p.y;
            const showLabel = p.length >= 36 && p.width >= 18;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={p.length}
                  height={p.width}
                  fill={color}
                  fillOpacity={0.25}
                  stroke={color}
                  strokeWidth={1.5}
                />
                {p.overhang && (
                  <rect
                    x={x}
                    y={y}
                    width={p.length}
                    height={p.width}
                    fill="url(#hatch)"
                    pointerEvents="none"
                  />
                )}
                {showLabel && (
                  <text
                    x={x + p.length / 2}
                    y={y + p.width / 2 + 3}
                    textAnchor="middle"
                    style={{ fontSize: Math.min(10, p.width / 4), fontWeight: 600 }}
                    className="fill-foreground"
                  >
                    {p.label.length > 22 ? p.label.slice(0, 20) + "…" : p.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Hatch pattern for overhang pieces */}
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.5" className="text-warning" />
            </pattern>
          </defs>

          {/* Deck-end marker line */}
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

      <div className="px-5 py-3 border-t-2 border-border flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
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
          <span className="size-3 bg-warning/40" />
          Rear Overhang Used
        </span>
        <span className="ml-auto font-mono normal-case tracking-normal">
          {(totalLengthUsed / 12).toFixed(1)}′ used of {(trailer.deckLength / 12).toFixed(0)}′ deck
          {trailer.maxOverhang > 0 && ` + ${(trailer.maxOverhang / 12).toFixed(0)}′ overhang`}
        </span>
      </div>
    </div>
  );
}
