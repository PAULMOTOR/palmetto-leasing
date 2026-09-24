import { Link, createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { StagePill } from "@/components/desk/stage-pill";
import { DealHero } from "@/components/desk/deal-hero";
import { deskBoard } from "@/lib/desk/actions";
import { DESK_STAGES, DESK_STAGE_META, deskStage, type DeskStage } from "@/lib/desk/stages";
import type { DeskBoard, DeskDeal } from "@/lib/desk/types";
import { cn, formatCad } from "@/lib/utils";

const STAGES = ["quoted", "credit", "approved", "compliance", "lost"] as const;

export const Route = createFileRoute("/desk/$slug/deals")({
  validateSearch: (search: Record<string, unknown>) =>
    z
      .object({
        stage: z.enum(STAGES).optional(),
      })
      .parse({
        stage: typeof search.stage === "string" && (STAGES as readonly string[]).includes(search.stage) ? search.stage : undefined,
      }),
  component: QuotesPage,
  head: () => ({
    meta: [{ title: "Quotes | Palmetto" }],
  }),
});

const POLL_MS = 60_000;

function QuotesPage() {
  const { slug } = Route.useParams();
  const { stage } = Route.useSearch();
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
      setError(err instanceof Error ? err.message : "Could not load quotes");
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
    if (!stage) return deals;
    return deals.filter((d) => deskStage(d.bucket) === stage);
  }, [board, stage]);

  return (
    <DeskFrame slug={slug} dealerName={board?.dealerName} live={board?.live}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip slug={slug} active={!stage} label="All" />
          {DESK_STAGES.map((s) => (
            <FilterChip key={s} slug={slug} stage={s} active={stage === s} label={DESK_STAGE_META[s].label} />
          ))}
          <FilterChip slug={slug} stage="lost" active={stage === "lost"} label="Lost" />
        </div>
        {board?.onboardingUrl ? (
          <a
            href={board.onboardingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-fg underline"
          >
            Dealer onboarding
          </a>
        ) : null}
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
          No quotes here yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] tracking-[0.14em] text-fg-subtle uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Quote</th>
                <th className="px-4 py-3 font-medium">Progress</th>
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
  stage,
  active,
  label,
}: {
  slug: string;
  stage?: DeskStage;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      to="/desk/$slug/deals"
      params={{ slug }}
      search={stage ? { stage } : {}}
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
  const lost = deskStage(deal.bucket) === "lost";
  const ymm = [deal.year, deal.make, deal.model].filter(Boolean).join(" ") || deal.vehicle || "—";
  const monthly = deal.quote?.monthly;
  return (
    <tr className={cn("hover:bg-surface-2", lost && "opacity-45")}>
      <td className="px-4 py-3">
        <Link
          to="/desk/$slug/deals/$id"
          params={{ slug, id: deal.id }}
          className="flex items-center gap-3 font-medium text-fg hover:underline"
        >
          <DealHero url={deal.heroUrl} alt={ymm} />
          <span>
            <span className="block">{ymm}</span>
            <span className="block font-mono text-[11px] font-normal text-fg-muted">{deal.vin || "—"}</span>
          </span>
        </Link>
      </td>
      <td className="px-4 py-3 text-fg-muted">{deal.clientName || "—"}</td>
      <td className="px-4 py-3 tabular-nums text-fg">
        {monthly ? `${formatCad(Math.round(monthly * 100))}/mo` : "—"}
      </td>
      <td className="px-4 py-3">
        <StagePill bucket={deal.bucket} />
      </td>
    </tr>
  );
}
