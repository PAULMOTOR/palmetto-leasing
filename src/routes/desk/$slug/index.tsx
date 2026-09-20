import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { DealProgressNeedle, VintageGauge } from "@/components/desk/vintage-gauge";
import { DealHero } from "@/components/desk/deal-hero";
import { deskBoard } from "@/lib/desk/actions";
import { DESK_BUCKETS, DESK_BUCKET_TITLES } from "@/lib/desk/buckets";
import type { DeskBoard } from "@/lib/desk/types";

export const Route = createFileRoute("/desk/$slug/")({
  component: DeskHome,
});

const POLL_MS = 60_000;

function DeskHome() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const [board, setBoard] = useState<DeskBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = readDealerToken();
    if (!token) return;
    try {
      const next = await deskBoard({ data: { token, slug } });
      setBoard(next);
      setError(next.error || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load desk");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !board) {
    return (
      <DeskFrame slug={slug}>
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-fg-subtle" />
        </div>
      </DeskFrame>
    );
  }

  const gauges = board?.gauges;
  const deals = board?.deals || [];
  const peak = Math.max(8, ...DESK_BUCKETS.map((b) => gauges?.[b] || 0));

  return (
    <DeskFrame slug={slug} dealerName={board?.dealerName} live={board?.live}>
      {error ? (
        <p className="mb-4 rounded-[var(--radius-xl)] border border-border bg-surface px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {/another rooftop/i.test(error || "") ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {DESK_BUCKETS.map((bucket) => (
              <VintageGauge
                key={bucket}
                label={DESK_BUCKET_TITLES[bucket]}
                value={gauges?.[bucket] || 0}
                max={peak}
                onClick={() =>
                  void nav({
                    to: "/desk/$slug/deals",
                    params: { slug },
                    search: { bucket },
                  })
                }
              />
            ))}
          </div>

          <div className="mt-8 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">Your files</p>
              <Link
                to="/desk/$slug/new"
                params={{ slug }}
                className="text-xs font-medium text-fg hover:underline"
              >
                New deal
              </Link>
            </div>
            {deals.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-fg-muted">No files submitted yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-[10px] tracking-[0.14em] text-fg-subtle uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Vehicle</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deals.map((d) => {
                    const ymm =
                      [d.year, d.make, d.model].filter(Boolean).join(" ") || d.vehicle || "—";
                    return (
                      <tr key={d.id} className="hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <Link
                            to="/desk/$slug/deals/$id"
                            params={{ slug, id: d.id }}
                            className="flex items-center gap-3 font-medium text-fg hover:underline"
                          >
                            <DealHero url={d.heroUrl} alt={ymm} />
                            <span>
                              <span className="block">{ymm}</span>
                              <span className="block font-mono text-[11px] font-normal text-fg-muted">
                                {d.vin || "—"}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-fg-muted">{d.clientName || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <DealProgressNeedle bucket={d.bucket} />
                            <span className="text-[11px] tracking-wide text-fg-muted">
                              {DESK_BUCKET_TITLES[d.bucket] || d.bucketLabel}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </DeskFrame>
  );
}