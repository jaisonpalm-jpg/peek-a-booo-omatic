import type { TrailerSpec } from "./types";

// Interior / deck dimensions in INCHES.
// Sources: industry standard published dimensions.
export const TRAILERS: TrailerSpec[] = [
  {
    id: "box-16",
    name: "16' Box Truck",
    shortName: "Box 16'",
    deckLength: 16 * 12,
    deckWidth: 7.7 * 12,
    maxHeight: 7 * 12,
    maxOverhang: 0,
    maxPayloadLb: 12_500,
    enclosed: true,
    description: "Compact enclosed box. Ideal for short local loads under 16'.",
  },
  {
    id: "box-26",
    name: "26' Box Truck",
    shortName: "Box 26'",
    deckLength: 26 * 12,
    deckWidth: 8 * 12,
    maxHeight: 8.5 * 12,
    maxOverhang: 0,
    maxPayloadLb: 20_000,
    enclosed: true,
    description: "Enclosed dry box. Ideal for sub-26' loads under 8'6\" tall.",
  },
  {
    id: "dryvan-53",
    name: "53' Dry Van",
    shortName: "53' Van",
    deckLength: 53 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 9 * 12,
    maxOverhang: 0,
    maxPayloadLb: 44_000,
    enclosed: true,
    description: "Standard enclosed OTR van. 53' interior, ~9' tall.",
  },
  {
    id: "flatbed-48",
    name: "48' Flatbed",
    shortName: "48' Flat",
    deckLength: 48 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 8.5 * 12,
    maxOverhang: 4 * 12,
    maxPayloadLb: 48_000,
    enclosed: false,
    description: "Open deck. Allows up to 4' rear overhang without permit.",
  },
  {
    id: "hotshot-40",
    name: "40' Hotshot",
    shortName: "Hotshot",
    deckLength: 40 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 8.5 * 12,
    maxOverhang: 4 * 12,
    maxPayloadLb: 16_500,
    enclosed: false,
    description: "Class-3/5 pickup with gooseneck. Fast LTL flatbed for sub-40' loads under ~16.5k lbs.",
  },
  {
    id: "conestoga-48",
    name: "48' Conestoga",
    shortName: "Conestoga",
    deckLength: 48 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 8.17 * 12,
    maxOverhang: 4 * 12,
    maxPayloadLb: 45_000,
    enclosed: false,
    description: "Flatbed with rolling tarp system. Weather protection without crane-load restrictions.",
  },
  {
    id: "stepdeck-53",
    name: "53' Step Deck",
    shortName: "Step Deck",
    deckLength: 53 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 10 * 12,
    maxOverhang: 4 * 12,
    maxPayloadLb: 48_000,
    enclosed: false,
    description: "Drop deck for taller loads (~10' tall) without permits.",
  },
  {
    id: "doubledrop-48",
    name: "48' Double Drop",
    shortName: "Double Drop",
    deckLength: 29 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 11.5 * 12,
    maxOverhang: 4 * 12,
    maxPayloadLb: 40_000,
    enclosed: false,
    description: "Deep well for very tall freight (up to 11'6\"). 29' well length.",
  },
  {
    id: "rgn-53",
    name: "53' RGN (Lowboy)",
    shortName: "RGN",
    deckLength: 29 * 12,
    deckWidth: 8.5 * 12,
    maxHeight: 12 * 12,
    maxOverhang: 4 * 12,
    maxPayloadLb: 42_000,
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
