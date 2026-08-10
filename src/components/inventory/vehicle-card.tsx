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
import { getVehicleGallery, submitLeaseQuote } from "@/lib/leasing/queries";
import {
  buildVehicleGalleryPool,
  selectGalleryPhotos,
} from "@/lib/leasing/gallery";
import { formatCad, formatCadExact, formatNumber, cn } from "@/lib/utils";

const TERM_OPTIONS = [24, 36, 48, 60] as const;
const DOWN_OPTIONS = [
  { rate: 0.1, label: "10%" },
  { rate: 0.15, label: "15%" },
  { rate: 0.2, label: "20%" },
  { rate: 0.25, label: "25%" },
  { rate: 0.3, label: "30%" },
] as const;

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

  const [learnOpen, setLearnOpen] = useState(false);
  const dealerLabel = (vehicle.dealer_name || "Partner dealer").toUpperCase();

  return (
    <article
      className={cn(
        "stagger-item group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border/80 bg-surface shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)]",
        expanded
          ? "border-accent/40 shadow-[var(--shadow-card-hover)] sm:col-span-2 lg:col-span-2"
          : "hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn("grid", expanded ? "lg:grid-cols-2" : "grid-cols-1")}>
        <div className="flex flex-col">
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
            <InCardQuote vehicle={vehicle} baseSettings={settings} onClose={onToggleLease} />
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
  baseSettings,
  onClose,
}: {
  vehicle: VehicleCardType;
  baseSettings: QuoteSettings;
  onClose: () => void;
}) {
  const [termMonths, setTermMonths] = useState(baseSettings.termMonths || 36);
  const [downRate, setDownRate] = useState(baseSettings.downPaymentRate || 0.2);
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
  const [gallery, setGallery] = useState<string[]>(() =>
    selectGalleryPhotos(
      buildVehicleGalleryPool({
        thumbnail_url: vehicle.thumbnail_url,
        photos: vehicle.photos,
        make: vehicle.make,
        model: vehicle.model,
      }),
      { limit: 12 },
    ),
  );
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const quote = useMemo(
    () =>
      calculateLease(vehicle.price_cents, {
        ...baseSettings,
        termMonths,
        downPaymentRate: downRate,
      }),
    [vehicle.price_cents, baseSettings, termMonths, downRate],
  );

  useEffect(() => {
    let cancelled = false;
    setGalleryLoading(true);
    getVehicleGallery({
      data: {
        vehicleId: vehicle.id,
        listingUrl: vehicle.dealer_listing_url,
        make: vehicle.make,
        model: vehicle.model,
        existingPhotos: vehicle.photos,
        thumbnail: vehicle.thumbnail_url,
      },
    })
      .then((res) => {
        if (cancelled) return;
        if (res.photos?.length) setGallery(res.photos);
      })
      .catch(() => {
        /* keep local gallery */
      })
      .finally(() => {
        if (!cancelled) setGalleryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicle.id, vehicle.dealer_listing_url, vehicle.make, vehicle.model, vehicle.photos, vehicle.thumbnail_url]);

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
          termMonths,
          downPaymentRate: downRate,
          notes: `In-card apply · ${vehicle.year} ${vehicle.make} ${vehicle.model} · ${termMonths}mo · ${(downRate * 100).toFixed(0)}% down`,
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
  const specs = vehicle.specs || {};
  const specRows: [string, string][] = [
    ["Body", vehicle.body_style],
    ["Exterior", vehicle.exterior_color],
    ["Interior", vehicle.interior_color],
    ["Engine", specs.engine || "—"],
    ["Power", specs.horsepower || "—"],
    ["Drivetrain", specs.drivetrain || "—"],
    ["Trans", specs.transmission || "—"],
    ["Fuel", specs.fuel || "—"],
    ["Seats", specs.seats || "—"],
    ["VIN", vehicle.vin ? `…${vehicle.vin.slice(-6)}` : "—"],
  ].filter(([, v]) => v && v !== "—") as [string, string][];

  return (
    <div className="flex h-full max-h-[min(92vh,920px)] flex-col overflow-y-auto p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.16em] text-fg-subtle uppercase">Est. monthly</p>
          <p
            key={quote.monthlyPaymentCents}
            className="font-display text-3xl font-semibold tabular-nums tracking-tight text-price transition-all duration-200"
          >
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

      {/* Playable term / down controls */}
      <div className="mb-4 space-y-3">
        <div>
          <p className="mb-1.5 text-[10px] tracking-[0.14em] text-fg-subtle uppercase">Term</p>
          <div className="flex flex-wrap gap-1.5">
            {TERM_OPTIONS.map((t) => (
              <Chip
                key={t}
                active={termMonths === t}
                onClick={() => setTermMonths(t)}
                label={`${t} mo`}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] tracking-[0.14em] text-fg-subtle uppercase">
            Cash down
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DOWN_OPTIONS.map((d) => (
              <Chip
                key={d.rate}
                active={Math.abs(downRate - d.rate) < 0.001}
                onClick={() => setDownRate(d.rate)}
                label={d.label}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] tabular-nums text-fg-muted">
            Down payment{" "}
            <span className="font-medium text-fg">{formatCad(quote.downPaymentCents)}</span>
            <span className="mx-1 text-fg-subtle">·</span>
            Residual{" "}
            <span className="font-medium text-fg">{formatCad(quote.residualCents)}</span>
          </p>
        </div>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-border/70 pb-3 text-[12px]">
        <div className="col-span-2 flex justify-between gap-2">
          <dt className="text-fg-muted">Price</dt>
          <dd className="tabular-nums text-fg">{formatCad(quote.priceCents)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">Cap cost</dt>
          <dd className="tabular-nums text-fg">{formatCad(quote.capCostCents)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">Finance / mo</dt>
          <dd className="tabular-nums text-fg">{formatCadExact(quote.financeChargeCents)}</dd>
        </div>
      </dl>

      {/* Vehicle facts — fills blank space */}
      {step === "quote" && (
        <>
          <div className="mb-4">
            <p className="mb-2 text-[10px] tracking-[0.14em] text-fg-subtle uppercase">Vehicle</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:text-[12px]">
              {specRows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-border/40 py-1">
                  <span className="text-fg-muted">{k}</span>
                  <span className="truncate text-right font-medium text-fg">{v}</span>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span className="text-fg-muted">Mileage</span>
                <span className="tabular-nums font-medium text-fg">
                  {formatNumber(vehicle.mileage)} km
                </span>
              </div>
              <div className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span className="text-fg-muted">Dealer</span>
                <span className="truncate text-right font-medium text-fg">
                  {vehicle.dealer_name}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">Gallery</p>
              {galleryLoading ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
                  <Loader2 className="size-3 animate-spin" /> Loading dealer photos
                </span>
              ) : (
                <span className="text-[10px] text-fg-subtle">{gallery.length} photos</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {gallery.slice(0, 12).map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setLightbox(src)}
                  className="aspect-square overflow-hidden rounded-[var(--radius-md)] border border-border/60 bg-white transition-[transform,box-shadow] hover:z-10 hover:scale-[1.03] hover:shadow-md"
                >
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-fg-subtle">
              Spaced sample up to 12 · interiors preferred when labeled on dealer listing
            </p>
          </div>
        </>
      )}

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
        <div className="mt-auto space-y-2 pt-1">
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
          <p className="text-[11px] text-fg-muted">
            Quote locked at{" "}
            <span className="font-medium text-fg">{formatCadExact(quote.monthlyPaymentCents)}/mo</span>
            {" · "}
            {termMonths} mo · {(downRate * 100).toFixed(0)}% down
          </p>
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

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white"
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-[12px] font-medium tabular-nums transition-[background-color,color,border-color,transform] duration-[var(--motion-quick)] active:scale-[0.96]",
        active
          ? "border-fg bg-fg text-primary-fg"
          : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {label}
    </button>
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

// re-export type use silence
void (0 as unknown as LeaseQuote);
