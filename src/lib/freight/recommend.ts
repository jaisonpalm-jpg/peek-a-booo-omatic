import { FEDERAL_LIMITS, TRAILERS } from "./trailers";
import type {
  CurbStackView,
  EffectiveDims,
  OversizeFlag,
  Piece,
  Recommendation,
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
const BOX_PACK_EFFICIENCY = 1.0;
const BOX_FOOTPRINT_IN2 = BOX_L * BOX_W;
// Boxes stack 2 high in a truck.
const BOX_STACK = 2;

function isPipe(p: Piece): boolean {
  return /\bpipe\b|duct|tube|tubing|conduit/.test(p.description.toLowerCase());
}

function isRoofCurb(p: Piece): boolean {
  return /\bcurb\b|adaptor|adapter/.test(p.description.toLowerCase());
}

function isBoxable(piece: Piece): boolean {
  const d = effectiveDims(piece);
  if (isRoofCurb(piece)) return false;
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

/** Inches of strap/breathing room added around each non-boxable piece on deck. */
const SEPARATION_IN = 4;
/** Vertical clearance left between stacked curbs for dunnage. */
const STACK_GAP_IN = 2;

function packBoxes(pieces: Piece[]): number {
  let vol = 0;
  for (const p of pieces) {
    if (!isBoxable(p)) continue;
    const d = effectiveDims(p);
    vol += d.length * d.width * d.height * p.qty;
  }
  return vol > 0 ? Math.max(1, Math.ceil(vol / (BOX_VOL_IN3 * BOX_PACK_EFFICIENCY))) : 0;
}

interface CurbInstance {
  piece: Piece;
  length: number;
  width: number;
  height: number;
  footprint: number;
}

function expandCurbs(pieces: Piece[]): CurbInstance[] {
  const out: CurbInstance[] = [];
  for (const p of pieces) {
    if (!isRoofCurb(p)) continue;
    const d = effectiveDims(p);
    for (let i = 0; i < p.qty; i++) {
      out.push({
        piece: p,
        length: d.length,
        width: d.width,
        height: d.height,
        footprint: d.length * d.width,
      });
    }
  }
  return out;
}

interface CurbStack {
  /** Footprint inches² consumed on the deck (largest piece in the stack). */
  footprint: number;
  /** Top piece L×W — anything stacked above must fit within this. */
  topLength: number;
  topWidth: number;
  /** Combined stack height including dunnage gaps. */
  heightUsed: number;
  count: number;
  layers: CurbInstance[];
}

/**
 * Greedy stack: sort curbs largest-footprint first, then for each remaining
 * curb try to place it on top of an existing stack where (a) its footprint
 * fits within the current top piece and (b) combined height + dunnage stays
 * under the trailer's max load height. Otherwise start a new stack.
 */
function stackCurbs(curbs: CurbInstance[], maxHeightIn: number): CurbStack[] {
  const sorted = [...curbs].sort((a, b) => b.footprint - a.footprint);
  const stacks: CurbStack[] = [];
  for (const c of sorted) {
    let placed = false;
    for (const s of stacks) {
      const fitsFootprint = c.length <= s.topLength && c.width <= s.topWidth;
      const fitsHeight = s.heightUsed + STACK_GAP_IN + c.height <= maxHeightIn;
      if (fitsFootprint && fitsHeight) {
        s.heightUsed += STACK_GAP_IN + c.height;
        s.topLength = c.length;
        s.topWidth = c.width;
        s.count += 1;
        s.layers.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) {
      stacks.push({
        footprint: c.footprint,
        topLength: c.length,
        topWidth: c.width,
        heightUsed: c.height,
        count: 1,
        layers: [c],
      });
    }
  }
  return stacks;
}

/** Footprint after adding a strap/separation perimeter buffer. */
function withSeparation(length: number, width: number): number {
  return (length + SEPARATION_IN) * (width + SEPARATION_IN);
}

/**
 * Floor area in square inches needed on the trailer deck,
 * accounting for stacking pipes, curbs, and boxes.
 */
function floorAreaIn2(pieces: Piece[], boxes: number, maxHeightIn: number): number {
  let area = 0;
  for (const p of pieces) {
    if (isBoxable(p) || isRoofCurb(p)) continue;
    const d = effectiveDims(p);
    const footprint = d.length * d.width;
    if (isPipe(p)) {
      const diameter = Math.max(d.width, d.height);
      const stack = pipeStackCount(diameter);
      area += (withSeparation(d.length, d.width) * p.qty) / stack;
    } else {
      area += withSeparation(d.length, d.width) * p.qty;
    }
  }
  const stacks = stackCurbs(expandCurbs(pieces), maxHeightIn);
  for (const s of stacks) {
    // Use separation buffer based on a square root of footprint as proxy dims.
    const side = Math.sqrt(s.footprint);
    area += withSeparation(side, side);
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
const CANDIDATE_TRAILER_IDS = ["hotshot-40", "flatbed-48", "conestoga-48"] as const;

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
      const needed = floorAreaIn2(validPieces, boxes, t.maxHeight);
      const curbStacks = stackCurbs(expandCurbs(validPieces), t.maxHeight);
      // Required deck length = how far back the load reaches if spread across the deck width.
      const linearIn = needed / t.deckWidth;
      const fitsLength = longestLoose <= t.deckLength + t.maxOverhang && linearIn <= t.deckLength;
      const fitsWidth = widestIn <= t.deckWidth;
      const fitsHeight = tallestIn <= t.maxHeight;
      const fits = fitsLength && fitsWidth && fitsHeight;
      const utilizationPct = t.deckLength > 0 ? Math.min(100, (linearIn / t.deckLength) * 100) : 0;
      const deckAreaPct = deckArea > 0 ? Math.min(100, (needed / deckArea) * 100) : 0;
      return { trailer: t, fits, linearFt: linearIn / 12, utilizationPct, deckAreaPct, neededIn2: needed, curbStacks };
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
  const curbStacks = best?.curbStacks ?? candidates.at(-1)?.curbStacks ?? [];
  const totalCurbs = curbStacks.reduce((n, s) => n + s.count, 0);
  if (totalCurbs > 0) {
    const stacked = curbStacks.filter((s) => s.count > 1).length;
    notes.push(
      `${totalCurbs} roof curb${totalCurbs === 1 ? "" : "s"} arranged in ${curbStacks.length} deck position${curbStacks.length === 1 ? "" : "s"}${stacked > 0 ? ` (${stacked} stacked with 2\" dunnage gaps)` : ""}.`,
    );
  }
  notes.push(`Pieces separated by ${SEPARATION_IN}" strap/breathing room on the deck.`);
  notes.push("Pipes ≤6\" stack 3 high, ≤12\" stack 2 high, larger lay flat.");

  return {
    trailer: best?.trailer ?? null,
    candidates: candidates.map((c) => ({
      trailer: c.trailer,
      fits: c.fits,
      utilizationPct: c.utilizationPct,
      deckAreaPct: c.deckAreaPct,
      linearFt: c.linearFt,
      curbStacks: toCurbStackViews(c.curbStacks),
    })),
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
