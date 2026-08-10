import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { VehicleCard as VehicleCardType } from "@/lib/leasing/types";
import {
  calculateLease,
  type LeaseQuote,
  type QuoteSettings,
  DEFAULT_QUOTE_SETTINGS,
} from "@/lib/leasing/calc";
import { submitLeaseQuote } from "@/lib/leasing/queries";
import { formatCad, formatCadExact, formatNumber, cn } from "@/lib/utils";

export function VehicleCard({
  vehicle,
  index = 0,
  expanded,
  onToggleLease,
  quoteSettings,
}: {
  vehicle: VehicleCardType;
  index?: number;
  expanded: boolean;
  onToggleLease: () => void;
  quoteSettings?: QuoteSettings;
}) {
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const shortTitle = [vehicle.year, vehicle.make, vehicle.model].join(" ");
  const delay = Math.min(index, 12) * 35;
  const settings = quoteSettings ?? DEFAULT_QUOTE_SETTINGS;
  const quote = useMemo(
    () => calculateLease(vehicle.price_cents, settings),
    [vehicle.price_cents, settings],
  );

  const [learnOpen, setLearnOpen] = useState(false);
  const dealerLabel = (vehicle.dealer_name || "Partner dealer").toUpperCase();

  return (
    <article
      className={cn(
        "stagger-item group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border/80 bg-surface shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)]",
        expanded
          ? "border-accent/40 shadow-[var(--shadow-card-hover)] sm:col-span-2"
          : "hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn("grid", expanded ? "lg:grid-cols-2" : "grid-cols-1")}>
        <div className="flex flex-col">
          {/* Pure top-down studio thumbnail — straight down like reference */}
          <div className="relative aspect-[4/5] overflow-hidden bg-white sm:aspect-[3/4]">
            <img
              src={vehicle.thumbnail_url || vehicle.photos[0] || "/vehicles/top-porsche-911.jpg"}
              alt={title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain object-center p-3 transition-transform duration-[var(--motion-slow)] ease-[var(--ease-smooth-out)] group-hover:scale-[1.02] sm:p-5"
            />
          </div>

          <div className="flex flex-1 flex-col items-center px-4 pt-2 pb-5 text-center sm:px-5 sm:pb-6">
            <p className="mb-3 max-w-[92%] text-[9px] font-medium tracking-[0.22em] text-fg-subtle uppercase sm:text-[10px] sm:tracking-[0.28em]">
              {dealerLabel}
            </p>

            <h3 className="text-[13px] font-normal tracking-wide text-fg-muted sm:text-sm">
              {shortTitle}
              {vehicle.trim ? ` ${vehicle.trim}` : ""}
            </h3>

            <p className="mt-1.5 text-[13px] font-medium tabular-nums tracking-wide text-price sm:text-sm">
              {formatCad(vehicle.price_cents)}
              <span className="mx-1.5 text-fg-subtle">-</span>
              <span className="tabular-nums">{formatNumber(vehicle.mileage)} KM</span>
            </p>

            <div className="mt-4 flex w-full items-center justify-center gap-4">
              <button
                type="button"
                onClick={onToggleLease}
                className={cn(
                  "inline-flex h-9 min-w-[5.5rem] items-center justify-center rounded-full border px-5 text-[13px] font-medium transition-[background-color,color,transform,border-color] duration-[var(--motion-quick)] active:scale-[0.96]",
                  expanded
                    ? "border-fg bg-fg text-primary-fg"
                    : "border-accent text-accent hover:bg-accent hover:text-accent-fg",
                )}
              >
                {expanded ? "Close" : "Lease"}
              </button>
              <button
                type="button"
                onClick={() => setLearnOpen(true)}
                className="inline-flex items-center gap-0.5 text-[13px] font-medium text-fg-muted transition-colors duration-[var(--motion-quick)] hover:text-fg"
              >
                Learn More
                <ChevronRight className="size-3.5 opacity-60" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border bg-surface-2/40 lg:border-t-0 lg:border-l">
            <InCardQuote vehicle={vehicle} quote={quote} onClose={onToggleLease} />
          </div>
        )}
      </div>

      {learnOpen && (
        <LearnMoreDialog
          dealerName={vehicle.dealer_name || "the dealer"}
          listingUrl={vehicle.dealer_listing_url}
          onClose={() => setLearnOpen(false)}
        />
      )}
    </article>
  );
}

function InCardQuote({
  vehicle,
  quote,
  onClose,
}: {
  vehicle: VehicleCardType;
  quote: LeaseQuote;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"quote" | "apply" | "done">("quote");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("QC");
  const [postalCode, setPostalCode] = useState("");
  const [employer, setEmployer] = useState("");
  const [occupation, setOccupation] = useState("");
  const [annualIncome, setAnnualIncome] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leadId, setLeadId] = useState<string | number | null>(null);

  async function onApply(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      toast.error("Credit consent required");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitLeaseQuote({
        data: {
          vehicleId: vehicle.id,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          source: "apply_now",
          notes: `In-card apply · ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          application: {
            address,
            city,
            province,
            postalCode,
            employer,
            occupation,
            annualIncome,
            consentCredit: consent,
          },
        },
      });
      setLeadId(result.leadId);
      setStep("done");
      toast.success("Application submitted", {
        description: `CRM lead #${result.leadId}`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  const aprPct = (quote.baseInterestRate * 100).toFixed(2);

  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.16em] text-fg-subtle uppercase">Est. monthly</p>
          <p className="font-display text-3xl font-semibold tabular-nums tracking-tight text-price">
            {formatCadExact(quote.monthlyPaymentCents)}
            <span className="ml-1 text-sm font-normal text-fg-muted">/mo</span>
          </p>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            {quote.termMonths} mo · {(quote.downRate * 100).toFixed(0)}% down ·{" "}
            {(quote.residualRate * 100).toFixed(0)}% residual · {aprPct}% APR
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
          aria-label="Close quote"
        >
          <X className="size-4" />
        </button>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <div className="col-span-2 flex justify-between gap-2 border-b border-border/70 pb-1.5">
          <dt className="text-fg-muted">Price</dt>
          <dd className="tabular-nums text-fg">{formatCad(quote.priceCents)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">Down</dt>
          <dd className="tabular-nums text-fg">{formatCad(quote.downPaymentCents)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">Residual</dt>
          <dd className="tabular-nums text-fg">{formatCad(quote.residualCents)}</dd>
        </div>
      </dl>

      {step === "done" && leadId != null ? (
        <div className="mt-auto flex items-start gap-2 rounded-[var(--radius-lg)] bg-surface p-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="font-medium">Application #{leadId}</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Track status anytime via Login → Client.
            </p>
          </div>
        </div>
      ) : step === "quote" ? (
        <div className="mt-auto space-y-2">
          <button
            type="button"
            onClick={() => setStep("apply")}
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-fg text-sm font-medium text-primary-fg transition-[transform,opacity] duration-[var(--motion-quick)] hover:opacity-90 active:scale-[0.98]"
          >
            Apply now
          </button>
          <p className="text-center text-[10px] text-fg-subtle">
            Built-in lease application · feeds CRM
          </p>
        </div>
      ) : (
        <form onSubmit={onApply} className="mt-auto space-y-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Full name" value={name} onChange={setName} required />
            <Field label="Email" value={email} onChange={setEmail} type="email" required />
            <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
            <Field
              label="Annual income"
              value={annualIncome}
              onChange={setAnnualIncome}
              placeholder="$"
            />
            <Field label="Address" value={address} onChange={setAddress} className="sm:col-span-2" />
            <Field label="City" value={city} onChange={setCity} />
            <Field label="Province" value={province} onChange={setProvince} />
            <Field label="Postal" value={postalCode} onChange={setPostalCode} />
            <Field label="Employer" value={employer} onChange={setEmployer} />
            <Field
              label="Occupation"
              value={occupation}
              onChange={setOccupation}
              className="sm:col-span-2"
            />
          </div>
          <label className="flex items-start gap-2 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-3.5 rounded border-border"
              required
            />
            I consent to a credit check for this lease application.
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("quote")}
              className="h-10 flex-1 rounded-full border border-border text-sm text-fg-muted transition-colors hover:bg-surface"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 flex-[2] items-center justify-center gap-2 rounded-full bg-accent text-sm font-medium text-accent-fg transition-[transform,opacity] duration-[var(--motion-quick)] hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Submit application
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("block text-left", className)}>
      <span className="mb-0.5 block text-[10px] tracking-wide text-fg-subtle uppercase">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="h-9 w-full rounded-full border border-border bg-surface px-3 text-sm text-fg outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}

function LearnMoreDialog({
  dealerName,
  listingUrl,
  onClose,
}: {
  dealerName: string;
  listingUrl: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="learn-more-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-xl)] border border-border bg-surface p-6 shadow-[var(--shadow-card-hover)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="learn-more-title" className="text-base font-medium tracking-tight text-fg">
          Leaving Palmetto
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          You are about to open the dealer listing on{" "}
          <span className="font-medium text-fg">{dealerName}</span>. Lease quotes and applications stay
          on this site.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full bg-fg text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
          >
            Continue to dealer site
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-full text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Stay here
          </button>
        </div>
      </div>
    </div>
  );
}
