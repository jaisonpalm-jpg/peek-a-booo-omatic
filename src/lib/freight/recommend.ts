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
const BOX_PACK_EFFICIENCY = 0.75;
const BOX_FOOTPRINT_IN2 = BOX_L * BOX_W;
// Boxes stack 2 high in a truck.
const BOX_STACK = 2;

function isPipe(p: Piece): boolean {
  return /\bpipe\b|duct|tube|tubing|conduit/.test(p.description.toLowerCase());
}

function isRoofCurb(p: Piece): boolean {
  return /\bcurb\b|adaptor|adapter/.test(p.description.toLowerCase());
}

/** Does a piece physically fit inside a single 36×36×24 box in any orientation? */
function fitsInBox(piece: Piece): boolean {
  const d = effectiveDims(piece);
  const dims = [d.length, d.width, d.height].sort((a, b) => a - b);
  const box = [BOX_H, BOX_W, BOX_L].sort((a, b) => a - b); // [24, 36, 36]
  return dims[0] <= box[0] && dims[1] <= box[1] && dims[2] <= box[2];
}

function isNeopreneGasket(p: Piece): boolean {
  const s = p.description.toLowerCase();
  return /neoprene|gasket/.test(s);
}

function isBoxable(piece: Piece): boolean {
  if (isRoofCurb(piece)) return false;
  // Neoprene gaskets ship as coiled 25ft rolls and always box.
  if (isNeopreneGasket(piece)) return true;
  if (!fitsInBox(piece)) return false;
  if (!isPipe(piece)) return true;
  const d = effectiveDims(piece);
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

interface BoxBreakdown {
  total: number;
  gasketBoxes: number;
  fillerBoxes: number;
  gasketPallets: number;
}

// 48x40 standard pallet; one 36x36 box per layer, stacked 2 high = 2 boxes/pallet.
const PALLET_L = 48;
const PALLET_W = 40;
const PALLET_FOOTPRINT_IN2 = PALLET_L * PALLET_W;
const BOXES_PER_PALLET = 2;

function packBoxes(pieces: Piece[]): BoxBreakdown {
  let vol = 0;
  let gasketBoxes = 0;
  for (const p of pieces) {
    if (!isBoxable(p)) continue;
    if (isNeopreneGasket(p)) {
      gasketBoxes += p.qty;
      continue;
    }
    const d = effectiveDims(p);
    vol += d.length * d.width * d.height * p.qty;
  }
  const fillerBoxes = vol > 0 ? Math.max(1, Math.ceil(vol / (BOX_VOL_IN3 * BOX_PACK_EFFICIENCY))) : 0;
  const gasketPallets = gasketBoxes > 0 ? Math.ceil(gasketBoxes / BOXES_PER_PALLET) : 0;
  return { total: gasketBoxes + fillerBoxes, gasketBoxes, fillerBoxes, gasketPallets };
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
function stackCurbs(
  curbs: CurbInstance[],
  maxHeightIn: number,
  maxStackCount = Number.POSITIVE_INFINITY,
): CurbStack[] {
  const sorted = [...curbs].sort((a, b) => b.footprint - a.footprint);
  const stacks: CurbStack[] = [];
  for (const c of sorted) {
    let placed = false;
    for (const s of stacks) {
      const fitsFootprint = c.length <= s.topLength && c.width <= s.topWidth;
      const fitsHeight = s.heightUsed + STACK_GAP_IN + c.height <= maxHeightIn;
      const fitsCount = s.count < maxStackCount;
      if (fitsFootprint && fitsHeight && fitsCount) {
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

function toCurbStackViews(stacks: CurbStack[]): CurbStackView[] {
  return stacks.map((s) => ({
    heightIn: s.heightUsed,
    footprintIn2: s.footprint,
    separationIn: SEPARATION_IN,
    layers: s.layers.map((l) => ({
      description: l.piece.description,
      length: l.length,
      width: l.width,
      height: l.height,
      oversize: flagsForPiece(l.piece).length > 0,
    })),
  }));
}

/**
 * Floor area in square inches needed on the trailer deck,
 * accounting for stacking pipes, curbs, and boxes.
 */
function floorAreaIn2(
  pieces: Piece[],
  boxes: number,
  maxHeightIn: number,
  maxStackCount = Number.POSITIVE_INFINITY,
): number {
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
  const stacks = stackCurbs(expandCurbs(pieces), maxHeightIn, maxStackCount);
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

/** Trailers the user actually books. Enclosed options come first as the default
 *  picks; flatbed/hotshot/conestoga are kept as secondary options for loads that
 *  actually need an open deck (oversize, tall, or long with overhang). */
const CANDIDATE_TRAILER_IDS = [
  "box-16",
  "box-26",
  "dryvan-53",
  "hotshot-40",
  "flatbed-48",
  "conestoga-48",
] as const;

const OPEN_DECK_IDS = [
  "hotshot-40",
  "flatbed-48",
  "conestoga-48",
] as const;

export interface RecommendOptions {
  /** User-selected maximum number of curbs in a single stack (legal height still wins). */
  maxCurbStack?: number;
}

export function recommend(pieces: Piece[], options: RecommendOptions = {}): Recommendation {
  const maxCurbStack = Math.max(1, options.maxCurbStack ?? Number.POSITIVE_INFINITY);
  const validPieces = pieces.filter((p) => p.qty > 0 && p.length > 0);
  const boxes = packBoxes(validPieces);

  const totalPieces = validPieces.reduce((n, p) => n + p.qty, 0);
  const totalCubeFt3 = validPieces.reduce((s, p) => s + cubeFt3(effectiveDims(p), p.qty), 0);
  const longestIn = validPieces.reduce((m, p) => Math.max(m, effectiveDims(p).length), 0);
  const widestIn = validPieces.reduce((m, p) => Math.max(m, effectiveDims(p).width), 0);
  const tallestIn = validPieces.reduce((m, p) => Math.max(m, effectiveDims(p).height), 0);

  const longestLoose = longestPieceIn(validPieces);
  const oversize = validPieces.flatMap(flagsForPiece);

  const hasCurbs = validPieces.some((p) => isRoofCurb(p));
  const candidateIds = hasCurbs
    ? (OPEN_DECK_IDS as readonly string[])
    : (CANDIDATE_TRAILER_IDS as readonly string[]);

  const candidatePool = TRAILERS.filter((t) => candidateIds.includes(t.id));

  const candidates = candidatePool
    .map((t) => {
      const deckArea = t.deckLength * t.deckWidth;
      const needed = floorAreaIn2(validPieces, boxes, t.maxHeight, maxCurbStack);
      const curbStacks = stackCurbs(expandCurbs(validPieces), t.maxHeight, maxCurbStack);
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

  const insulated = validPieces.some((p) => p.insulated);
  const totalWeightLb = validPieces.reduce((s, p) => s + (p.weight ?? 0) * p.qty, 0);

  // Prefer Conestoga when the load has any insulated/weather-sensitive pieces
  // and a Conestoga actually fits. Otherwise pick the smallest fitting trailer.
  const conestogaFit = candidates.find((c) => c.fits && c.trailer.id === "conestoga-48");
  const best = (insulated && conestogaFit) || candidates.find((c) => c.fits) || null;

  const totals = {
    pieces: totalPieces,
    cubeFt3: totalCubeFt3,
    linearFt: best ? best.linearFt : (candidates.at(-1)?.linearFt ?? 0),
    deckAreaFt2: (best ? best.neededIn2 : (candidates.at(-1)?.neededIn2 ?? 0)) / 144,
    longestIn,
    widestIn,
    tallestIn,
    boxes,
    weightLb: totalWeightLb,
    insulated,
    unstackedLinearFt: 0,
    savedLinearFt: 0,
  };

  // Compute "if not stacked" length against the selected trailer's deck width
  // so the saved-length figure reflects the real chosen equipment.
  const refTrailer = best?.trailer ?? candidates.at(-1)?.trailer;
  if (refTrailer) {
    const unstackedIn2 = floorAreaIn2(validPieces, boxes, refTrailer.maxHeight, 1);
    totals.unstackedLinearFt = unstackedIn2 / refTrailer.deckWidth / 12;
    totals.savedLinearFt = Math.max(0, totals.unstackedLinearFt - totals.linearFt);
  }


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
  if (insulated) {
    notes.push("Insulated pieces flagged — Conestoga preferred for weather protection.");
  }
  if (totalWeightLb > 0) {
    notes.push(`Total load weight: ${Math.round(totalWeightLb).toLocaleString()} lb.`);
  }
  notes.push(`Pieces separated by ${SEPARATION_IN}" strap/breathing room on the deck.`);
  notes.push("Pipes ≤6\" stack 3 high, ≤12\" stack 2 high, larger lay flat.");

  // Confidence: starts at 100, knocked down by problem signals.
  let confidence = 100;
  const reasonBits: string[] = [];
  if (validPieces.length === 0) {
    confidence = 0;
  } else if (!best) {
    confidence = 25;
    reasonBits.push("no standard trailer accommodates the load as entered");
  } else {
    if (oversize.length > 0) {
      confidence -= Math.min(30, oversize.length * 10);
      reasonBits.push(`${oversize.length} oversize flag${oversize.length === 1 ? "" : "s"} require permits`);
    }
    if (best.utilizationPct > 95) {
      confidence -= 10;
      reasonBits.push(`deck length ${Math.round(best.utilizationPct)}% utilized — tight fit`);
    }
    if (best.deckAreaPct > 95) {
      confidence -= 10;
      reasonBits.push(`floor area ${Math.round(best.deckAreaPct)}% occupied`);
    }
    if (insulated && best.trailer.id !== "conestoga-48") {
      confidence -= 15;
      reasonBits.push("insulated load but Conestoga did not fit — verify tarping plan");
    }
  }
  confidence = Math.max(0, Math.min(100, confidence));

  let reason: string;
  if (validPieces.length === 0) {
    reason = "Add pieces to generate a recommendation.";
  } else if (!best) {
    reason = "Load exceeds all standard equipment — split the shipment or arrange specialized transport.";
  } else {
    const base =
      `${best.trailer.name} picked: ${totalPieces} piece${totalPieces === 1 ? "" : "s"} ` +
      `fit within ${Math.round(best.linearFt)} ft of deck (${Math.round(best.utilizationPct)}% used, ${Math.round(best.deckAreaPct)}% floor area)`;
    const insulatedReason = insulated && best.trailer.id === "conestoga-48"
      ? "; Conestoga selected because the load includes insulated pieces"
      : "";
    const tail = reasonBits.length > 0 ? `. Caveats: ${reasonBits.join("; ")}.` : ".";
    reason = base + insulatedReason + tail;
  }

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
    confidence,
    reason,
  };
}

