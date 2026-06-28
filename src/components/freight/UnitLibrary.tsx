import { useEffect, useMemo, useState } from "react";
import { BookMarked, ChevronDown, ChevronUp, Plus, Search, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { LibraryUnit, Piece, UnitCategory } from "@/lib/freight/types";
import {
  UNIT_CATEGORIES,
  deleteLibraryUnit,
  getUserLibrary,
  saveLibraryUnit,
  unitToPiece,
} from "@/lib/freight/unitLibrary";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface UnitLibraryProps {
  onAddPieces: (pieces: Piece[]) => void;
}

interface DraftUnit {
  id?: string;
  name: string;
  category: UnitCategory;
  length: string;
  width: string;
  height: string;
  weight: string;
  insulated: boolean;
  notes: string;
}

const EMPTY_DRAFT: DraftUnit = {
  name: "",
  category: "RTU",
  length: "",
  width: "",
  height: "",
  weight: "",
  insulated: false,
  notes: "",
};

function unitToDraft(u: LibraryUnit): DraftUnit {
  return {
    id: u.id,
    name: u.name,
    category: u.category,
    length: String(u.length),
    width: String(u.width),
    height: String(u.height),
    weight: u.weight != null ? String(u.weight) : "",
    insulated: !!u.insulated,
    notes: u.notes ?? "",
  };
}

export function UnitLibrary({ onAddPieces }: UnitLibraryProps) {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState<LibraryUnit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftUnit>(EMPTY_DRAFT);
  const [qtyById, setQtyById] = useState<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data.user?.id ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!open || units !== null || !userId) return;
    setLoading(true);
    getUserLibrary(userId)
      .then((rows) => setUnits(rows))
      .catch((err) => toast.error(err.message ?? "Failed to load library"))
      .finally(() => setLoading(false));
  }, [open, units, userId]);

  const filtered = useMemo(() => {
    const list = units ?? [];
    const q = search.trim().toLowerCase();
    const matches = q
      ? list.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.category.toLowerCase().includes(q),
        )
      : list;
    const groups: Record<string, LibraryUnit[]> = {};
    for (const u of matches) {
      (groups[u.category] ??= []).push(u);
    }
    return groups;
  }, [units, search]);

  const handleSave = async () => {
    if (!userId) return;
    const length = Number(draft.length);
    const width = Number(draft.width);
    const height = Number(draft.height);
    if (!draft.name.trim() || !length || !width || !height) {
      toast.error("Name and dimensions are required");
      return;
    }
    const unit: LibraryUnit = {
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name.trim(),
      category: draft.category,
      length,
      width,
      height,
      weight: draft.weight ? Number(draft.weight) : undefined,
      insulated: draft.insulated,
      notes: draft.notes.trim() || undefined,
      createdAt: Date.now(),
    };
    try {
      const saved = await saveLibraryUnit(userId, unit);
      setUnits((prev) => {
        const list = prev ?? [];
        const idx = list.findIndex((u) => u.id === saved.id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = saved;
          return next;
        }
        return [...list, saved];
      });
      toast.success("Saved to Unit Library");
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Save failed");
    }
  };

  const handleDelete = async (unit: LibraryUnit) => {
    if (!userId) return;
    if (!confirm(`Delete "${unit.name}" from your library?`)) return;
    try {
      await deleteLibraryUnit(userId, unit.id);
      setUnits((prev) => (prev ?? []).filter((u) => u.id !== unit.id));
      toast.success("Removed from library");
    } catch (err) {
      toast.error((err as Error).message ?? "Delete failed");
    }
  };

  const handleAddToJob = (unit: LibraryUnit) => {
    const qty = Math.max(1, Math.min(99, qtyById[unit.id] ?? 1));
    onAddPieces([unitToPiece(unit, qty)]);
    toast.success(`Added ${qty} × ${unit.name}`);
  };

  return (
    <div className="bg-card ring-2 ring-rule overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-rule text-background px-4 sm:px-5 py-3 flex items-center justify-between"
      >
        <span className="text-xs font-bold uppercase tracking-widest inline-flex items-center gap-2">
          <BookMarked className="size-3.5" />
          Unit Library
          {units && (
            <span className="text-[10px] font-mono opacity-80">
              · {units.length} saved
            </span>
          )}
        </span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or category…"
                className="w-full bg-secondary pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rule"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2 text-xs font-bold py-2.5 px-4 bg-rule text-background uppercase tracking-widest hover:opacity-90"
            >
              <Plus className="size-3.5" />
              Save New Unit
            </button>
          </div>

          {showForm && (
            <UnitForm
              draft={draft}
              setDraft={setDraft}
              onCancel={() => setShowForm(false)}
              onSave={handleSave}
            />
          )}

          {loading && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Loading library…
            </p>
          )}

          {!loading && units !== null && units.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No units saved yet. Add your first unit or units will appear here after
              you save pieces from a job.
            </p>
          )}

          {!loading && units !== null && Object.keys(filtered).length === 0 && search && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No units match &quot;{search}&quot;.
            </p>
          )}

          <div className="space-y-4">
            {UNIT_CATEGORIES.filter((c) => filtered[c]?.length).map((cat) => (
              <div key={cat}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  {cat}
                </p>
                <ul className="divide-y divide-border ring-1 ring-border">
                  {filtered[cat].map((u) => (
                    <UnitRow
                      key={u.id}
                      unit={u}
                      qty={qtyById[u.id] ?? 1}
                      onQty={(n) =>
                        setQtyById((prev) => ({ ...prev, [u.id]: n }))
                      }
                      onAdd={() => handleAddToJob(u)}
                      onEdit={() => {
                        setDraft(unitToDraft(u));
                        setShowForm(true);
                      }}
                      onDelete={() => handleDelete(u)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UnitRow({
  unit,
  qty,
  onQty,
  onAdd,
  onEdit,
  onDelete,
}: {
  unit: LibraryUnit;
  qty: number;
  onQty: (n: number) => void;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="p-3 flex items-center gap-3 flex-wrap bg-card">
      <div className="flex-1 min-w-[160px]">
        <p className="text-sm font-semibold leading-tight">{unit.name}</p>
        <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
          {unit.length}&quot; × {unit.width}&quot; × {unit.height}&quot;
          {unit.weight ? ` · ${unit.weight} lb` : ""}
          {unit.insulated ? " · insulated" : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={1}
          max={99}
          value={qty}
          onChange={(e) => onQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
          className="w-14 h-9 bg-secondary px-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rule text-center"
          aria-label="Quantity"
        />
        <button
          type="button"
          onClick={onAdd}
          className="h-9 px-3 text-[10px] font-bold uppercase tracking-widest bg-rule text-background hover:opacity-90"
        >
          Add to Job
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="size-9 inline-flex items-center justify-center bg-secondary hover:bg-muted text-muted-foreground"
          aria-label="Edit"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="size-9 inline-flex items-center justify-center bg-secondary hover:bg-destructive hover:text-destructive-foreground text-muted-foreground"
          aria-label="Delete"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

function UnitForm({
  draft,
  setDraft,
  onCancel,
  onSave,
}: {
  draft: DraftUnit;
  setDraft: (d: DraftUnit) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className={cn("bg-secondary p-4 ring-1 ring-border space-y-3")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full h-10 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rule"
            maxLength={120}
          />
        </Field>
        <Field label="Category">
          <select
            value={draft.category}
            onChange={(e) =>
              setDraft({ ...draft, category: e.target.value as UnitCategory })
            }
            className="w-full h-10 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rule"
          >
            {UNIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Length (in)">
          <NumIn value={draft.length} onChange={(v) => setDraft({ ...draft, length: v })} />
        </Field>
        <Field label="Width (in)">
          <NumIn value={draft.width} onChange={(v) => setDraft({ ...draft, width: v })} />
        </Field>
        <Field label="Height (in)">
          <NumIn value={draft.height} onChange={(v) => setDraft({ ...draft, height: v })} />
        </Field>
        <Field label="Weight (lb, optional)">
          <NumIn value={draft.weight} onChange={(v) => setDraft({ ...draft, weight: v })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={draft.insulated}
          onChange={(e) => setDraft({ ...draft, insulated: e.target.checked })}
          className="size-4 accent-foreground"
        />
        <span>Insulated / weather-sensitive</span>
      </label>
      <Field label="Notes (optional)">
        <input
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="w-full h-10 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rule"
          maxLength={240}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-bold py-2.5 px-4 bg-background ring-2 ring-rule uppercase tracking-widest hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="text-xs font-bold py-2.5 px-4 bg-rule text-background uppercase tracking-widest hover:opacity-90"
        >
          {draft.id ? "Update Unit" : "Save Unit"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={9999}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 bg-background px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rule"
    />
  );
}
