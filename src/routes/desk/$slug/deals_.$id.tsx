import { Link, createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deskBoard, deskCreditLink, deskDeal, deskSaveQuote } from "@/lib/desk/actions";
import type { DeskDeal } from "@/lib/desk/types";

export const Route = createFileRoute("/desk/$slug/deals_/$id")({
  component: DealCardPage,
  head: () => ({
    meta: [{ title: "File | Palmetto" }],
  }),
});

const POLL_MS = 60_000;

function DealCardPage() {
  const { slug, id } = Route.useParams();
  const [deal, setDeal] = useState<DeskDeal | null>(null);
  const [dealerName, setDealerName] = useState(slug);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditUrl, setCreditUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"link" | "quote" | null>(null);

  const [price, setPrice] = useState("");
  const [down, setDown] = useState("");
  const [residual, setResidual] = useState("");
  const [term, setTerm] = useState("37");
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
      setError(null);
      const q = card.deal.quote;
      if (q) {
        if (q.price) setPrice(String(q.price));
        if (q.down) setDown(String(q.down));
        if (q.residual) setResidual(String(q.residual));
        if (q.term) setTerm(String(q.term));
        if (q.monthly) setMonthly(String(q.monthly));
        if (q.rate) setRate(String(q.rate));
      }
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

  async function onCreditLink() {
    const token = readDealerToken();
    if (!token || !deal) return;
    setBusy("link");
    try {
      const res = await deskCreditLink({
        data: { token, slug, id: deal.id, email: deal.email },
      });
      if (!res.ok || !res.url) {
        toast.error(res.error || "Could not mint credit-app link");
        return;
      }
      setCreditUrl(res.url);
      await navigator.clipboard.writeText(res.url).catch(() => undefined);
      toast.success("Credit-app link copied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Credit link failed");
    } finally {
      setBusy(null);
    }
  }

  async function onQuote(e: React.FormEvent) {
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
      toast.success("Quote saved on the CRM file");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Quote failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DeskFrame slug={slug} dealerName={dealerName} live={live}>
      <p className="mb-4 text-xs">
        <Link to="/desk/$slug/deals" params={{ slug }} className="text-fg-subtle hover:text-fg">
          ← Files
        </Link>
      </p>

      {loading && !deal ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-fg-subtle" />
        </div>
      ) : error || !deal ? (
        <p className="rounded-[var(--radius-xl)] border border-border bg-surface px-5 py-10 text-center text-sm text-fg-muted">
          {error || "Deal not found for this rooftop."}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <p className="text-[10px] tracking-[0.2em] text-fg-subtle uppercase">File</p>
            <h2 className="mt-1 text-lg font-medium tracking-tight">{deal.clientName || "Client"}</h2>
            <p className="mt-1 text-sm text-fg-muted">{deal.vehicle || "Vehicle TBD"}</p>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Row label="VIN" value={deal.vin || "—"} mono />
              <Row label="bucketLabel" value={deal.bucketLabel} />
              <Row label="Year / make / model" value={[deal.year, deal.make, deal.model].filter(Boolean).join(" ") || "—"} />
              <Row label="Updated" value={deal.updatedAt.slice(0, 16).replace("T", " ")} />
              <Row
                label="docsMissing"
                value={deal.docsMissing.length ? deal.docsMissing.join(", ") : "—"}
              />
              <Row label="complianceHold" value={deal.complianceHold ? "yes" : "no"} />
            </dl>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void onCreditLink()} disabled={busy === "link"}>
                {busy === "link" ? <Loader2 className="animate-spin" /> : null}
                Send credit link
              </Button>
              {creditUrl ? (
                <Button asChild variant="secondary">
                  <a href={creditUrl} target="_blank" rel="noreferrer">
                    Open credit app
                  </a>
                </Button>
              ) : null}
            </div>
            {creditUrl ? (
              <p className="mt-3 break-all text-xs text-fg-muted">{creditUrl}</p>
            ) : (
              <p className="mt-3 text-xs text-fg-subtle">
                Opens the CRM credit application. Palmetto does not rebuild that form.
              </p>
            )}
          </section>

          <form
            onSubmit={onQuote}
            className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6"
          >
            <h3 className="text-sm font-medium">Submit quote</h3>
            <p className="mt-1 text-xs text-fg-muted">Saves numbers on the CRM deal. Does not move stages from Palmetto.</p>
            <div className="mt-4 space-y-3">
              <Money label="Price" value={price} onChange={setPrice} />
              <Money label="Down" value={down} onChange={setDown} />
              <Money label="Residual" value={residual} onChange={setResidual} />
              <Money label="Term (months)" value={term} onChange={setTerm} />
              <Money label="Monthly" value={monthly} onChange={setMonthly} />
              <Money label="Rate" value={rate} onChange={setRate} />
            </div>
            <Button type="submit" className="mt-5 w-full" disabled={busy === "quote"}>
              {busy === "quote" ? <Loader2 className="animate-spin" /> : null}
              Submit quote
            </Button>
          </form>
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

function Money({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z]/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  );
}
