import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { deskBoard } from "@/lib/desk/actions";
import { DESK_BUCKETS, type DeskBucket } from "@/lib/desk/buckets";
import type { DeskBoard } from "@/lib/desk/types";
import { cn } from "@/lib/utils";

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
  const total = gauges ? DESK_BUCKETS.reduce((n, b) => n + (gauges[b] || 0), 0) : 0;

  return (
    <DeskFrame slug={slug} dealerName={board?.dealerName} live={board?.live}>
      {error ? (
        <p className="mb-4 rounded-[var(--radius-xl)] border border-border bg-surface px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {/another rooftop/i.test(error || "") ? null : (
      <>
      <p className="mb-4 text-sm text-fg-muted">
        {total} open file{total === 1 ? "" : "s"} on this rooftop. Click a gauge to open the list.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {DESK_BUCKETS.map((bucket) => (
          <GaugeCard
            key={bucket}
            bucket={bucket}
            count={gauges?.[bucket] || 0}
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
      </>
      )}
    </DeskFrame>
  );
}

function GaugeCard({
  bucket,
  count,
  onClick,
}: {
  bucket: DeskBucket;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-xl)] border border-border bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]",
        count > 0 ? "border-border-strong" : "",
      )}
    >
      <p className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">{bucket}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight">{count}</p>
    </button>
  );
}
