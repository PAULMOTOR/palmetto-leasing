import { Link, createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { deskBoard } from "@/lib/desk/actions";
import { DESK_BUCKETS, isDeskBucket, type DeskBucket } from "@/lib/desk/buckets";
import type { DeskBoard, DeskDeal } from "@/lib/desk/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/desk/$slug/deals")({
  validateSearch: (search: Record<string, unknown>) =>
    z
      .object({
        bucket: z.string().optional(),
      })
      .parse({
        bucket: typeof search.bucket === "string" && isDeskBucket(search.bucket) ? search.bucket : undefined,
      }),
  component: DealsListPage,
  head: () => ({
    meta: [{ title: "Files | Palmetto" }],
  }),
});

const POLL_MS = 60_000;

function DealsListPage() {
  const { slug } = Route.useParams();
  const { bucket } = Route.useSearch();
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
      setError(err instanceof Error ? err.message : "Could not load files");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const rows = useMemo(() => {
    const deals = board?.deals || [];
    if (bucket && isDeskBucket(bucket)) return deals.filter((d) => d.bucket === bucket);
    return deals;
  }, [board, bucket]);

  return (
    <DeskFrame slug={slug} dealerName={board?.dealerName} live={board?.live}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip slug={slug} active={!bucket} label="all" />
        {DESK_BUCKETS.map((b) => (
          <FilterChip key={b} slug={slug} bucket={b} active={bucket === b} label={b} />
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-[var(--radius-xl)] border border-border bg-surface px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading && !board ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-fg-subtle" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius-xl)] border border-border bg-surface px-5 py-10 text-center text-sm text-fg-muted">
          No files in this bucket.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] tracking-[0.14em] text-fg-subtle uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">VIN</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">bucketLabel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => (
                <DealRow key={d.id} slug={slug} deal={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DeskFrame>
  );
}

function FilterChip({
  slug,
  bucket,
  active,
  label,
}: {
  slug: string;
  bucket?: DeskBucket;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      to="/desk/$slug/deals"
      params={{ slug }}
      search={bucket ? { bucket } : {}}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] tracking-wide transition-colors",
        active ? "border-fg bg-fg text-primary-fg" : "border-border bg-surface text-fg-muted hover:text-fg",
      )}
    >
      {label}
    </Link>
  );
}

function DealRow({ slug, deal }: { slug: string; deal: DeskDeal }) {
  const ymm = [deal.year, deal.make, deal.model].filter(Boolean).join(" ") || deal.vehicle || "—";
  return (
    <tr className="hover:bg-surface-2">
      <td className="px-4 py-3 font-mono text-xs">{deal.vin || "—"}</td>
      <td className="px-4 py-3">
        <Link
          to="/desk/$slug/deals/$id"
          params={{ slug, id: deal.id }}
          className="font-medium text-fg hover:underline"
        >
          {ymm}
        </Link>
      </td>
      <td className="px-4 py-3 text-fg-muted">{deal.clientName || "—"}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] tracking-wide">
          {deal.bucketLabel}
        </span>
      </td>
    </tr>
  );
}
