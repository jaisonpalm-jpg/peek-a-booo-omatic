// Freight estimator domain types

export type Orientation = "as-entered" | "on-side" | "upright";

export interface Piece {
  id: string;
  description: string;
  /** Length, width, height in INCHES */
  length: number;
  width: number;
  height: number;
  qty: number;
  orientation: Orientation;
  /** Per-piece weight in POUNDS (optional). */
  weight?: number;
  /** True if the piece is insulated / weather-sensitive (drives Conestoga pick). */
  insulated?: boolean;
}

export interface EffectiveDims {
  /** Effective dimensions in INCHES after applying orientation */
  length: number;
  width: number;
  height: number;
}

export type TrailerId =
  | "box-16"
  | "box-26"
  | "dryvan-53"
  | "flatbed-48"
  | "hotshot-40"
  | "conestoga-48"
  | "stepdeck-53"
  | "doubledrop-48"
  | "rgn-53";

export interface TrailerSpec {
  id: TrailerId;
  name: string;
  shortName: string;
  /** Interior / deck length in INCHES */
  deckLength: number;
  /** Interior / deck width in INCHES */
  deckWidth: number;
  /** Interior height OR max load height for open decks, in INCHES */
  maxHeight: number;
  /** Max rear overhang allowed (federal default) in INCHES */
  maxOverhang: number;
  /** True for enclosed trailers (height = interior); false for flatbeds */
  enclosed: boolean;
  description: string;
}

export interface OversizeFlag {
  pieceId: string;
  reason: "width" | "height" | "length";
  detail: string;
}

export interface CurbStackLayer {
  description: string;
  length: number;
  width: number;
  height: number;
  oversize: boolean;
}

export interface CurbStackView {
  /** Bottom-up ordered layers in the stack. */
  layers: CurbStackLayer[];
  /** Combined stack height including 2" dunnage gaps. */
  heightIn: number;
  /** Largest footprint (bottom layer L×W) in inches². */
  footprintIn2: number;
  /** Strap/separation buffer applied around the base, inches. */
  separationIn: number;
}

export type DeckItemKind =
  | "curb-stack"
  | "pipe-bundle"
  | "box-stack"
  | "gasket-pallet";

export interface DeckItem {
  kind: DeckItemKind;
  label: string;
  /** Footprint length / width / vertical height in INCHES. */
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** Number of constituent units (pipes in bundle, boxes in stack, layers). */
  units: number;
  oversize?: boolean;
  /** Total weight in pounds for this physical block (optional). */
  weightLb?: number;
}

export interface DeckPlacement {
  item: DeckItem;
  /** Position in INCHES from front-left of the deck (x=length axis, y=width axis). */
  x: number;
  y: number;
  /** True if this item extends past the deck length as legal rear overhang. */
  overhang?: boolean;
  /** Inches of this item past the deck length (0 if none). */
  overhangIn?: number;
  /** Grid-style position label (e.g. "A1") computed by the packer. */
  posLabel?: string;
}

export interface DeckLayout {
  placements: DeckPlacement[];
  /** Furthest extent in the length axis (inches), incl. overhang. */
  usedLengthIn: number;
  /** Whether the layout managed to place every item. */
  fits: boolean;
  /** Total inches past the deck length across all placements. */
  totalOverhangIn: number;
  /** Number of placed items. */
  placedCount: number;
  /** Number of items that could not be placed. */
  unplacedCount: number;
  /** Total weight in lb of all placed items (0 when unknown). */
  weightLb: number;
}

export type PackingStrategyId = "balanced" | "min-overhang" | "max-gaskets";

export interface PackingScenario {
  id: PackingStrategyId;
  name: string;
  description: string;
  layout: DeckLayout;
  /** Extra gasket pallets added beyond the required load (max-gaskets strategy). */
  extraGasketPallets: number;
}

export interface CandidateBreakdown {
  trailer: TrailerSpec;
  fits: boolean;
  utilizationPct: number;
  deckAreaPct: number;
  linearFt: number;
  /** Per-trailer curb stack layout (max-height dependent). */
  curbStacks: CurbStackView[];
  /** Default packed 2D/3D layout of every load item on the deck. */
  layout: DeckLayout;
  /** Multiple packing scenarios for side-by-side comparison. */
  scenarios: PackingScenario[];
}

export interface Recommendation {
  trailer: TrailerSpec | null;
  alternates: Array<{ trailer: TrailerSpec; utilizationPct: number }>;
  /** Per-candidate breakdown for the 3 truck sizes, smallest first. */
  candidates: CandidateBreakdown[];
  totals: {
    pieces: number;
    cubeFt3: number;
    linearFt: number;
    deckAreaFt2: number;
    longestIn: number;
    widestIn: number;
    tallestIn: number;
    /** Estimated 36"x36"x24" boxes needed (includes gasket roll boxes). */
    boxes: number;
    /** 48"x40" pallets used to ship neoprene gasket boxes (2 boxes per pallet). */
    gasketPallets: number;
    /** Sum of all piece weights in pounds (0 when no weights provided). */
    weightLb: number;
    /** True when any piece on the load is marked insulated/weather-sensitive. */
    insulated: boolean;
    /** Linear feet the load would need if curbs were NOT stacked (stack = 1). */
    unstackedLinearFt: number;
    /** Linear feet saved by the selected curb-stack setting. */
    savedLinearFt: number;
  };

  /** 0–100 score indicating how confident the engine is in this pick. */
  confidence: number;
  /** Natural-language explanation of why this trailer was chosen. */
  reason: string;
  /** Percentage of selected trailer's deck floor area occupied by piece footprints. */
  deckAreaPct: number;
  oversize: OversizeFlag[];
  utilizationPct: number;
  withinLegalLimits: boolean;
  notes: string[];
}
