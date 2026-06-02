import { FEDERAL_LIMITS, TRAILERS } from "./trailers";
import type {
  EffectiveDims,
  OversizeFlag,
  Piece,
  Recommendation,
  TrailerSpec,
} from "./types";

/** Returns effective L×W×H in inches after applying orientation. */
export function effectiveDims(piece: Piece): EffectiveDims {
  const { length: L, width: W, height: H } = piece;
  switch (piece.orientation) {
    case "on-side":
      // Rotate so width and height swap (piece on its side)
      return { length: L, width: H, height: W };
    case "upright":
      // Rotate so length and height swap (piece stood up)
      return { length: W, width: H, height: L };
    case "as-entered":
    default:
      return { length: L, width: W, height: H };
  }
}

function cubeFt3(dims: EffectiveDims, qty: number): number {
  return (dims.length * dims.width * dims.height * qty) / 1728;
}

function flagsForPiece(piece: Piece): OversizeFlag[] {
  const d = effectiveDims(piece);
  const out: OversizeFlag[] = [];
  if (d.width > FEDERAL_LIMITS.maxWidthIn) {
    out.push({
      pieceId: piece.id,
      reason: "width",
      detail: `Width ${(d.width / 12).toFixed(1)}' exceeds 8'6" legal limit.`,
    });
  }
  if (d.height > FEDERAL_LIMITS.maxHeightIn) {
    out.push({
      pieceId: piece.id,
      reason: "height",
      detail: `Height ${(d.height / 12).toFixed(1)}' exceeds 13'6" legal limit.`,
    });
  }
  if (d.length > FEDERAL_LIMITS.maxLengthIn + FEDERAL_LIMITS.maxOverhangIn) {
    out.push({
      pieceId: piece.id,
      reason: "length",
      detail: `Length ${(d.length / 12).toFixed(1)}' exceeds 53'+4' overhang limit.`,
    });
  }
  return out;
}

/** Does a single trailer fit every piece? (Naive: each piece individually fits.) */
function trailerFits(trailer: TrailerSpec, pieces: Piece[]): boolean {
  return pieces.every((p) => {
    const d = effectiveDims(p);
    const allowedLen = trailer.deckLength + trailer.maxOverhang;
    if (d.length > allowedLen) return false;
    if (d.width > trailer.deckWidth) return false;
    if (d.height > trailer.maxHeight) return false;
    return true;
  });
}

/** Floor packing estimate: linear feet needed (pieces lined up by longest dim). */
function linearFtRequired(pieces: Piece[], deckWidthIn: number): number {
  // For each piece compute footprint length × footprint width
  // Pack pieces side-by-side across deck width when possible; sum length per row.
  // Simple heuristic: rows of pieces with same width-bucket.
  let totalLinearIn = 0;
  for (const p of pieces) {
    const d = effectiveDims(p);
    const perRow = Math.max(1, Math.floor(deckWidthIn / Math.max(d.width, 1)));
    const rows = Math.ceil(p.qty / perRow);
    totalLinearIn += rows * d.length;
  }
  return totalLinearIn / 12;
}

// 36"x36"x24" packing box for fittings + short pipe.
const BOX_L = 36;
const BOX_W = 36;
const BOX_H = 24;
const BOX_VOL_IN3 = BOX_L * BOX_W * BOX_H; // 31,104
// Realistic packing efficiency for irregular fittings inside a box.
const BOX_PACK_EFFICIENCY = 0.6;

/** Returns true if a piece is a fitting (elbow/coupling/etc.) or short pipe (<30"). */
function isBoxable(piece: Piece): boolean {
  const d = effectiveDims(piece);
  const desc = piece.description.toLowerCase();
  const isPipe = /\bpipe\b|duct|tube|tubing|conduit/.test(desc);
  if (!isPipe) return true;
  return d.length < 30;
}

/** Replace boxable pieces with N virtual 36x36x24 box "pieces" for trailer math. */
function packIntoBoxes(pieces: Piece[]): { effective: Piece[]; boxes: number } {
  const loose: Piece[] = [];
  let boxableVolIn3 = 0;
  for (const p of pieces) {
    if (isBoxable(p)) {
      const d = effectiveDims(p);
      boxableVolIn3 += d.length * d.width * d.height * p.qty;
    } else {
      loose.push(p);
    }
  }
  const boxes = boxableVolIn3 > 0
    ? Math.max(1, Math.ceil(boxableVolIn3 / (BOX_VOL_IN3 * BOX_PACK_EFFICIENCY)))
    : 0;
  const effective = [...loose];
  if (boxes > 0) {
    effective.push({
      id: "__virtual-box__",
      description: `Packing box (${BOX_L}x${BOX_W}x${BOX_H})`,
      length: BOX_L,
      width: BOX_W,
      height: BOX_H,
      qty: boxes,
      orientation: "as-entered",
    });
  }
  return { effective, boxes };
}

export function recommend(pieces: Piece[]): Recommendation {
  const validPieces = pieces.filter((p) => p.qty > 0 && p.length > 0);
  const { effective: packedPieces, boxes } = packIntoBoxes(validPieces);

  const totals = packedPieces.reduce(
    (acc, p) => {
      const d = effectiveDims(p);
      acc.pieces += p.qty;
      acc.cubeFt3 += cubeFt3(d, p.qty);
      acc.deckAreaFt2 += (d.length * d.width * p.qty) / 144;
      acc.longestIn = Math.max(acc.longestIn, d.length);
      acc.widestIn = Math.max(acc.widestIn, d.width);
      acc.tallestIn = Math.max(acc.tallestIn, d.height);
      return acc;
    },
    {
      pieces: 0,
      cubeFt3: 0,
      linearFt: 0,
      deckAreaFt2: 0,
      longestIn: 0,
      widestIn: 0,
      tallestIn: 0,
      boxes,
    },
  );
  // Report piece count as the original SKU count (not virtualized box count).
  totals.pieces = validPieces.reduce((n, p) => n + p.qty, 0);

  const oversize = validPieces.flatMap(flagsForPiece);

  // Score each trailer that fits; compute linear ft based on that trailer's deck width.
  const candidates = TRAILERS.filter((t) => trailerFits(t, packedPieces)).map((t) => {
    const linearFt = linearFtRequired(packedPieces, t.deckWidth);
    const capacityFt = t.deckLength / 12;
    const utilizationPct = capacityFt > 0 ? Math.min(100, (linearFt / capacityFt) * 100) : 0;
    return { trailer: t, utilizationPct, linearFt };
  });

  // Sort: prefer enclosed when no oversize; smallest fitting trailer wins.
  const noOversize = oversize.length === 0;
  candidates.sort((a, b) => {
    if (noOversize) {
      // Prefer enclosed when oversize-free, then smaller deck
      if (a.trailer.enclosed !== b.trailer.enclosed) {
        return a.trailer.enclosed ? -1 : 1;
      }
    }
    return a.trailer.deckLength - b.trailer.deckLength;
  });

  const best = candidates[0] ?? null;
  if (best) totals.linearFt = best.linearFt;

  const notes: string[] = [];
  if (validPieces.length === 0) {
    notes.push("Add at least one piece to see a recommendation.");
  } else if (!best) {
    notes.push("No standard trailer accommodates these dimensions — oversize permit required.");
  } else {
    if (totals.linearFt > best.trailer.deckLength / 12) {
      notes.push(
        `Load uses ${(best.trailer.maxOverhang / 12).toFixed(0)}' rear overhang on this trailer.`,
      );
    }
    if (totals.widestIn > FEDERAL_LIMITS.maxWidthIn) {
      notes.push("Width exceeds 8'6\" — oversize permit required.");
    }
    if (totals.tallestIn > FEDERAL_LIMITS.maxHeightIn) {
      notes.push("Height exceeds 13'6\" — oversize permit required.");
    }
  }

  return {
    trailer: best?.trailer ?? null,
    alternates: candidates.slice(1, 4).map((c) => ({
      trailer: c.trailer,
      utilizationPct: c.utilizationPct,
    })),
    totals,
    oversize,
    utilizationPct: best?.utilizationPct ?? 0,
    deckAreaPct: best
      ? Math.min(
          100,
          (totals.deckAreaFt2 /
            ((best.trailer.deckLength * best.trailer.deckWidth) / 144)) *
            100,
        )
      : 0,
    withinLegalLimits: oversize.length === 0,
    notes,
  };
}
