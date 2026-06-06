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

export interface CandidateBreakdown {
  trailer: TrailerSpec;
  fits: boolean;
  utilizationPct: number;
  deckAreaPct: number;
  linearFt: number;
  /** Per-trailer curb stack layout (max-height dependent). */
  curbStacks: CurbStackView[];
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
    /** Estimated 36"x36"x24" boxes needed to hold fittings + short pipe. */
    boxes: number;
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
