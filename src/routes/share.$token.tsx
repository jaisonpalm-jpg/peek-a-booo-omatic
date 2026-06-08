import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getShareLink } from "@/lib/share.functions";
import { recommend } from "@/lib/freight/recommend";
import { RecommendationPanel } from "@/components/freight/RecommendationPanel";
import { effectiveDims } from "@/lib/freight/recommend";
import type { Piece } from "@/lib/freight/types";

const shareQuery = (token: string) =>
  queryOptions({
    queryKey: ["share", token],
    queryFn: async () => {
      try {
        return await getShareLink({ data: { token } });
      } catch {
        throw notFound();
      }
    },
    staleTime: 60_000,
  });

export const Route = createFileRoute("/share/$token")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(shareQuery(params.token)),
  head: ({ loaderData }) => {
    const name = (loaderData as { name?: string } | undefined)?.name ?? "Load plan";
    return {
      meta: [
        { title: `${name} — Shared load plan` },
        { name: "description", content: `Read-only load plan: ${name}` },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: SharePage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Link expired or not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link is no longer valid.
        </p>
        <Link to="/" className="mt-4 inline-block underline text-sm">
          Go home
        </Link>
      </div>
    </div>
  ),
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center px-6">
      <p className="text-sm text-muted-foreground">Could not load this share link.</p>
    </div>
  ),
});

function SharePage() {
  const { token } = Route.useParams();
  const { data } = useSuspenseQuery(shareQuery(token));
  const pieces = (data.pieces as unknown as Piece[]) ?? [];
  const maxCurbStack = data.max_curb_stack ?? 3;
  const rec = useMemo(() => recommend(pieces, { maxCurbStack }), [pieces, maxCurbStack]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-rule bg-card">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 bg-rule flex items-center justify-center shrink-0">
              <div className="size-3.5 bg-background" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground leading-none">
                LoadFit · Shared Load Plan
              </p>
              <p className="text-sm font-semibold leading-tight truncate">
                {data.name}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] bg-secondary px-2.5 py-1">
            Read only
          </span>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-8 space-y-8">
        <section className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {data.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Snapshot generated{" "}
            {new Date(data.created_at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . This is a read-only copy of the load plan.
          </p>
        </section>

        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 bg-rule text-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
            Row 1 · Manifest · {pieces.length} line{pieces.length === 1 ? "" : "s"}
          </div>
          <div className="bg-card ring-2 ring-rule overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary">
                <tr className="text-left">
                  <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">#</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Description</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">L×W×H (in)</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((p, i) => {
                  const d = effectiveDims(p);
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{i + 1}</td>
                      <td className="px-3 py-2">{p.description || "—"}</td>
                      <td className="px-3 py-2 font-mono">
                        {d.length} × {d.width} × {d.height}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{p.qty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 bg-rule text-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
            Row 2 · Recommendation
          </div>
          <RecommendationPanel rec={rec} />
        </section>

        <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
          Federal limits: 8&apos;6&quot; width · 13&apos;6&quot; height · 53&apos; length · 4&apos;
          rear overhang. State permits may vary.
        </footer>
      </main>
    </div>
  );
}
