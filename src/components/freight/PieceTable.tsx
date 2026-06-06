import { Plus, Trash2, RotateCw } from "lucide-react";
import type { Orientation, Piece } from "@/lib/freight/types";
import { effectiveDims } from "@/lib/freight/recommend";
import { FEDERAL_LIMITS } from "@/lib/freight/trailers";
import { cn } from "@/lib/utils";

interface PieceTableProps {
  pieces: Piece[];
  onChange: (pieces: Piece[]) => void;
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

export function PieceTable({ pieces, onChange }: PieceTableProps) {
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
      <div className="bg-rule px-5 py-3">
        <span className="text-xs font-bold text-background uppercase tracking-widest">
          Manifest — {pieces.length} {pieces.length === 1 ? "line" : "lines"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-secondary border-b-2 border-border">
              <th className="px-4 py-3 font-bold text-muted-foreground uppercase tracking-tight text-xs">
                Description
              </th>
              <th className="px-2 py-3 font-bold text-muted-foreground uppercase tracking-tight text-xs">
                L (in)
              </th>
              <th className="px-2 py-3 font-bold text-muted-foreground uppercase tracking-tight text-xs">
                W (in)
              </th>
              <th className="px-2 py-3 font-bold text-muted-foreground uppercase tracking-tight text-xs">
                H (in)
              </th>
              <th className="px-2 py-3 font-bold text-muted-foreground uppercase tracking-tight text-xs">
                Qty
              </th>
              <th className="px-2 py-3 font-bold text-muted-foreground uppercase tracking-tight text-xs">
                Wt (lb)
              </th>
              <th className="px-2 py-3 font-bold text-muted-foreground uppercase tracking-tight text-xs text-center">
                Ins
              </th>
              <th className="px-2 py-3 font-bold text-muted-foreground uppercase tracking-tight text-xs text-center">
                Orient
              </th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pieces.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  No pieces yet. Add a row to start estimating.
                </td>
              </tr>
            )}
            {pieces.map((p) => {
              const flags = pieceFlags(p);
              return (
                <tr key={p.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3">
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
                  <td className="px-2 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => update(p.id, { orientation: cycleOrientation(p.orientation) })}
                      title={ORIENTATION_HINT[p.orientation]}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest ring-1",
                        p.orientation === "as-entered"
                          ? "bg-secondary ring-border text-foreground"
                          : "bg-primary text-primary-foreground ring-primary",
                      )}
                    >
                      <RotateCw className="size-3" />
                      {ORIENTATION_LABEL[p.orientation]}
                    </button>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label="Remove row"
                      className="size-9 inline-flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground"
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
    <td className="px-2 py-3">
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
        className="w-16 bg-transparent font-mono text-sm focus:outline-none focus:bg-secondary px-2 py-1"
      />
    </td>
  );
}
