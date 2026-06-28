import { Plus, Trash2, RotateCw, BookmarkPlus } from "lucide-react";
import type { Orientation, Piece } from "@/lib/freight/types";
import { effectiveDims } from "@/lib/freight/recommend";
import { FEDERAL_LIMITS } from "@/lib/freight/trailers";
import { cn } from "@/lib/utils";

interface PieceTableProps {
  pieces: Piece[];
  onChange: (pieces: Piece[]) => void;
  /** When provided, each row shows a Save-to-Library button. */
  onSaveToLibrary?: (piece: Piece) => void;
}

const ORIENTATION_LABEL: Record<Orientation, string> = {
  "as-entered": "AS",
  "on-side": "ON",
  upright: "UP",
};

const ORIENTATION_HINT: Record<Orientation, string> = {
  "as-entered": "As entered (L × W × H)",
  "on-side": "On its side (L × H × W)",
  upright: "Upright (W × H × L)",
};

function cycleOrientation(o: Orientation): Orientation {
  return o === "as-entered" ? "on-side" : o === "on-side" ? "upright" : "as-entered";
}

function pieceFlags(p: Piece): string[] {
  const d = effectiveDims(p);
  const flags: string[] = [];
  if (d.width > FEDERAL_LIMITS.maxWidthIn) flags.push("WIDE");
  if (d.height > FEDERAL_LIMITS.maxHeightIn) flags.push("TALL");
  if (d.length > FEDERAL_LIMITS.maxLengthIn + FEDERAL_LIMITS.maxOverhangIn) flags.push("LONG");
  return flags;
}

export function PieceTable({ pieces, onChange, onSaveToLibrary }: PieceTableProps) {
  function update(id: string, patch: Partial<Piece>) {
    onChange(pieces.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function remove(id: string) {
    onChange(pieces.filter((p) => p.id !== id));
  }
  function add() {
    onChange([
      ...pieces,
      {
        id: crypto.randomUUID(),
        description: "",
        length: 0,
        width: 0,
        height: 0,
        qty: 1,
        orientation: "as-entered",
        weight: 0,
        insulated: false,
      },
    ]);
  }

  return (
    <div className="ring-2 ring-rule bg-card overflow-hidden">
      <div className="bg-rule px-4 sm:px-5 py-3">
        <span className="text-xs font-bold text-background uppercase tracking-widest">
          Manifest — {pieces.length} {pieces.length === 1 ? "line" : "lines"}
        </span>
      </div>

      {/* Mobile: card layout */}
      <div className="md:hidden divide-y-2 divide-border">
        {pieces.length === 0 && (
          <p className="px-4 py-10 text-center text-muted-foreground text-sm">
            No pieces yet. Add a row to start estimating.
          </p>
        )}
        {pieces.map((p, i) => {
          const flags = pieceFlags(p);
          return (
            <div key={p.id} className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono font-bold text-muted-foreground pt-2.5 w-5">
                  {i + 1}
                </span>
                <input
                  value={p.description}
                  onChange={(e) => update(p.id, { description: e.target.value })}
                  placeholder={`Piece ${i + 1} description`}
                  maxLength={120}
                  className="flex-1 bg-secondary px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rule"
                />
                {onSaveToLibrary && (
                  <button
                    type="button"
                    onClick={() => onSaveToLibrary(p)}
                    aria-label="Save to library"
                    title="Save to Unit Library"
                    className="size-10 shrink-0 inline-flex items-center justify-center bg-secondary text-muted-foreground active:bg-primary active:text-primary-foreground"
                  >
                    <BookmarkPlus className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label="Remove row"
                  className="size-10 shrink-0 inline-flex items-center justify-center bg-secondary text-muted-foreground active:bg-destructive active:text-destructive-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {flags.length > 0 && (
                <div className="flex gap-1 pl-7">
                  {flags.map((f) => (
                    <span
                      key={f}
                      className="text-[10px] font-bold px-1.5 py-0.5 bg-warning text-warning-foreground tracking-widest"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pl-7">
                <MobileField label="L (in)" value={p.length} onChange={(v) => update(p.id, { length: v })} />
                <MobileField label="W (in)" value={p.width} onChange={(v) => update(p.id, { width: v })} />
                <MobileField label="H (in)" value={p.height} onChange={(v) => update(p.id, { height: v })} />
                <MobileField label="Qty" value={p.qty} onChange={(v) => update(p.id, { qty: v })} min={1} />
                <MobileField label="Wt (lb)" value={p.weight ?? 0} onChange={(v) => update(p.id, { weight: v })} />
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Orient
                  </span>
                  <button
                    type="button"
                    onClick={() => update(p.id, { orientation: cycleOrientation(p.orientation) })}
                    title={ORIENTATION_HINT[p.orientation]}
                    className={cn(
                      "h-10 inline-flex items-center justify-center gap-1 px-2 text-[11px] font-bold uppercase tracking-widest ring-1",
                      p.orientation === "as-entered"
                        ? "bg-secondary ring-border text-foreground"
                        : "bg-primary text-primary-foreground ring-primary",
                    )}
                  >
                    <RotateCw className="size-3" />
                    {ORIENTATION_LABEL[p.orientation]}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 pl-7 pt-1 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!p.insulated}
                  onChange={(e) => update(p.id, { insulated: e.target.checked })}
                  className="size-4 accent-primary"
                />
                <span className="text-muted-foreground">Insulated / weather-sensitive</span>
              </label>
            </div>
          );
        })}
      </div>

      {/* Desktop: dense table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-secondary border-b-2 border-border">
              <th className="px-3 py-2 font-bold text-muted-foreground uppercase tracking-tight text-[11px]">
                Description
              </th>
              <th className="px-2 py-2 font-bold text-muted-foreground uppercase tracking-tight text-[11px]">L</th>
              <th className="px-2 py-2 font-bold text-muted-foreground uppercase tracking-tight text-[11px]">W</th>
              <th className="px-2 py-2 font-bold text-muted-foreground uppercase tracking-tight text-[11px]">H</th>
              <th className="px-2 py-2 font-bold text-muted-foreground uppercase tracking-tight text-[11px]">Qty</th>
              <th className="px-2 py-2 font-bold text-muted-foreground uppercase tracking-tight text-[11px]">Wt</th>
              <th className="px-2 py-2 font-bold text-muted-foreground uppercase tracking-tight text-[11px] text-center">Ins</th>
              <th className="px-2 py-2 font-bold text-muted-foreground uppercase tracking-tight text-[11px] text-center">Orient</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pieces.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  No pieces yet. Add a row to start estimating.
                </td>
              </tr>
            )}
            {pieces.map((p) => {
              const flags = pieceFlags(p);
              return (
                <tr key={p.id} className="hover:bg-secondary/50">
                  <td className="px-3 py-1.5 min-w-[220px]">
                    <input
                      value={p.description}
                      onChange={(e) => update(p.id, { description: e.target.value })}
                      placeholder="e.g. 24&quot; Spiral Pipe"
                      maxLength={120}
                      className="w-full bg-transparent font-medium focus:outline-none focus:bg-secondary px-2 py-1 -mx-2"
                    />
                    {flags.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {flags.map((f) => (
                          <span
                            key={f}
                            className="text-[9px] font-bold px-1.5 py-0.5 bg-warning text-warning-foreground tracking-widest"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <NumCell value={p.length} onChange={(v) => update(p.id, { length: v })} />
                  <NumCell value={p.width} onChange={(v) => update(p.id, { width: v })} />
                  <NumCell value={p.height} onChange={(v) => update(p.id, { height: v })} />
                  <NumCell value={p.qty} onChange={(v) => update(p.id, { qty: v })} min={1} />
                  <NumCell value={p.weight ?? 0} onChange={(v) => update(p.id, { weight: v })} />
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={!!p.insulated}
                      onChange={(e) => update(p.id, { insulated: e.target.checked })}
                      aria-label="Insulated / weather-sensitive"
                      className="size-4 accent-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => update(p.id, { orientation: cycleOrientation(p.orientation) })}
                      title={ORIENTATION_HINT[p.orientation]}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest ring-1",
                        p.orientation === "as-entered"
                          ? "bg-secondary ring-border text-foreground"
                          : "bg-primary text-primary-foreground ring-primary",
                      )}
                    >
                      <RotateCw className="size-3" />
                      {ORIENTATION_LABEL[p.orientation]}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {onSaveToLibrary && (
                      <button
                        type="button"
                        onClick={() => onSaveToLibrary(p)}
                        aria-label="Save to library"
                        title="Save to Unit Library"
                        className="size-8 inline-flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                      >
                        <BookmarkPlus className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label="Remove row"
                      className="size-8 inline-flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={add}
        className="w-full py-4 bg-secondary border-t-2 border-border text-sm font-bold text-foreground uppercase tracking-widest hover:bg-muted transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="size-4" />
        Add Line Item
      </button>
    </div>
  );
}

function MobileField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={9999}
        value={value === 0 ? "" : value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0 && n <= 9999) onChange(n);
          else if (e.target.value === "") onChange(0);
        }}
        className="h-10 bg-secondary px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rule"
      />
    </label>
  );
}

function NumCell({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <td className="px-2 py-1.5">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={9999}
        value={value === 0 ? "" : value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0 && n <= 9999) onChange(n);
          else if (e.target.value === "") onChange(0);
        }}
        className="w-14 bg-transparent font-mono text-sm focus:outline-none focus:bg-secondary px-2 py-1"
      />
    </td>
  );
}
