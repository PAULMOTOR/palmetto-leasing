import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DeskFrame, readDealerToken, readDealerUser } from "@/components/desk/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deskBoard, deskExplodeVin, deskInventory, deskStartDeal } from "@/lib/desk/actions";
import {
  BASE_KM_PER_YEAR,
  calculateLease,
  DESK_MIN_APR,
  DESK_MIN_APR_PCT,
  DESK_MIN_DOWN_PCT,
  DESK_MIN_DOWN_RATE,
  LEASE_TERM_OPTIONS,
} from "@/lib/leasing/calc";
import { formatCadExact } from "@/lib/utils";

export const Route = createFileRoute("/desk/$slug/new")({
  component: NewDealPage,
  head: () => ({
    meta: [{ title: "New deal | Palmetto" }],
  }),
});

type StockCar = {
  id: string;
  title: string;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number;
};

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
  const [km, setKm] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");
  const [term, setTerm] = useState(37);
  const [kmYear, setKmYear] = useState(BASE_KM_PER_YEAR);
  const [downPct, setDownPct] = useState(20);
  const [aprPct, setAprPct] = useState(DESK_MIN_APR_PCT);
  const [stock, setStock] = useState<StockCar[]>([]);
  const [commission, setCommission] = useState({ show: false, pct: 0 });
  const [creditMode, setCreditMode] = useState<"email" | "fill">("email");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal, setPostal] = useState("");
  const [employer, setEmployer] = useState("");
  const [occupation, setOccupation] = useState("");
  const [income, setIncome] = useState("");
  const [consent, setConsent] = useState(false);
  const [exploding, setExploding] = useState(false);
  const [saving, setSaving] = useState(false);
  const user = typeof window === "undefined" ? null : readDealerUser();

  useEffect(() => {
    const token = readDealerToken();
    if (!token) return;
    void deskBoard({ data: { token, slug } })
      .then((b) => {
        setDealerName(b.dealerName || slug);
        setLive(b.live);
        if (b.commission) setCommission(b.commission);
      })
      .catch(() => undefined);
    void deskInventory({ data: { token, slug } })
      .then((r) => setStock(r.vehicles))
      .catch(() => setStock([]));
  }, [slug]);

  const priceCents = Math.round((Number(price) || 0) * 100);
  const quote = useMemo(() => {
    const downRate = Math.min(0.7, Math.max(DESK_MIN_DOWN_RATE, (Number(downPct) || DESK_MIN_DOWN_PCT) / 100));
    const rate = Math.max(DESK_MIN_APR, (Number(aprPct) || DESK_MIN_APR_PCT) / 100);
    return calculateLease(priceCents, {
      termMonths: term,
      kmPerYear: kmYear,
      downPaymentRate: downRate,
      minDownRate: DESK_MIN_DOWN_RATE,
      baseInterestRate: rate,
    });
  }, [priceCents, term, kmYear, downPct, aprPct]);
  const finderFeeCents =
    commission.show && commission.pct > 0 ? Math.round(quote.capCostCents * (commission.pct / 100)) : 0;

  function applyStock(id: string) {
    const v = stock.find((c) => c.id === id);
    if (!v) return;
    setVin(v.vin);
    setYear(v.year ? String(v.year) : "");
    setMake(v.make);
    setModel(v.model);
    setTrim(v.trim);
    if (v.price) setPrice(String(v.price));
    if (v.mileage) setKm(String(v.mileage));
  }

  async function onExplode() {
    const token = readDealerToken();
    if (!token) return;
    setExploding(true);
    try {
      const res = await deskExplodeVin({ data: { token, slug, vin } });
      if (!res.ok) {
        toast.message("Could not explode VIN", { description: "Type year, make and model." });
        return;
      }
      if (res.year) setYear(String(res.year));
      if (res.make) setMake(res.make);
      if (res.model) setModel(res.model);
      if (res.trim) setTrim(res.trim);
      toast.success("VIN decoded");
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
    const odometerKm = Number(km.replace(/[^\d.]/g, ""));
    if (!odometerKm) {
      toast.error("Kilometres are required");
      return;
    }
    if (creditMode === "fill" && !consent) {
      toast.error("Credit consent is required when filling the app");
      return;
    }
    setSaving(true);
    try {
      const application =
        creditMode === "fill"
          ? {
              address,
              city,
              province,
              postalCode: postal,
              employer,
              occupation,
              annualIncome: income,
              consentCredit: true,
            }
          : undefined;
      const res = await deskStartDeal({
        data: {
          token,
          slug,
          name,
          email,
          phone: phone || undefined,
          vin: cleanVin,
          year: year ? Number(year) : null,
          make: make || undefined,
          model: model || undefined,
          trim: trim || undefined,
          odometerKm,
          price: Number(price) || 0,
          down: Math.round(quote.downPaymentCents / 100),
          residual: Math.round(quote.residualCents / 100),
          term: quote.termMonths,
          monthly: Math.round(quote.monthlyPaymentCents) / 100,
          rate: quote.baseInterestRate * 100,
          kmPerYear: quote.kmPerYear,
          sendCreditLink: creditMode === "email",
          application,
        },
      });
      if (!res.ok || !res.id) {
        toast.error(res.error || "Could not submit to credit");
        return;
      }
      toast.success("Submitted to credit", {
        description:
          creditMode === "email"
            ? "creditUrl" in res && res.mailed
              ? `Credit app emailed to ${email}`
              : ("creditUrl" in res && res.creditUrl) || "File is on the CRM"
            : "Credit has the application and quote",
      });
      void nav({ to: "/desk/$slug/deals/$id", params: { slug, id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start deal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DeskFrame slug={slug} dealerName={dealerName} live={live}>
      {!user ? (
        <p className="mb-4 rounded-[var(--radius-xl)] border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          Sign in with your work email so this file is assigned to you. Credit will call that
          number — not a Palmetto sales rep.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-4">
          <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <h2 className="text-sm font-medium">Vehicle</h2>
            {stock.length > 0 ? (
              <div className="mt-4">
                <Label htmlFor="stock">From your Palmetto inventory</Label>
                <select
                  id="stock"
                  className="mt-1 flex h-11 w-full rounded-full border border-border bg-surface px-4 text-sm"
                  defaultValue=""
                  onChange={(e) => applyStock(e.target.value)}
                >
                  <option value="">Choose a listing…</option>
                  {stock.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                      {v.vin ? ` · ${v.vin}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="vin">VIN</Label>
                <Input
                  id="vin"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  onBlur={() => {
                    if (vin.replace(/[^A-Za-z0-9]/g, "").length === 17) void onExplode();
                  }}
                  className="mt-1 font-mono"
                  maxLength={17}
                  required
                  placeholder="17 characters"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onExplode()}
                disabled={exploding || vin.length !== 17}
              >
                {exploding ? <Loader2 className="animate-spin" /> : null}
                Decode
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <Field label="Year" value={year} onChange={setYear} inputMode="numeric" />
              <Field label="Make" value={make} onChange={setMake} />
              <Field label="Model" value={model} onChange={setModel} />
              <Field label="Trim" value={trim} onChange={setTrim} />
            </div>
            <div className="mt-3 max-w-xs">
              <Field label="Kilometres" value={km} onChange={setKm} inputMode="numeric" required />
            </div>
          </section>

          <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <h2 className="text-sm font-medium">Lessee</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Client name" value={name} onChange={setName} required />
              <Field label="Email" value={email} onChange={setEmail} type="email" required />
              <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
            </div>

            <div className="mt-5 flex gap-1 rounded-full border border-border p-1">
              <button
                type="button"
                onClick={() => setCreditMode("email")}
                className={`h-9 flex-1 rounded-full text-sm font-medium ${creditMode === "email" ? "bg-fg text-primary-fg" : "text-fg-muted"}`}
              >
                Email credit app
              </button>
              <button
                type="button"
                onClick={() => setCreditMode("fill")}
                className={`h-9 flex-1 rounded-full text-sm font-medium ${creditMode === "fill" ? "bg-fg text-primary-fg" : "text-fg-muted"}`}
              >
                Lessee fills out here
              </button>
            </div>

            {creditMode === "email" ? (
              <p className="mt-3 text-xs text-fg-muted">
                On submit we email the lessee a credit-app link and send the quote to credit,
                assigned to {user?.name || "you"}.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <Field label="Address" value={address} onChange={setAddress} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="City" value={city} onChange={setCity} />
                  <Field label="Province" value={province} onChange={setProvince} />
                  <Field label="Postal" value={postal} onChange={setPostal} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Employer" value={employer} onChange={setEmployer} />
                  <Field label="Occupation" value={occupation} onChange={setOccupation} />
                  <Field label="Annual income" value={income} onChange={setIncome} inputMode="decimal" />
                </div>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="size-4"
                  />
                  Lessee consents to a credit check
                </label>
              </div>
            )}
          </section>
        </div>

        <aside className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-6">
          <p className="text-[10px] tracking-[0.16em] text-fg-subtle uppercase">Lease quote</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-price">
            {priceCents > 0 ? formatCadExact(quote.monthlyPaymentCents) : "—"}
            <span className="ml-1 text-sm font-normal text-fg-muted">/mo</span>
          </p>
          <div className="mt-4 space-y-3">
            <Field label="Price" value={price} onChange={setPrice} inputMode="decimal" required />
            <div>
              <Label htmlFor="down">Down % (min {DESK_MIN_DOWN_PCT}%)</Label>
              <Input
                id="down"
                type="number"
                min={DESK_MIN_DOWN_PCT}
                max={70}
                step={0.5}
                value={String(downPct)}
                onChange={(e) => setDownPct(Math.max(DESK_MIN_DOWN_PCT, Number(e.target.value) || DESK_MIN_DOWN_PCT))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="apr">Interest % (min {DESK_MIN_APR_PCT}%)</Label>
              <Input
                id="apr"
                type="number"
                min={DESK_MIN_APR_PCT}
                step={0.01}
                value={String(aprPct)}
                onChange={(e) => setAprPct(Math.max(DESK_MIN_APR_PCT, Number(e.target.value) || DESK_MIN_APR_PCT))}
                className="mt-1"
              />
            </div>
            <div>
              <p className="mb-1 text-sm text-fg-muted">Term</p>
              <div className="flex flex-wrap gap-1">
                {LEASE_TERM_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTerm(t)}
                    className={`h-9 rounded-full px-3 text-sm ${term === t ? "bg-fg text-primary-fg" : "border border-border text-fg-muted"}`}
                  >
                    {t} mo
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="kmy">Km / year</Label>
              <Input
                id="kmy"
                type="number"
                min={BASE_KM_PER_YEAR}
                step={1000}
                value={kmYear}
                onChange={(e) => setKmYear(Number(e.target.value) || BASE_KM_PER_YEAR)}
                className="mt-1"
              />
            </div>
            <dl className="space-y-1 border-t border-border pt-3 text-xs text-fg-muted">
              <div className="flex justify-between">
                <dt>Down</dt>
                <dd>{formatCadExact(quote.downPaymentCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Residual</dt>
                <dd>{formatCadExact(quote.residualCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Financed</dt>
                <dd>{formatCadExact(quote.capCostCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Rate</dt>
                <dd>{(quote.baseInterestRate * 100).toFixed(2)}%</dd>
              </div>
              {commission.show ? (
                <div className="flex justify-between text-fg">
                  <dt>Your commission ({commission.pct}%)</dt>
                  <dd>{formatCadExact(finderFeeCents)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <Button type="submit" className="mt-5 w-full" disabled={saving || !user}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Submit to credit
          </Button>
        </aside>
      </form>
    </DeskFrame>
  );
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
        type={type}
        required={required}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  );
}