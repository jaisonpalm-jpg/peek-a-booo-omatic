import { supabase } from "@/integrations/supabase/client";
import type { LibraryUnit, Piece, UnitCategory } from "./types";

/**
 * Pre-seeded HVAC unit starter set. Written to the user's library on first
 * load when the library is empty.
 */
export const DEFAULT_UNITS: Omit<LibraryUnit, "id" | "createdAt">[] = [
  { name: "RTU 2-Ton", category: "RTU", length: 36, width: 30, height: 28, weight: 185, insulated: false },
  { name: "RTU 5-Ton", category: "RTU", length: 48, width: 38, height: 34, weight: 320, insulated: false },
  { name: "RTU 10-Ton", category: "RTU", length: 72, width: 48, height: 44, weight: 680, insulated: false },
  { name: "RTU 20-Ton", category: "RTU", length: 96, width: 60, height: 52, weight: 1400, insulated: false },
  { name: "Air Handler 4-Ton", category: "AHU", length: 52, width: 24, height: 24, weight: 210, insulated: true },
  { name: "Air Handler 10-Ton", category: "AHU", length: 72, width: 36, height: 36, weight: 480, insulated: true },
  { name: "Condenser 3-Ton", category: "Condenser", length: 30, width: 30, height: 34, weight: 145, insulated: false },
  { name: "Condenser 5-Ton", category: "Condenser", length: 36, width: 36, height: 38, weight: 220, insulated: false },
  { name: "Roof Curb Standard", category: "Curb", length: 44, width: 36, height: 14, weight: 85, insulated: false },
  { name: "Roof Curb Large", category: "Curb", length: 60, width: 48, height: 16, weight: 140, insulated: false },
  { name: "Spiral Duct 12\"", category: "Pipe", length: 120, width: 12, height: 12, weight: 40, insulated: false },
  { name: "Spiral Duct 24\"", category: "Pipe", length: 120, width: 24, height: 24, weight: 95, insulated: false },
];

interface DbRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  length: number | string;
  width: number | string;
  height: number | string;
  weight: number | string | null;
  insulated: boolean | null;
  notes: string | null;
  created_at: string;
}

function toUnit(row: DbRow): LibraryUnit {
  const num = (v: number | string) => (typeof v === "string" ? Number(v) : v);
  return {
    id: row.id,
    name: row.name,
    category: row.category as UnitCategory,
    length: num(row.length),
    width: num(row.width),
    height: num(row.height),
    weight: row.weight != null ? num(row.weight) : undefined,
    insulated: !!row.insulated,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

/** Fetch all saved units for the given user; seeds defaults if empty. */
export async function getUserLibrary(userId: string): Promise<LibraryUnit[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("library_units" as any);
  const { data, error } = await table
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as DbRow[];

  if (rows.length === 0) {
    const seedRows = DEFAULT_UNITS.map((u) => ({ ...u, user_id: userId }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: seedErr } = await supabase
      .from("library_units" as any)
      .insert(seedRows)
      .select("*");
    if (seedErr) throw new Error(seedErr.message);
    return ((inserted ?? []) as unknown as DbRow[]).map(toUnit);
  }
  return rows.map(toUnit);
}

/** Upsert a single unit by id. */
export async function saveLibraryUnit(
  userId: string,
  unit: LibraryUnit,
): Promise<LibraryUnit> {
  const payload = {
    id: unit.id,
    user_id: userId,
    name: unit.name,
    category: unit.category,
    length: unit.length,
    width: unit.width,
    height: unit.height,
    weight: unit.weight ?? null,
    insulated: !!unit.insulated,
    notes: unit.notes ?? null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from("library_units" as any)
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toUnit(data as unknown as DbRow);
}

export async function deleteLibraryUnit(_userId: string, unitId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from("library_units" as any).delete().eq("id", unitId);
  if (error) throw new Error(error.message);
}

/** Convert a library unit into a fresh manifest Piece. */
export function unitToPiece(unit: LibraryUnit, qty: number): Piece {
  return {
    id: crypto.randomUUID(),
    description: unit.name,
    length: unit.length,
    width: unit.width,
    height: unit.height,
    qty: Math.max(1, Math.floor(qty)),
    orientation: "as-entered",
    weight: unit.weight,
    insulated: !!unit.insulated,
  };
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  "RTU",
  "AHU",
  "Condenser",
  "Curb",
  "Pipe",
  "Accessory",
  "Other",
];
