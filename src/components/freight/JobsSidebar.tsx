import { useState } from "react";
import { Plus, Trash2, FileText, X, Menu } from "lucide-react";
import type { Job } from "@/lib/freight/jobsStore";

interface Props {
  jobs: Job[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function JobListContent({ jobs, activeId, onSelect, onCreate, onDelete }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b-2 border-rule flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Jobs
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest py-1.5 px-2.5 bg-rule text-background hover:opacity-90"
        >
          <Plus className="size-3" />
          New
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto py-2">
        {jobs.length === 0 && (
          <li className="px-4 py-6 text-xs text-muted-foreground">No jobs yet.</li>
        )}
        {jobs.map((job) => {
          const active = job.id === activeId;
          const totalPieces = job.pieces.reduce((s, p) => s + (p.qty || 0), 0);
          return (
            <li key={job.id} className="px-2">
              <div
                className={`group relative flex items-start gap-2 px-3 py-2.5 cursor-pointer border-l-2 ${
                  active
                    ? "bg-secondary border-rule"
                    : "border-transparent hover:bg-secondary/60"
                }`}
                onClick={() => onSelect(job.id)}
              >
                <FileText
                  className={`size-3.5 mt-0.5 shrink-0 ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{job.name || "Untitled"}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                    {job.pieces.length} line{job.pieces.length === 1 ? "" : "s"} · {totalPieces}{" "}
                    pcs
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      window.confirm(`Delete "${job.name || "Untitled"}"? This cannot be undone.`)
                    ) {
                      onDelete(job.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  aria-label={`Delete ${job.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-3 border-t border-border text-[10px] uppercase tracking-widest text-muted-foreground">
        Stored locally in browser
      </div>
    </div>
  );
}

export function JobsSidebar(props: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile trigger — shown in flow, parent decides placement */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest py-2 px-3 bg-secondary border border-border"
        aria-label="Open jobs sidebar"
      >
        <Menu className="size-3.5" />
        Jobs
      </button>

      {/* Desktop: fixed left rail */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-card border-r-2 border-rule z-20">
        <div className="w-full pt-[73px]">
          {/* offset for sticky header height */}
          <JobListContent {...props} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-foreground/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="relative w-72 max-w-[80vw] bg-card border-r-2 border-rule h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-rule">
              <p className="text-xs font-bold uppercase tracking-[0.2em]">LoadFit</p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1"
                aria-label="Close sidebar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <JobListContent
                {...props}
                onSelect={(id) => {
                  props.onSelect(id);
                  setMobileOpen(false);
                }}
                onCreate={() => {
                  props.onCreate();
                  setMobileOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
