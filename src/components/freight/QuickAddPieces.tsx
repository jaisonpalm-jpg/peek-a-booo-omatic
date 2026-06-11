import { useState, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { Piece } from "@/lib/freight/types";
import { cn } from "@/lib/utils";

interface QuickAddPiecesProps {
  onAdd: (pieces: Piece[]) => void;
  /** Show the description field. Defaults to true. */
  showDescription?: boolean;
  /** Show the weight field. Defaults to false (raw-dims mode). */
  showWeight?: boolean;
  /** Compact horizontal variant for inline placement. Defaults to false (stacked). */
  compact?: boolean;
  /** Title shown on the header strip. */
  title?: string;
  /** Hide the header strip entirely. */
  hideHeader?: boolean;
  /** Button label override. */
  ctaLabel?: string;
  className?: string;
}

interface DraftState {
  description: string;
  length: string;
  width: string;
  height: string;
  qty: string;
  weight: string;
}

const EMPTY: DraftState = {
  description: "",
  length: "",
  width: "",
  height: "",
  qty: "1",
  weight: "",
};

export function QuickAddPieces({
  onAdd,
  showDescription = true,
  showWeight = false,
  compact = false,
  title = "Quick Add — raw dimensions",
  hideHeader = false,
  ctaLabel = "Add to manifest",
  className,
}: QuickAddPiecesProps) {
  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const parseNum = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const L = parseNum(draft.length);
    const W = parseNum(draft.width);
    const H = parseNum(draft.height);
    const Q = Math.max(1, Math.floor(parseNum(draft.qty) || 1));
    if (!(L > 0 && W > 0 && H > 0)) {
      setError("Enter length, width, and height (inches).");
      return;
    }
    const piece: Piece = {
      id: crypto.randomUUID(),
      description:
        draft.description.trim() ||
        `${L}″ × ${W}″ × ${H}″`,
      length: L,
      width: W,
      height: H,
      qty: Q,
      orientation: "as-entered",
      weight: showWeight ? parseNum(draft.weight) || 0 : 0,
      insulated: false,
    };
    onAdd([piece]);
    setDraft(EMPTY);
    setError(null);
  }

  return (
    <form
      onSubmit={submit}
      className={cn("ring-2 ring-rule bg-card overflow-hidden", className)}
    >
      {!hideHeader && (
        <div className="bg-rule px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-background uppercase tracking-widest">
            {title}
          </span>
          <span className="text-[10px] font-mono text-background/70 uppercase tracking-widest hidden sm:inline">
            inches
          </span>
        </div>
      )}

      <div
        className={cn(
          "p-3 sm:p-4 gap-2",
          compact
            ? "flex flex-wrap items-end"
            : "grid grid-cols-2 md:grid-cols-12",
        )}
      >
        {showDescription && (
          <Field
            label="Description"
            className={compact ? "min-w-[180px] flex-1" : "col-span-2 md:col-span-4"}
          >
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Optional"
              maxLength={120}
              className="h-10 w-full bg-secondary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rule"
            />
          </Field>
        )}
        <NumField
          label="L (in)"
          value={draft.length}
          onChange={(v) => setDraft({ ...draft, length: v })}
          className={compact ? "w-20" : "md:col-span-2"}
        />
        <NumField
          label="W (in)"
          value={draft.width}
          onChange={(v) => setDraft({ ...draft, width: v })}
          className={compact ? "w-20" : "md:col-span-2"}
        />
        <NumField
          label="H (in)"
          value={draft.height}
          onChange={(v) => setDraft({ ...draft, height: v })}
          className={compact ? "w-20" : "md:col-span-2"}
        />
        <NumField
          label="Qty"
          value={draft.qty}
          onChange={(v) => setDraft({ ...draft, qty: v })}
          min={1}
          className={compact ? "w-16" : "md:col-span-1"}
        />
        {showWeight && (
          <NumField
            label="Wt (lb)"
            value={draft.weight}
            onChange={(v) => setDraft({ ...draft, weight: v })}
            className={compact ? "w-20" : "md:col-span-1"}
          />
        )}

        <div
          className={cn(
            "col-span-2",
            compact ? "ml-auto" : showDescription ? "md:col-span-12" : "md:col-span-12",
            "flex items-center justify-between gap-3",
          )}
        >
          {error ? (
            <span className="text-[11px] font-bold text-destructive uppercase tracking-widest">
              {error}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Press Enter to add.
            </span>
          )}
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-xs font-bold py-2.5 px-4 bg-rule text-background uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            <Plus className="size-3.5" />
            {ctaLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  min = 0,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={9999}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full bg-secondary px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rule"
      />
    </Field>
  );
}
