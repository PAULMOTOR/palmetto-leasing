import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { DealHero } from "@/components/desk/deal-hero";
import { StagePill } from "@/components/desk/stage-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deskBoard, deskCreditLink, deskDeal, deskDeleteDeal, deskSaveQuote } from "@/lib/desk/actions";
import { canDeleteDeal, deskStage } from "@/lib/desk/stages";
import type { DeskDeal } from "@/lib/desk/types";
import { formatCadExact } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/desk/$slug/deals_/$id")({
  component: DealCardPage,
  head: () => ({
    meta: [{ title: "Quote | Palmetto" }],
  }),
});

const POLL_MS = 60_000;

function DealCardPage() {
  const { slug, id } = Route.useParams();
  const nav = useNavigate();
  const [deal, setDeal] = useState<DeskDeal | null>(null);
  const [dealerName, setDealerName] = useState(slug);
  const [live, setLive] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revise, setRevise] = useState(false);
  const [busy, setBusy] = useState<"link" | "quote" | "delete" | null>(null);

  const [price, setPrice] = useState("");
  const [down, setDown] = useState("");
  const [residual, setResidual] = useState("");
  const [term, setTerm] = useState("");
  const [monthly, setMonthly] = useState("");
  const [rate, setRate] = useState("");

  const load = useCallback(async () => {
    const token = readDealerToken();
    if (!token) return;
    try {
      const [card, board] = await Promise.all([
        deskDeal({ data: { token, slug, id } }),
        deskBoard({ data: { token, slug } }).catch(() => null),
      ]);
      setDeal(card.deal);
      setDealerName(board?.dealerName || card.dealerName || slug);
      setLive(board?.live ?? false);
      setOnboardingUrl(board?.onboardingUrl || "");
      setError(null);
      const q = card.deal.quote;
      setPrice(q?.price != null ? String(q.price) : "");
      setDown(q?.down != null ? String(q.down) : "");
      setResidual(q?.residual != null ? String(q.residual) : "");
      setTerm(q?.term != null ? String(q.term) : "");
      setMonthly(q?.monthly != null ? String(q.monthly) : "");
      setRate(q?.rate != null ? String(q.rate) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deal not found");
    } finally {
      setLoading(false);
    }
  }, [slug, id]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  async function onStartCredit() {
    if (onboardingUrl) {
      window.open(onboardingUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const token = readDealerToken();
    if (!token || !deal) return;
    setBusy("link");
    try {
      const res = await deskCreditLink({
        data: { token, slug, id: deal.id, email: deal.email },
      });
      if (!res.ok || !res.url) {
        toast.error(res.error || "No onboarding link for this rooftop yet");
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Credit link failed");
    } finally {
      setBusy(null);
    }
  }

  async function onRevise(e: React.FormEvent) {
    e.preventDefault();
    const token = readDealerToken();
    if (!token || !deal) return;
    setBusy("quote");
    try {
      const res = await deskSaveQuote({
        data: {
          token,
          slug,
          id: deal.id,
          price: Number(price) || 0,
          down: Number(down) || 0,
          residual: Number(residual) || 0,
          term: Number(term) || 0,
          monthly: Number(monthly) || 0,
          rate: Number(rate) || 0,
          vin: deal.vin || undefined,
          year: deal.year,
          make: deal.make || undefined,
          model: deal.model || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error || "Quote not saved");
        return;
      }
      toast.success("Quote updated");
      setRevise(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Quote failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    const token = readDealerToken();
    if (!token || !deal) return;
    if (!window.confirm("Delete this quote? This cannot be undone.")) return;
    setBusy("delete");
    try {
      const res = await deskDeleteDeal({ data: { token, slug, id: deal.id } });
      if (!res.ok) {
        toast.error(res.error || "Could not delete");
        return;
      }
      toast.success("Quote deleted");
      void nav({ to: "/desk/$slug/deals", params: { slug } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(null);
    }
  }

  const lost = deal ? deskStage(deal.bucket) === "lost" : false;
  const q = deal?.quote;

  return (
    <DeskFrame slug={slug} dealerName={dealerName} live={live}>
      <p className="mb-4 text-xs">
        <Link to="/desk/$slug/deals" params={{ slug }} className="text-fg-subtle hover:text-fg">
          ← Quotes
        </Link>
      </p>

      {loading && !deal ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-fg-subtle" />
        </div>
      ) : error || !deal ? (
        <p className="rounded-[var(--radius-xl)] border border-border bg-surface px-5 py-10 text-center text-sm text-fg-muted">
          {error || "Quote not found for this rooftop."}
        </p>
      ) : (
        <div className={cn("grid gap-4 lg:grid-cols-[1fr_360px]", lost && "opacity-60")}>
          <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="flex items-start gap-4">
              <DealHero url={deal.heroUrl} alt={deal.vehicle || "Vehicle"} size={96} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] tracking-[0.2em] text-fg-subtle uppercase">Quote</p>
                <h2 className="mt-1 text-lg font-medium tracking-tight">{deal.clientName || "Client"}</h2>
                <p className="mt-1 text-sm text-fg-muted">{deal.vehicle || "Vehicle TBD"}</p>
                <div className="mt-3">
                  <StagePill bucket={deal.bucket} />
                </div>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Row label="VIN" value={deal.vin || "—"} mono />
              <Row label="Email" value={deal.email || "—"} />
              <Row label="Updated" value={deal.updatedAt.slice(0, 16).replace("T", " ")} />
              <Row label="IDs" value={deal.docsMissing.length ? deal.docsMissing.join(", ") : "Same stage as credit"} />
            </dl>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void onStartCredit()} disabled={busy === "link" || lost}>
                {busy === "link" ? <Loader2 className="animate-spin" /> : null}
                Start credit
              </Button>
              {canDeleteDeal(deal.bucket) ? (
                <Button type="button" variant="secondary" onClick={() => void onDelete()} disabled={busy === "delete"}>
                  {busy === "delete" ? <Loader2 className="animate-spin" /> : null}
                  Delete quote
                </Button>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              Start credit opens this rooftop’s CRM onboarding link. Uploading IDs stays in the credit stage. Palmetto does not give the dealer a CRM login.
            </p>
          </section>

          <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Quoted</h3>
              {!lost ? (
                <button type="button" className="text-xs font-medium text-fg underline" onClick={() => setRevise((v) => !v)}>
                  {revise ? "Cancel" : "Revise"}
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-fg-muted">Read from the CRM. Revising saves numbers only and does not move the stage.</p>
            {revise ? (
              <form onSubmit={onRevise} className="mt-4 space-y-3">
                <Money label="Price" value={price} onChange={setPrice} />
                <Money label="Down" value={down} onChange={setDown} />
                <Money label="Residual" value={residual} onChange={setResidual} />
                <Money label="Term (months)" value={term} onChange={setTerm} />
                <Money label="Monthly" value={monthly} onChange={setMonthly} />
                <Money label="Rate %" value={rate} onChange={setRate} />
                <Button type="submit" className="w-full" disabled={busy === "quote"}>
                  {busy === "quote" ? <Loader2 className="animate-spin" /> : null}
                  Save revision
                </Button>
              </form>
            ) : (
              <dl className="mt-4 space-y-2 text-sm">
                <QuoteRow label="Monthly" value={q?.monthly != null ? formatCadExact(Math.round(q.monthly * 100)) : "—"} strong />
                <QuoteRow label="Price" value={q?.price != null ? formatCadExact(Math.round(q.price * 100)) : "—"} />
                <QuoteRow label="Down" value={q?.down != null ? formatCadExact(Math.round(q.down * 100)) : "—"} />
                <QuoteRow label="Residual" value={q?.residual != null ? formatCadExact(Math.round(q.residual * 100)) : "—"} />
                <QuoteRow label="Term" value={q?.term ? `${q.term} mo` : "—"} />
                <QuoteRow label="Rate" value={q?.rate != null ? `${q.rate.toFixed(2)}%` : "—"} />
              </dl>
            )}
          </section>
        </div>
      )}
    </DeskFrame>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[10px] tracking-[0.12em] text-fg-subtle uppercase">{label}</dt>
      <dd className={mono ? "font-mono text-xs text-fg" : "text-fg"}>{value}</dd>
    </>
  );
}

function QuoteRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={strong ? "text-lg font-medium tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

function Money({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = label.toLowerCase().replace(/[^a-z]/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}
