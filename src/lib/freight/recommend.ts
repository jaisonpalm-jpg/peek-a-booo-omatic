import { FEDERAL_LIMITS, TRAILERS } from "./trailers";
import type {
  CurbStackView,
  DeckItem,
  DeckLayout,
  DeckPlacement,
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

// 48x40 standard pallet; one 36x36 box per layer, stacked 4 high = 4 boxes/pallet.
const PALLET_L = 48;
const PALLET_W = 40;
const PALLET_FOOTPRINT_IN2 = PALLET_L * PALLET_W;
const BOXES_PER_PALLET = 4;

// Coiled 25ft neoprene gasket rolls modeled as ~14" OD x 4" thick cylinders.
// Box interior 36x36x24: 2x2 coils per layer (14" ea) x 6 layers (24"/4") = 24 rolls/box.
const GASKET_ROLLS_PER_BOX = 24;

function packBoxes(pieces: Piece[]): BoxBreakdown {
  let vol = 0;
  let gasketRolls = 0;
  for (const p of pieces) {
    if (!isBoxable(p)) continue;
    if (isNeopreneGasket(p)) {
      gasketRolls += p.qty;
      continue;
    }
    const d = effectiveDims(p);
    vol += d.length * d.width * d.height * p.qty;
  }
  const fillerBoxes = vol > 0 ? Math.max(1, Math.ceil(vol / (BOX_VOL_IN3 * BOX_PACK_EFFICIENCY))) : 0;
  const gasketBoxes = gasketRolls > 0 ? Math.ceil(gasketRolls / GASKET_ROLLS_PER_BOX) : 0;
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

/** Pallet stack height: 4 boxes × 24" + ~5" pallet deck = 101". */
const GASKET_PALLET_HEIGHT_IN = BOXES_PER_PALLET * BOX_H + 5;

/** Build a flat list of physical items to load on the deck. */
function buildDeckItems(
  pieces: Piece[],
  boxes: BoxBreakdown,
  maxHeightIn: number,
  maxCurbStack: number,
  _extraGasketPallets = 0,
): DeckItem[] {

  const items: DeckItem[] = [];

  // Curb stacks
  const stacks = stackCurbs(expandCurbs(pieces), maxHeightIn, maxCurbStack);
  for (const s of stacks) {
    const bottom = s.layers[0];
    const wPer = bottom.piece.weight ?? 0;
    items.push({
      kind: "curb-stack",
      label: `Curb ×${s.count}`,
      lengthIn: bottom.length,
      widthIn: bottom.width,
      heightIn: s.heightUsed,
      units: s.count,
      oversize: s.layers.some((l) => flagsForPiece(l.piece).length > 0),
      weightLb: wPer > 0 ? wPer * s.count : undefined,
    });
  }

  // Loose pipe bundles
  for (const p of pieces) {
    if (isBoxable(p) || isRoofCurb(p) || !isPipe(p)) continue;
    const d = effectiveDims(p);
    const diameter = Math.max(d.width, d.height);
    const stack = pipeStackCount(diameter);
    let remaining = p.qty;
    while (remaining > 0) {
      const inBundle = Math.min(stack, remaining);
      items.push({
        kind: "pipe-bundle",
        label: `${p.description} ×${inBundle}`,
        lengthIn: d.length,
        widthIn: d.width,
        heightIn: diameter * inBundle,
        units: inBundle,
        oversize: flagsForPiece(p).length > 0,
        weightLb: p.weight ? p.weight * inBundle : undefined,
      });
      remaining -= inBundle;
    }
  }

  // Other loose (non-pipe, non-curb, non-boxable) pieces — rare but supported
  for (const p of pieces) {
    if (isBoxable(p) || isRoofCurb(p) || isPipe(p)) continue;
    const d = effectiveDims(p);
    for (let i = 0; i < p.qty; i++) {
      items.push({
        kind: "pipe-bundle",
        label: p.description,
        lengthIn: d.length,
        widthIn: d.width,
        heightIn: d.height,
        units: 1,
        oversize: flagsForPiece(p).length > 0,
        weightLb: p.weight,
      });
    }
  }

  // Filler boxes — 2 high
  const fillerStacks = Math.ceil(boxes.fillerBoxes / BOX_STACK);
  for (let i = 0; i < fillerStacks; i++) {
    const remaining = boxes.fillerBoxes - i * BOX_STACK;
    const inStack = Math.min(BOX_STACK, remaining);
    items.push({
      kind: "box-stack",
      label: `Boxes ×${inStack}`,
      lengthIn: BOX_L,
      widthIn: BOX_W,
      heightIn: BOX_H * inStack,
      units: inStack,
    });
  }

  // Gasket pallets are an ACCESSORY — they ship alongside but do not drive
  // trailer length sizing. Intentionally omitted from the deck layout so
  // they don't inflate linear-ft or overhang figures.



  return items;
}

/** Assigns row letters (front→back) and column indices (left→right). */
function assignPosLabels(placements: DeckPlacement[]): void {
  const byShelf = new Map<number, DeckPlacement[]>();
  for (const p of placements) {
    const key = Math.round(p.x);
    const arr = byShelf.get(key) ?? [];
    arr.push(p);
    byShelf.set(key, arr);
  }
  const shelfXs = [...byShelf.keys()].sort((a, b) => a - b);
  shelfXs.forEach((sx, rowIdx) => {
    const row = byShelf.get(sx)!.sort((a, b) => a.y - b.y);
    const letter = String.fromCharCode(65 + (rowIdx % 26));
    row.forEach((p, colIdx) => {
      p.posLabel = `${letter}${colIdx + 1}`;
    });
  });
}

type PackStrategy = "longest-first" | "shortest-first" | "widest-first";

/**
 * Shelf-pack deck items onto a trailer with selectable sort strategy.
 */
function packDeckLayout(
  items: DeckItem[],
  trailer: TrailerSpec,
  strategy: PackStrategy = "longest-first",
): DeckLayout {
  const placements: DeckPlacement[] = [];
  const deckW = trailer.deckWidth;
  const maxLen = trailer.deckLength + trailer.maxOverhang;
  const buffer = SEPARATION_IN;

  const sorted = [...items].sort((a, b) => {
    if (strategy === "shortest-first") {
      return a.lengthIn - b.lengthIn || a.widthIn - b.widthIn;
    }
    if (strategy === "widest-first") {
      return b.widthIn - a.widthIn || b.lengthIn - a.lengthIn;
    }
    return b.lengthIn - a.lengthIn || b.widthIn - a.widthIn;
  });

  let cursorX = 0;
  let shelfY = 0;
  let shelfLen = 0;
  let allFit = true;
  let unplaced = 0;

  for (const it of sorted) {
    let l = it.lengthIn;
    let w = it.widthIn;
    // Rotate if needed: doesn't fit across width OR (min-overhang) rotation avoids overhang.
    const wouldOverhang = cursorX + l > trailer.deckLength;
    const rotatedFits =
      it.widthIn <= deckW &&
      it.lengthIn <= deckW &&
      cursorX + it.widthIn <= trailer.deckLength;
    if (w > deckW && l <= deckW) {
      [l, w] = [w, l];
    } else if (
      strategy === "shortest-first" &&
      wouldOverhang &&
      rotatedFits &&
      it.widthIn <= it.lengthIn
    ) {
      [l, w] = [w, l];
    }
    if (w > deckW || it.heightIn > trailer.maxHeight) {
      allFit = false;
      unplaced++;
      continue;
    }

    // Try current shelf first
    if (shelfY + w + buffer <= deckW && cursorX + l <= maxLen) {
      const overhangIn = Math.max(0, cursorX + l - trailer.deckLength);
      placements.push({
        item: { ...it, lengthIn: l, widthIn: w },
        x: cursorX,
        y: shelfY,
        overhang: overhangIn > 0,
        overhangIn,
      });
      shelfY += w + buffer;
      shelfLen = Math.max(shelfLen, l);
      continue;
    }

    // New shelf
    cursorX += shelfLen + buffer;
    shelfY = 0;
    shelfLen = 0;
    if (cursorX + l > maxLen) {
      allFit = false;
      unplaced++;
      continue;
    }
    const overhangIn = Math.max(0, cursorX + l - trailer.deckLength);
    placements.push({
      item: { ...it, lengthIn: l, widthIn: w },
      x: cursorX,
      y: shelfY,
      overhang: overhangIn > 0,
      overhangIn,
    });
    shelfY = w + buffer;
    shelfLen = l;
  }

  assignPosLabels(placements);

  const usedLengthIn = placements.reduce(
    (m, p) => Math.max(m, p.x + p.item.lengthIn),
    0,
  );
  const totalOverhangIn = placements.reduce(
    (s, p) => s + (p.overhangIn ?? 0),
    0,
  );
  const weightLb = placements.reduce(
    (s, p) => s + (p.item.weightLb ?? 0),
    0,
  );
  return {
    placements,
    usedLengthIn,
    fits: allFit,
    totalOverhangIn,
    placedCount: placements.length,
    unplacedCount: unplaced,
    weightLb,
  };
}

/**
 * Estimate how many extra gasket pallets could fit by repeatedly retrying
 * the layout with N additional pallets until they no longer fit.
 */
function maxExtraGaskets(
  baseItems: DeckItem[],
  pieces: Piece[],
  boxes: BoxBreakdown,
  trailer: TrailerSpec,
  maxHeightIn: number,
  maxCurbStack: number,
): { count: number; items: DeckItem[]; layout: DeckLayout } {
  let lastGood = {
    count: 0,
    items: baseItems,
    layout: packDeckLayout(baseItems, trailer),
  };
  for (let extra = 1; extra <= 24; extra++) {
    const items = buildDeckItems(pieces, boxes, maxHeightIn, maxCurbStack, extra);
    const layout = packDeckLayout(items, trailer);
    if (!layout.fits) break;
    lastGood = { count: extra, items, layout };
  }
  return lastGood;
}



/**
 * Floor area in square inches needed on the trailer deck,
 * accounting for stacking pipes, curbs, and boxes.
 */
function floorAreaIn2(
  pieces: Piece[],
  boxes: BoxBreakdown,
  maxHeightIn: number,
  maxStackCount = Number.POSITIVE_INFINITY,
): number {
  let area = 0;
  for (const p of pieces) {
    if (isBoxable(p) || isRoofCurb(p)) continue;
    const d = effectiveDims(p);
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
    const side = Math.sqrt(s.footprint);
    area += withSeparation(side, side);
  }
  // Filler boxes ride loose, stacked 2 high. Gasket pallets are accessory
  // freight and excluded from order length sizing.
  area += (boxes.fillerBoxes * BOX_FOOTPRINT_IN2) / BOX_STACK;

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

/** Find the smallest candidate trailer that fits a given subset of pieces. */
function pickSmallestFitting(
  pieces: Piece[],
  maxCurbStack: number,
  allowOpenDeck = true,
): { trailer: TrailerSpec; linearFt: number; deckAreaPct: number } | null {
  if (pieces.length === 0) return null;
  const subBoxes = packBoxes(pieces);
  const longest = longestPieceIn(pieces);
  const widest = pieces.reduce((m, p) => Math.max(m, effectiveDims(p).width), 0);
  const tallest = pieces.reduce((m, p) => Math.max(m, effectiveDims(p).height), 0);
  const ids = allowOpenDeck ? CANDIDATE_TRAILER_IDS : CANDIDATE_TRAILER_IDS.filter((id) => !(OPEN_DECK_IDS as readonly string[]).includes(id));
  const pool = TRAILERS.filter((t) => (ids as readonly string[]).includes(t.id))
    .sort((a, b) => a.deckLength * a.deckWidth - b.deckLength * b.deckWidth);
  for (const t of pool) {
    if (widest > t.deckWidth || tallest > t.maxHeight) continue;
    if (longest > t.deckLength + t.maxOverhang) continue;
    const items = buildDeckItems(pieces, subBoxes, t.maxHeight, maxCurbStack);
    const layout = packDeckLayout(items, t, "longest-first");
    const needed = floorAreaIn2(pieces, subBoxes, t.maxHeight, maxCurbStack);
    const linearIn = needed / t.deckWidth;
    const deckAreaPct = Math.min(100, (needed / (t.deckLength * t.deckWidth)) * 100);
    if (layout.fits && linearIn <= t.deckLength) {
      return { trailer: t, linearFt: linearIn / 12, deckAreaPct };
    }
  }
  return null;
}

/**
 * Greedy split: assign largest pieces to truck 1 (try each trailer largest-first),
 * spillover to truck 2. Returns null if even two trucks can't cover the load.
 */
function splitTwoTrucks(
  pieces: Piece[],
  maxCurbStack: number,
): import("./types").SplitShipment | null {
  if (pieces.length === 0) return null;
  // Expand pieces into per-unit list, sorted longest first.
  const ranked = [...pieces].sort((a, b) => {
    const da = effectiveDims(a), db = effectiveDims(b);
    return db.length * db.width - da.length * da.width;
  });

  // Try each open-deck trailer as the "primary" (carries the biggest stuff).
  const primaries = TRAILERS.filter((t) => (OPEN_DECK_IDS as readonly string[]).includes(t.id))
    .sort((a, b) => b.deckLength * b.deckWidth - a.deckLength * a.deckWidth);

  for (const primary of primaries) {
    const onPrimary: Piece[] = [];
    const onSecondary: Piece[] = [];
    for (const p of ranked) {
      const trial = [...onPrimary, p];
      const subBoxes = packBoxes(trial);
      const items = buildDeckItems(trial, subBoxes, primary.maxHeight, maxCurbStack);
      const layout = packDeckLayout(items, primary, "longest-first");
      const needed = floorAreaIn2(trial, subBoxes, primary.maxHeight, maxCurbStack);
      const linearIn = needed / primary.deckWidth;
      const widest = trial.reduce((m, q) => Math.max(m, effectiveDims(q).width), 0);
      const tallest = trial.reduce((m, q) => Math.max(m, effectiveDims(q).height), 0);
      const fits =
        layout.fits &&
        linearIn <= primary.deckLength &&
        widest <= primary.deckWidth &&
        tallest <= primary.maxHeight;
      if (fits) onPrimary.push(p);
      else onSecondary.push(p);
    }
    if (onPrimary.length === 0 || onSecondary.length === 0) continue;
    const secondPick = pickSmallestFitting(onSecondary, maxCurbStack);
    if (!secondPick) continue;
    const firstNeed = floorAreaIn2(onPrimary, packBoxes(onPrimary), primary.maxHeight, maxCurbStack);
    const firstLinearFt = firstNeed / primary.deckWidth / 12;
    const firstDeckPct = Math.min(100, (firstNeed / (primary.deckLength * primary.deckWidth)) * 100);

    const sumPieces = (arr: Piece[]) => arr.reduce((n, p) => n + p.qty, 0);
    return {
      reason:
        "Load exceeds the largest single trailer. Recommended split below — heaviest/longest freight on the primary, remainder on a secondary truck.",
      trucks: [
        {
          trailer: primary,
          pieceIds: onPrimary.map((p) => p.id),
          summary: `${sumPieces(onPrimary)} piece${sumPieces(onPrimary) === 1 ? "" : "s"} (longest / largest)`,
          linearFt: firstLinearFt,
          deckAreaPct: firstDeckPct,
        },
        {
          trailer: secondPick.trailer,
          pieceIds: onSecondary.map((p) => p.id),
          summary: `${sumPieces(onSecondary)} piece${sumPieces(onSecondary) === 1 ? "" : "s"} (remaining freight)`,
          linearFt: secondPick.linearFt,
          deckAreaPct: secondPick.deckAreaPct,
        },
      ],
    };
  }
  return null;
}


export function recommend(pieces: Piece[], options: RecommendOptions = {}): Recommendation {
  const maxCurbStack = Math.max(1, options.maxCurbStack ?? Number.POSITIVE_INFINITY);
  const validPieces = pieces.filter((p) => p.qty > 0 && p.length > 0);
  const boxes = packBoxes(validPieces);

  const totalPieces = validPieces.reduce((n, p) => n + p.qty, 0);
  // Neoprene gaskets are an accessory — exclude their volume from the order total.
  const totalCubeFt3 = validPieces.reduce(
    (s, p) => (isNeopreneGasket(p) ? s : s + cubeFt3(effectiveDims(p), p.qty)),
    0,
  );
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
      const itemsForTrailer = buildDeckItems(validPieces, boxes, t.maxHeight, maxCurbStack);
      const layout = packDeckLayout(itemsForTrailer, t, "longest-first");

      // Scenarios for open-deck trailers (where overhang/gasket trade-offs matter)
      const isOpenDeck = (OPEN_DECK_IDS as readonly string[]).includes(t.id);
      const scenarios: import("./types").PackingScenario[] = [];
      if (isOpenDeck) {
        scenarios.push({
          id: "balanced",
          name: "Balanced",
          description: "Longest pieces first into shelf rows. Default packing.",
          layout,
          extraGasketPallets: 0,
        });
        const minOverhangLayout = packDeckLayout(itemsForTrailer, t, "shortest-first");
        scenarios.push({
          id: "min-overhang",
          name: "Min Overhang",
          description:
            "Short pieces first; longer pieces rotate to stay on deck when possible.",
          layout: minOverhangLayout,
          extraGasketPallets: 0,
        });
        const maxG = maxExtraGaskets(itemsForTrailer, validPieces, boxes, t, t.maxHeight, maxCurbStack);
        scenarios.push({
          id: "max-gaskets",
          name: "Max Gaskets",
          description: `Fills free deck area with extra gasket pallets (+${maxG.count}).`,
          layout: maxG.layout,
          extraGasketPallets: maxG.count,
        });
      }

      // Required deck length = how far back the load reaches if spread across the deck width.
      const linearIn = needed / t.deckWidth;
      const fitsLength = longestLoose <= t.deckLength + t.maxOverhang && linearIn <= t.deckLength;
      const fitsWidth = widestIn <= t.deckWidth;
      const fitsHeight = tallestIn <= t.maxHeight;
      const fits = fitsLength && fitsWidth && fitsHeight && layout.fits;
      const utilizationPct = t.deckLength > 0 ? Math.min(100, (linearIn / t.deckLength) * 100) : 0;
      const deckAreaPct = deckArea > 0 ? Math.min(100, (needed / deckArea) * 100) : 0;
      return { trailer: t, fits, linearFt: linearIn / 12, utilizationPct, deckAreaPct, neededIn2: needed, curbStacks, layout, scenarios };
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
    boxes: boxes.fillerBoxes,
    gasketPallets: boxes.gasketPallets,
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
  const splitShipment = !best ? splitTwoTrucks(validPieces, maxCurbStack) ?? undefined : undefined;
  if (!best && validPieces.length > 0) {
    if (splitShipment) {
      const [a, b] = splitShipment.trucks;
      notes.push(
        `Order too large for one truck — recommend splitting across 2 trucks: ${a.trailer.name} + ${b.trailer.name}.`,
      );
    } else {
      notes.push("Load exceeds the largest standard equipment, even split across two trucks — specialized transport required.");
    }
  }
  if (boxes.fillerBoxes > 0) {
    notes.push(`${boxes.fillerBoxes} packing box${boxes.fillerBoxes === 1 ? "" : "es"} (36"x36"x24") estimated, stacked 2 high.`);
  }
  if (boxes.gasketBoxes > 0) {
    notes.push(
      `${boxes.gasketBoxes} neoprene gasket roll box${boxes.gasketBoxes === 1 ? "" : "es"} (up to ${GASKET_ROLLS_PER_BOX} 25ft rolls per 36"x36"x24" box) palletized on ${boxes.gasketPallets} 48"x40" pallet${boxes.gasketPallets === 1 ? "" : "s"} (4 boxes/pallet) — accessory freight, not counted in order length.`,
    );
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
      layout: c.layout,
      scenarios: c.scenarios,
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

