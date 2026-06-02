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
      return { length: L, width: H, height: W };
    case "upright":
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
    out.push({ pieceId: piece.id, reason: "width", detail: `Width ${(d.width / 12).toFixed(1)}' exceeds 8'6" legal limit.` });
  }
  if (d.height > FEDERAL_LIMITS.maxHeightIn) {
    out.push({ pieceId: piece.id, reason: "height", detail: `Height ${(d.height / 12).toFixed(1)}' exceeds 13'6" legal limit.` });
  }
  if (d.length > FEDERAL_LIMITS.maxLengthIn + FEDERAL_LIMITS.maxOverhangIn) {
    out.push({ pieceId: piece.id, reason: "length", detail: `Length ${(d.length / 12).toFixed(1)}' exceeds 53'+4' overhang limit.` });
  }
  return out;
}

// Packing box for fittings + short pipe.
const BOX_L = 36;
const BOX_W = 36;
const BOX_H = 24;
const BOX_VOL_IN3 = BOX_L * BOX_W * BOX_H;
const BOX_PACK_EFFICIENCY = 0.6;
const BOX_FOOTPRINT_IN2 = BOX_L * BOX_W;
// Boxes stack 2 high in a truck.
const BOX_STACK = 2;

function isPipe(p: Piece): boolean {
  return /\bpipe\b|duct|tube|tubing|conduit/.test(p.description.toLowerCase());
}

function isBoxable(piece: Piece): boolean {
  const d = effectiveDims(piece);
  if (!isPipe(piece)) return true;
  return d.length < 30;
}

/**
 * How many pipes of this diameter can be stacked on top of each other.
 * Small pipe stacks higher; large pipe doesn't stack.
 */
function pipeStackCount(diameterIn: number): number {
  if (diameterIn <= 6) return 3;
  if (diameterIn <= 12) return 2;
  return 1;
}

function packBoxes(pieces: Piece[]): number {
  let vol = 0;
  for (const p of pieces) {
    if (!isBoxable(p)) continue;
    const d = effectiveDims(p);
    vol += d.length * d.width * d.height * p.qty;
  }
  return vol > 0 ? Math.max(1, Math.ceil(vol / (BOX_VOL_IN3 * BOX_PACK_EFFICIENCY))) : 0;
}

/**
 * Floor area in square inches needed on the trailer deck,
 * accounting for stacking pipes and boxes.
 */
function floorAreaIn2(pieces: Piece[], boxes: number): number {
  let area = 0;
  for (const p of pieces) {
    if (isBoxable(p)) continue;
    const d = effectiveDims(p);
    const footprint = d.length * d.width;
    if (isPipe(p)) {
      const diameter = Math.max(d.width, d.height);
      const stack = pipeStackCount(diameter);
      area += (footprint * p.qty) / stack;
    } else {
      area += footprint * p.qty;
    }
  }
  area += (boxes * BOX_FOOTPRINT_IN2) / BOX_STACK;
  return area;
}

function longestPieceIn(pieces: Piece[]): number {
  let m = 0;
  for (const p of pieces) {
    if (isBoxable(p)) continue;
    const d = effectiveDims(p);
    if (d.length > m) m = d.length;
  }
  return m;
}

/** Only consider the three trucks the user actually books. */
const CANDIDATE_TRAILER_IDS = ["box-16", "box-26", "dryvan-53"] as const;

export function recommend(pieces: Piece[]): Recommendation {
  const validPieces = pieces.filter((p) => p.qty > 0 && p.length > 0);
  const boxes = packBoxes(validPieces);

  const totalPieces = validPieces.reduce((n, p) => n + p.qty, 0);
  const totalCubeFt3 = validPieces.reduce((s, p) => s + cubeFt3(effectiveDims(p), p.qty), 0);
  const longestIn = validPieces.reduce((m, p) => Math.max(m, effectiveDims(p).length), 0);
  const widestIn = validPieces.reduce((m, p) => Math.max(m, effectiveDims(p).width), 0);
  const tallestIn = validPieces.reduce((m, p) => Math.max(m, effectiveDims(p).height), 0);

  const longestLoose = longestPieceIn(validPieces);
  const oversize = validPieces.flatMap(flagsForPiece);

  const candidatePool = TRAILERS.filter((t) =>
    (CANDIDATE_TRAILER_IDS as readonly string[]).includes(t.id),
  );

  const candidates = candidatePool
    .map((t) => {
      const deckArea = t.deckLength * t.deckWidth;
      const needed = floorAreaIn2(validPieces, boxes);
      // Required deck length = how far back the load reaches if spread across the deck width.
      const linearIn = needed / t.deckWidth;
      const fitsLength = Math.max(longestLoose, linearIn) <= t.deckLength;
      const fitsWidth = widestIn <= t.deckWidth;
      const fitsHeight = tallestIn <= t.maxHeight;
      const fits = fitsLength && fitsWidth && fitsHeight;
      const utilizationPct = t.deckLength > 0 ? Math.min(100, (linearIn / t.deckLength) * 100) : 0;
      const deckAreaPct = deckArea > 0 ? Math.min(100, (needed / deckArea) * 100) : 0;
      return { trailer: t, fits, linearFt: linearIn / 12, utilizationPct, deckAreaPct, neededIn2: needed };
    })
    .sort((a, b) => a.trailer.deckLength - b.trailer.deckLength);

  const best = candidates.find((c) => c.fits) ?? null;

  const totals = {
    pieces: totalPieces,
    cubeFt3: totalCubeFt3,
    linearFt: best ? best.linearFt : (candidates.at(-1)?.linearFt ?? 0),
    deckAreaFt2: (best ? best.neededIn2 : (candidates.at(-1)?.neededIn2 ?? 0)) / 144,
    longestIn,
    widestIn,
    tallestIn,
    boxes,
  };

  const notes: string[] = [];
  if (validPieces.length === 0) {
    notes.push("Add at least one piece to see a recommendation.");
  } else if (!best) {
    notes.push("Load exceeds the 53' dry van — split shipment or use a flatbed.");
  }
  if (boxes > 0) {
    notes.push(`${boxes} packing box${boxes === 1 ? "" : "es"} (36"x36"x24") estimated, stacked 2 high.`);
  }
  notes.push("Pipes ≤6\" stack 3 high, ≤12\" stack 2 high, larger lay flat.");

  return {
    trailer: best?.trailer ?? null,
    alternates: candidates
      .filter((c) => c.fits && c.trailer.id !== best?.trailer.id)
      .map((c) => ({ trailer: c.trailer, utilizationPct: c.utilizationPct })),
    totals,
    oversize,
    utilizationPct: best?.utilizationPct ?? 0,
    deckAreaPct: best?.deckAreaPct ?? 0,
    withinLegalLimits: oversize.length === 0,
    notes,
  };
}
