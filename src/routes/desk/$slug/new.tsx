import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DeskFrame, readDealerToken } from "@/components/desk/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deskBoard, deskExplodeVin, deskStartDeal } from "@/lib/desk/actions";
import { quoteCrm, type LesseeKind, type TradeKind } from "@/lib/leasing/crm-quote";
import { displayDealerName } from "@/lib/leasing/dealer-name";
import {
  DESK_DEFAULT_APR,
  DESK_DEFAULT_APR_PCT,
  DESK_MIN_APR,
  DESK_MIN_APR_PCT,
  DESK_MIN_DOWN_PCT,
  DESK_TERM_OPTIONS,
  deskResidualCap,
  maxKmForPrice,
} from "@/lib/leasing/calc";
import { LEASE_PROVINCES, bcPstRate, normalizeProvince } from "@/lib/leasing/tax";

export const Route = createFileRoute("/desk/$slug/new")({
  component: NewDealPage,
  head: () => ({
    meta: [{ title: "New deal | Palmetto" }],
  }),
});

function NewDealPage() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const [dealerName, setDealerName] = useState(slug);
  const [live, setLive] = useState(false);
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [price, setPrice] = useState("");
  const [extra, setExtra] = useState("");
  const [pad, setPad] = useState("");
  const [term, setTerm] = useState(37);
  const [kmYear, setKmYear] = useState(16_000);
  const [downPct, setDownPct] = useState(20);
  const [aprPct, setAprPct] = useState(DESK_DEFAULT_APR_PCT);
  const [residualPct, setResidualPct] = useState(Math.round(deskResidualCap(37) * 100));
  const [province, setProvince] = useState("");
  const [lesseeKind, setLesseeKind] = useState<LesseeKind>("individual");
  const [tradeKind, setTradeKind] = useState<TradeKind>("none");
  const [tradeAllowance, setTradeAllowance] = useState("");
  const [lien, setLien] = useState("");
  const [handling, setHandling] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [adminFee, setAdminFee] = useState("");
  const [antiTheft, setAntiTheft] = useState("");
  const [ppsa, setPpsa] = useState("");
  const [licenceFee, setLicenceFee] = useState("");
  const [tireTax, setTireTax] = useState("");
  const [delivery, setDelivery] = useState("");
  const [firstPayment, setFirstPayment] = useState(false);
  const [lockedBcPst, setLockedBcPst] = useState<number | null>(null);
  const [commission, setCommission] = useState({ show: false, pct: 0 });
  const [emailQuote, setEmailQuote] = useState(true);
  const [exploding, setExploding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = readDealerToken();
    if (!token) return;
    void deskBoard({ data: { token, slug } })
      .then((b) => {
        setDealerName(displayDealerName(b.dealerName || slug));
        setLive(b.live);
        if (b.commission) setCommission(b.commission);
        if (b.province) setProvince(normalizeProvince(b.province));
      })
      .catch(() => undefined);
  }, [slug]);

  const saleDollars = Math.max(0, (Number(price) || 0) + (Number(extra) || 0));
  const priceCents = Math.round(saleDollars * 100);
  const kmCap = maxKmForPrice(priceCents);
  const residualCap = Math.round(deskResidualCap(term) * 100);
  const trv = saleDollars + Math.max(0, Number(pad) || 0);
  useEffect(() => {
    if (normalizeProvince(province) !== "BC") {
      setLockedBcPst(null);
      return;
    }
    if (lockedBcPst != null || trv <= 0) return;
    setLockedBcPst(bcPstRate(trv));
  }, [province, trv, lockedBcPst]);
  const quote = useMemo(() => {
    const rate = Math.max(DESK_MIN_APR, (Number(aprPct) || DESK_DEFAULT_APR) / 100);
    const downRate = Math.min(0.7, Math.max(DESK_MIN_DOWN_PCT / 100, (Number(downPct) || DESK_MIN_DOWN_PCT) / 100));
    const residual =
      saleDollars > 0 && residualPct <= 0
        ? 1
        : Math.round(saleDollars * (Math.min(residualCap, Math.max(0, residualPct)) / 100) * 100) / 100;
    return quoteCrm({
      cost: Number(price) || 0,
      extra: Number(extra) || 0,
      pad: Number(pad) || 0,
      cashDown: saleDollars * downRate,
      residual,
      annualRate: rate,
      term,
      handling: Number(handling) || 0,
      tradeAllowance: tradeKind === "none" ? 0 : Number(tradeAllowance) || 0,
      tradeKind,
      lien: Number(lien) || 0,
      lessee: lesseeKind,
      province,
      lockedBcPst,
      securityDeposit: Number(securityDeposit) || 0,
      admin: Number(adminFee) || 0,
      antiTheft: Number(antiTheft) || 0,
      ppsa: Number(ppsa) || 0,
      licence: Number(licenceFee) || 0,
      tireTax: Number(tireTax) || 0,
      delivery: delivery || null,
      firstPaymentOnInvoice: firstPayment,
    });
  }, [
    price,
    extra,
    pad,
    saleDollars,
    downPct,
    residualPct,
    residualCap,
    aprPct,
    term,
    handling,
    tradeKind,
    tradeAllowance,
    lien,
    lesseeKind,
    province,
    lockedBcPst,
    securityDeposit,
    adminFee,
    antiTheft,
    ppsa,
    licenceFee,
    tireTax,
    delivery,
    firstPayment,
  ]);
  const finderFee = commission.show && commission.pct > 0 ? Math.round(quote.financed * (commission.pct / 100) * 100) / 100 : 0;

  async function onExplode() {
    const token = readDealerToken();
    if (!token) return;
    const clean = vin.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    setExploding(true);
    try {
      const res = await deskExplodeVin({ data: { token, slug, vin: clean } });
      if (!res.ok) {
        toast.message("Could not decode VIN");
        return;
      }
      setYear(res.year ? String(res.year) : "");
      setMake(res.make || "");
      setModel(res.model || "");
      setTrim(res.trim || "");
      toast.success(res.note ? "VIN decoded with a correction" : "VIN decoded", {
        description: res.note,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "VIN explode failed");
    } finally {
      setExploding(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = readDealerToken();
    if (!token) return;
    const cleanVin = vin.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cleanVin.length !== 17) {
      toast.error("VIN is required (17 characters)");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    if (!(Number(price) > 0)) {
      toast.error("Price is required");
      return;
    }
    if (!province) {
      toast.error("Choose the province so tax is on the quote");
      return;
    }
    setSaving(true);
    try {
      const res = await deskStartDeal({
        data: {
          token,
          slug,
          name: `${firstName.trim()} ${lastName.trim()}`,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email,
          vin: cleanVin,
          year: year ? Number(year) : null,
          make: make || undefined,
          model: model || undefined,
          trim: trim || undefined,
          odometerKm: 0,
          price: quote.salePrice,
          down: quote.cashDown,
          residual: quote.residual,
          term,
          monthly: quote.monthlyBeforeTax,
          rate: Math.max(DESK_MIN_APR_PCT, Number(aprPct) || DESK_DEFAULT_APR_PCT),
          kmPerYear: Math.min(kmCap, Math.max(1000, kmYear)),
          province,
          monthlyWithTax: quote.totalMonthly,
          taxLabel: quote.taxLabel,
          dueOnDelivery: quote.dueOnDelivery,
          pad: Number(pad) || 0,
          financed: quote.financed,
          emailQuote,
        },
      });
      if (!res.ok || !res.id) {
        toast.error(res.error || "Could not save quote");
        return;
      }
      toast.success("Saved to quotes", {
        description: emailQuote
          ? "mailed" in res && res.mailed
            ? `Quote emailed to ${email}`
            : ("mailError" in res && res.mailError) || "Saved. Email did not send."
          : "Open it any time from Quotes",
      });
      void nav({ to: "/desk/$slug/deals/$id", params: { slug, id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save quote");
    } finally {
      setSaving(false);
    }
  }

  const decoded = [year, make, model, trim].filter(Boolean).join(" ");

  return (
    <DeskFrame slug={slug} dealerName={dealerName} live={live}>
      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[1fr_440px] lg:items-start">
        <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <h2 className="text-sm font-medium">Quick quote</h2>
          <p className="mt-1 text-xs text-fg-muted">
            VIN, name, and email. Saving creates a quoted file. Credit happens later, from that quote.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="vin">VIN</Label>
              <Input
                id="vin"
                value={vin}
                onChange={(e) => setVin(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 17))}
                onBlur={() => {
                  if (vin.length === 17) void onExplode();
                }}
                className="mt-1 font-mono"
                maxLength={17}
                required
                placeholder="17 characters"
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void onExplode()} disabled={exploding || vin.length !== 17}>
              {exploding ? <Loader2 className="animate-spin" /> : null}
              Decode
            </Button>
          </div>
          {decoded ? <p className="mt-2 text-sm text-fg">{decoded}</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="First name" value={firstName} onChange={setFirstName} required />
            <Field label="Last name" value={lastName} onChange={setLastName} required />
            <Field label="Email" value={email} onChange={setEmail} type="email" required />
          </div>
        </section>

        <aside className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-6">
          <p className="text-[10px] tracking-[0.16em] text-fg-subtle uppercase">Lease quote</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-price">
            {saleDollars > 0 ? cad(quote.monthlyBeforeTax) : "—"}
            <span className="ml-1 text-sm font-normal text-fg-muted">/mo before tax</span>
          </p>
          <div className="mt-4 space-y-3">
            <Field label="Selling price before tax" value={price} onChange={setPrice} inputMode="decimal" required />
            <Field label="Extra" value={extra} onChange={setExtra} inputMode="decimal" />
            <Field label="Pad" value={pad} onChange={setPad} inputMode="decimal" />
            <p className="text-[11px] text-fg-subtle">
              Sticker is selling price + extra, before tax. Pad is not on the sticker. It is financed and it is taxed.
            </p>
            <Stepper
              label={`Down % (min ${DESK_MIN_DOWN_PCT}%)`}
              value={downPct}
              min={DESK_MIN_DOWN_PCT}
              max={70}
              step={0.5}
              onChange={setDownPct}
            />
            <p className="text-[11px] text-fg-subtle">Cash down {cad(quote.cashDown)}. Taxed in full at delivery. It is not a loan payment.</p>
            <Stepper
              label={`Interest % (min ${DESK_MIN_APR_PCT}%, default ${DESK_DEFAULT_APR_PCT}%)`}
              value={aprPct}
              min={DESK_MIN_APR_PCT}
              step={0.1}
              digits={2}
              onChange={setAprPct}
            />
            <div>
              <p className="mb-1 text-sm text-fg-muted">Term</p>
              <div className="flex flex-wrap gap-1">
                {DESK_TERM_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const nextCap = Math.round(deskResidualCap(t) * 100);
                      setResidualPct((p) => (p === residualCap ? nextCap : Math.min(nextCap, p)));
                      setTerm(t);
                    }}
                    className={`h-11 min-w-11 rounded-full px-3 text-sm ${term === t ? "bg-fg text-primary-fg" : "border border-border text-fg-muted"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <Label htmlFor="residual">Residual (max {residualCap}%)</Label>
                <span className="text-sm tabular-nums text-fg">
                  {residualPct}% · {cad(quote.residual)}
                </span>
              </div>
              <input
                id="residual"
                type="range"
                min={0}
                max={residualCap}
                step={1}
                value={Math.min(residualCap, residualPct)}
                onChange={(e) => setResidualPct(Number(e.target.value))}
                className="h-11 w-full accent-[var(--color-fg)]"
              />
              <p className="text-[11px] text-fg-subtle">Of the sticker, not the pad. At 0% the residual is $1.</p>
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <Label htmlFor="kmy">Allowance km/year</Label>
                <span className="text-sm tabular-nums text-fg">{Math.min(kmCap, kmYear).toLocaleString("en-CA")}</span>
              </div>
              <input
                id="kmy"
                type="range"
                min={1000}
                max={kmCap}
                step={1000}
                value={Math.min(kmCap, Math.max(1000, kmYear))}
                onChange={(e) => setKmYear(Number(e.target.value))}
                className="h-11 w-full"
              />
              <p className="text-[11px] text-fg-subtle">Stated allowance only. It does not change the payment.</p>
            </div>
            <div className="flex gap-1 rounded-full border border-border p-1">
              {(["individual", "business"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setLesseeKind(kind)}
                  className={`h-9 flex-1 rounded-full text-sm ${lesseeKind === kind ? "bg-fg text-primary-fg" : "text-fg-muted"}`}
                >
                  {kind === "individual" ? "Individual" : "Business"}
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="province">Lessee tax province</Label>
              <select
                id="province"
                required
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="mt-1 flex h-11 w-full rounded-full border border-border bg-surface px-4 text-sm"
              >
                <option value="">Choose province</option>
                {LEASE_PROVINCES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-fg-subtle">Tax follows the lessee, not the rooftop.</p>
            </div>
            <div>
              <Label htmlFor="trade">Trade</Label>
              <select
                id="trade"
                value={tradeKind}
                onChange={(e) => setTradeKind(e.target.value as TradeKind)}
                className="mt-1 flex h-11 w-full rounded-full border border-border bg-surface px-4 text-sm"
              >
                <option value="none">No trade</option>
                <option value="clear">Clear — customer owns it</option>
                <option value="financed">Financed — payout includes tax</option>
                <option value="leased">Leased — buyout is before tax</option>
              </select>
            </div>
            {tradeKind !== "none" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Allowance" value={tradeAllowance} onChange={setTradeAllowance} inputMode="decimal" />
                <Field
                  label="Lien"
                  value={tradeKind === "clear" ? "0" : lien}
                  onChange={setLien}
                  inputMode="decimal"
                />
              </div>
            ) : null}
            <Field label="Handling" value={handling} onChange={setHandling} inputMode="decimal" />
            <details className="rounded-2xl border border-border px-3 py-2">
              <summary className="cursor-pointer text-sm text-fg-muted">Due on delivery</summary>
              <div className="mt-3 space-y-3">
                <Field label="Security deposit" value={securityDeposit} onChange={setSecurityDeposit} inputMode="decimal" />
                <Field label="Admin" value={adminFee} onChange={setAdminFee} inputMode="decimal" />
                <Field label="Anti-theft" value={antiTheft} onChange={setAntiTheft} inputMode="decimal" />
                <Field label="PPSA" value={ppsa} onChange={setPpsa} inputMode="decimal" />
                <Field label="Licence" value={licenceFee} onChange={setLicenceFee} inputMode="decimal" />
                <Field label="Tire tax" value={tireTax} onChange={setTireTax} inputMode="decimal" />
                <div>
                  <Label htmlFor="delivery">Delivery date</Label>
                  <Input id="delivery" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="mt-1" />
                </div>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input type="checkbox" checked={firstPayment} onChange={(e) => setFirstPayment(e.target.checked)} className="size-4" />
                  First payment on the invoice
                </label>
              </div>
            </details>
            <dl className="space-y-1 border-t border-border pt-3 text-xs text-fg-muted">
              <div className="flex justify-between">
                <dt>Sticker before tax</dt>
                <dd>{cad(quote.salePrice)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Amount financed</dt>
                <dd>{cad(quote.financed)}</dd>
              </div>
              {tradeKind !== "none" ? (
                <div className="flex justify-between">
                  <dt>Net equity</dt>
                  <dd>{cad(quote.netEquity)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Residual</dt>
                <dd>{cad(quote.residual)}</dd>
              </div>
              <div className="flex justify-between text-fg">
                <dt>Monthly before tax</dt>
                <dd>{saleDollars > 0 ? cad(quote.monthlyBeforeTax) : "—"}</dd>
              </div>
              {quote.monthlyTaxLines.map((line) => (
                <div key={line.name} className="flex justify-between">
                  <dt>
                    {line.name}
                    {quote.taxCredit ? " (credit base)" : ""}
                  </dt>
                  <dd>{cad(line.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between text-fg">
                <dt>Monthly with tax</dt>
                <dd>{saleDollars > 0 ? cad(quote.totalMonthly) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Due on delivery</dt>
                <dd>{cad(quote.dueOnDelivery)}</dd>
              </div>
              {quote.bcPst != null ? (
                <div className="flex justify-between">
                  <dt>BC PST locked</dt>
                  <dd>{(quote.bcPst * 100).toFixed(0)}%</dd>
                </div>
              ) : null}
              {commission.show ? (
                <div className="flex justify-between text-fg">
                  <dt>Your commission ({commission.pct}%)</dt>
                  <dd>{cad(finderFee)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={emailQuote} onChange={(e) => setEmailQuote(e.target.checked)} className="size-4" />
            Email this quote to the lessee
          </label>
          <Button type="submit" className="mt-4 w-full" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save quote
          </Button>
        </aside>
      </form>
    </DeskFrame>
  );
}

function cad(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type === "number" ? "text" : type}
        required={required}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step,
  digits = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  digits?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(value.toFixed(digits));
  useEffect(() => {
    setText(digits ? value.toFixed(digits) : String(Math.round(value)));
  }, [value, digits]);
  function commit(raw: number) {
    let n = Number.isFinite(raw) ? raw : min;
    n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    const factor = 10 ** digits;
    n = Math.round(n * factor) / factor;
    onChange(n);
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          className="h-11 w-11 shrink-0 rounded-full border border-border text-lg"
          onClick={() => commit(value - step)}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(Number(String(text).replace(/[^\d.]/g, "")))}
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface px-3 text-center text-base tabular-nums outline-none focus:border-accent"
        />
        <button
          type="button"
          className="h-11 w-11 shrink-0 rounded-full border border-border text-lg"
          onClick={() => commit(value + step)}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
