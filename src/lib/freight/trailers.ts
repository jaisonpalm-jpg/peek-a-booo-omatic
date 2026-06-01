import type { TrailerSpec } from "./types";

// Interior / deck dimensions in INCHES.
// Sources: industry standard published dimensions.
export const TRAILERS: TrailerSpec[] = [
  {
    id: "box-26",
    name: "26' Box Truck",
    shortName: "Box 26'",
    deckLength: 26 * 12, // 312"
    deckWidth: 8 * 12, // 96"
    maxHeight: 8.5 * 12, // 102"
    maxOverhang: 0,
    enclosed: true,
    description: "Enclosed dry box. Ideal for sub-26' loads under 8'6\" tall.",
  },
  {
    id: "dryvan-53",
    name: "53' Dry Van",
    shortName: "53' Van",
    deckLength: 53 * 12, // 636"
    deckWidth: 8.5 * 12, // 102"
    maxHeight: 9 * 12, // 108"
    maxOverhang: 0,
    enclosed: true,
    description: "Standard enclosed OTR van. 53' interior, ~9' tall.",
  },
  {
    id: "flatbed-48",
    name: "48' Flatbed",
    shortName: "48' Flat",
    deckLength: 48 * 12, // 576"
    deckWidth: 8.5 * 12, // 102"
    maxHeight: 8.5 * 12, // 102" load height (deck 5' off ground, ~13'6" total)
    maxOverhang: 4 * 12, // 4' legal rear overhang (federal default)
    enclosed: false,
    description: "Open deck. Allows up to 4' rear overhang without permit.",
  },
  {
    id: "stepdeck-53",
    name: "53' Step Deck",
    shortName: "Step Deck",
    deckLength: 53 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 10 * 12, // 120" — drop deck allows ~10' load height
    maxOverhang: 4 * 12,
    enclosed: false,
    description: "Drop deck for taller loads (~10' tall) without permits.",
  },
  {
    id: "doubledrop-48",
    name: "48' Double Drop",
    shortName: "Double Drop",
    deckLength: 29 * 12, // 29' well
    deckWidth: 8.5 * 12,
    maxHeight: 11.5 * 12, // 138" — well allows ~11'6"
    maxOverhang: 4 * 12,
    enclosed: false,
    description: "Deep well for very tall freight (up to 11'6\"). 29' well length.",
  },
  {
    id: "rgn-53",
    name: "53' RGN (Lowboy)",
    shortName: "RGN",
    deckLength: 29 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 12 * 12, // 144"
    maxOverhang: 4 * 12,
    enclosed: false,
    description: "Removable gooseneck. Heaviest, tallest loads; drive-on capable.",
  },
];

export const FEDERAL_LIMITS = {
  /** 8'6" max width without oversize permit */
  maxWidthIn: 8.5 * 12,
  /** 13'6" max height without oversize permit (varies by state) */
  maxHeightIn: 13.5 * 12,
  /** Default 4' rear overhang on flatbeds (federal/most states) */
  maxOverhangIn: 4 * 12,
  /** 53' is the common max trailer length; longer = oversize */
  maxLengthIn: 53 * 12,
} as const;

export function getTrailerById(id: string): TrailerSpec | undefined {
  return TRAILERS.find((t) => t.id === id);
}
