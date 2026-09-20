import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DeskFrame, readDealerToken, readDealerUser } from "@/components/desk/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deskBoard, deskExplodeVin, deskStartDeal } from "@/lib/desk/actions";
import {
  BASE_KM_PER_YEAR,
  calculateLease,
  DEFAULT_BASE_INTEREST_RATE,
  LEASE_TERM_OPTIONS,
  defaultDownRateForPrice,
} from "@/lib/leasing/calc";
import { formatCadExact } from "@/lib/utils";

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
  const [km, setKm] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");
  const [term, setTerm] = useState(37);
  const [kmYear, setKmYear] = useState(BASE_KM_PER_YEAR);
  const [downPct, setDownPct] = useState(20);
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
      })
      .catch(() => undefined);
  }, [slug]);

  const priceCents = Math.round((Number(price) || 0) * 100);
  const quote = useMemo(() => {
    const downRate = Math.min(0.7, Math.max(0.1, (Number(downPct) || 20) / 100));
    return calculateLease(priceCents, {
      termMonths: term,
      kmPerYear: kmYear,
      downPaymentRate: downRate || defaultDownRateForPrice(priceCents),
      baseInterestRate: DEFAULT_BASE_INTEREST_RATE,
    });
  }, [priceCents, term, kmYear, downPct]);

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
                Fill out for them
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
              <Label htmlFor="down">Down %</Label>
              <Input
                id="down"
                value={String(downPct)}
                onChange={(e) => setDownPct(Number(e.target.value) || 0)}
                inputMode="decimal"
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
                <dt>Rate</dt>
                <dd>{(quote.baseInterestRate * 100).toFixed(2)}%</dd>
              </div>
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