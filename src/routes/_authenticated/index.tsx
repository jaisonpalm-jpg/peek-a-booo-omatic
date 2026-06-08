import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Download, LogOut, Link2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { PieceTable } from "@/components/freight/PieceTable";
import { RecommendationPanel } from "@/components/freight/RecommendationPanel";
import { ScanSheetButton } from "@/components/freight/ScanSheetButton";
import { JobsSidebar } from "@/components/freight/JobsSidebar";

import { recommend } from "@/lib/freight/recommend";
import { exportLoadSummaryPdf } from "@/lib/freight/exportPdf";
import { useJobs } from "@/lib/freight/jobsStore";
import type { Piece } from "@/lib/freight/types";
import { supabase } from "@/integrations/supabase/client";
import { createShareLink } from "@/lib/share.functions";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "LoadFit — Freight Trailer Estimator" },
      {
        name: "description",
        content:
          "Enter piece dimensions from a build sheet and get an instant trailer recommendation with legal oversize flags.",
      },
    ],
  }),
  component: EstimatorPage,
});

function EstimatorPage() {
  const {
    hydrated,
    jobs,
    activeJob,
    activeId,
    createJob,
    selectJob,
    renameJob,
    updatePieces,
    updateMaxCurbStack,
    deleteJob,
  } = useJobs();

  const pieces = activeJob?.pieces ?? [];
  const jobName = activeJob?.name ?? "";
  const maxCurbStack = activeJob?.maxCurbStack ?? 3;
  const rec = useMemo(() => recommend(pieces, { maxCurbStack }), [pieces, maxCurbStack]);

  const shareFn = useServerFn(createShareLink);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const setPieces = (next: Piece[] | ((prev: Piece[]) => Piece[])) => {
    if (!activeJob) return;
    const resolved = typeof next === "function" ? next(activeJob.pieces) : next;
    updatePieces(activeJob.id, resolved);
  };

  const setJobName = (name: string) => {
    if (!activeJob) return;
    renameJob(activeJob.id, name);
  };

  const setMaxCurbStack = (value: number) => {
    if (!activeJob) return;
    updateMaxCurbStack(activeJob.id, value);
  };

  const handleShare = useCallback(async () => {
    if (!activeJob) return;
    setShareLoading(true);
    setShareUrl(null);
    try {
      const { token } = await shareFn({ data: { jobId: activeJob.id } });
      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* clipboard blocked — user can copy manually */
      }
    } catch (err) {
      console.error(err);
    } finally {
      setShareLoading(false);
    }
  }, [activeJob, shareFn]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  };

  const handleCreate = useCallback(async () => {
    await createJob("Untitled Job");
  }, [createJob]);

  if (!hydrated) {
    return <div className="min-h-screen bg-background" aria-busy="true" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="lg:pl-64">
        <header className="border-b-2 border-rule bg-card sticky top-0 z-10">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-3 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <JobsSidebar
                jobs={jobs}
                activeId={activeId}
                onSelect={selectJob}
                onCreate={handleCreate}
                onDelete={deleteJob}
              />
              <div className="size-9 bg-rule items-center justify-center shrink-0 hidden sm:flex">
                <div className="size-3.5 bg-background" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground leading-none">
                  LoadFit
                </p>
                <p className="text-sm font-semibold leading-tight truncate">
                  Freight Trailer Estimator
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                disabled={!activeJob || shareLoading || pieces.filter((p) => p.qty > 0 && p.length > 0).length === 0}
                className="inline-flex items-center gap-2 text-xs font-bold py-2.5 px-4 bg-background ring-2 ring-rule uppercase tracking-widest hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {shareLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Link2 className="size-3.5" />
                )}
                <span className="hidden sm:inline">Share</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  activeJob &&
                  exportLoadSummaryPdf({ jobName, pieces, rec, shareUrl: shareUrl ?? undefined })
                }
                disabled={pieces.filter((p) => p.qty > 0 && p.length > 0).length === 0}
                className="inline-flex items-center gap-2 text-xs font-bold py-2.5 px-4 bg-rule text-background uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="size-3.5" />
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 text-xs font-bold py-2.5 px-3 bg-background ring-2 ring-rule uppercase tracking-widest hover:bg-secondary"
                aria-label="Sign out"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>

          {shareUrl && (
            <div className="border-t border-rule bg-secondary">
              <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-2 flex items-center gap-3 text-xs">
                <Link2 className="size-3.5 shrink-0" />
                <span className="font-bold uppercase tracking-widest text-[10px]">
                  {copied ? "Copied" : "Share link"}
                </span>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono truncate underline"
                >
                  {shareUrl}
                </a>
              </div>
            </div>
          )}
        </header>

        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-6 sm:py-8">
          {!activeJob ? (
            <div className="py-24 text-center">
              <p className="text-sm text-muted-foreground mb-4">No job selected.</p>
              <button
                type="button"
                onClick={handleCreate}
                className="text-xs font-bold py-2.5 px-4 bg-rule text-background uppercase tracking-widest hover:opacity-90"
              >
                Create new job
              </button>
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-12 lg:gap-6 xl:gap-8 space-y-8 lg:space-y-0">
              <section className="lg:col-span-7 xl:col-span-8 space-y-6">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 bg-rule text-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                    Field Assessment
                  </div>
                  <input
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    maxLength={120}
                    placeholder="Job name"
                    className="w-full text-2xl sm:text-3xl font-semibold tracking-tight bg-transparent focus:outline-none focus:bg-secondary -mx-2 px-2 py-1"
                  />
                  <p className="text-sm text-muted-foreground max-w-prose">
                    Enter each piece&apos;s actual L × W × H in inches. Use the orient button
                    to test if rotating eliminates an oversize flag.
                  </p>
                </div>

                <ScanSheetButton
                  onPieces={(scanned) => setPieces((prev) => [...prev, ...scanned])}
                />

                <PieceTable pieces={pieces} onChange={setPieces} />
              </section>

              <aside className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start space-y-6">
                <div className="bg-card ring-2 ring-rule p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="curb-stack" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Max Curbs / Stack
                    </label>
                    <span className="font-mono text-sm font-bold">{maxCurbStack}</span>
                  </div>
                  <input
                    id="curb-stack"
                    type="range"
                    min={1}
                    max={6}
                    step={1}
                    value={maxCurbStack}
                    onChange={(e) => setMaxCurbStack(Number(e.target.value))}
                    className="w-full accent-foreground"
                  />
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Curb adapters stack on flatbeds with 2&quot; dunnage gaps. Trailer max load
                    height still caps the stack regardless of this setting.
                  </p>
                </div>
                <RecommendationPanel rec={rec} />
              </aside>
            </div>
          )}
        </main>

        <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-8 border-t border-border mt-12 text-xs text-muted-foreground">
          Federal limits: 8&apos;6&quot; width · 13&apos;6&quot; height · 53&apos; length · 4&apos; rear overhang.
          State permits may vary.
        </footer>
      </div>
    </div>
  );
}
