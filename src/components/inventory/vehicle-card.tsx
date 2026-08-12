import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { VehicleCard as VehicleCardType } from "@/lib/leasing/types";
import {
  calculateLease,
  LEASE_TERM_OPTIONS,
  isHighValueVehicle,
  HIGH_VALUE_DOWN_RATE,
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

const TERM_OPTIONS = LEASE_TERM_OPTIONS;
const DOWN_OPTIONS = [
  { rate: 0.1, label: "10%" },
  { rate: 0.15, label: "15%" },
  { rate: 0.2, label: "20%" },
  { rate: 0.25, label: "25%" },
  { rate: 0.3, label: "30%" },
] as const;

const PLACEHOLDER = "/vehicles/top-porsche-911.jpg";

function isEphemeral(url: string) {
  return /imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(url || "");
}

function buildThumbCandidates(vehicle: VehicleCardType): string[] {
  const raw = [
    vehicle.thumbnail_url,
    ...(vehicle.photos || []),
    PLACEHOLDER,
  ].filter(Boolean) as string[];
  const out: string[] = [];
  for (const u of raw) {
    if (isEphemeral(u)) continue;
    if (!out.includes(u)) out.push(u);
  }
  if (!out.length) out.push(PLACEHOLDER);
  return out;
}

/**
 * Media is a square stage. Image is locked to geometric center so the car's
 * longitudinal axis (hood badge) lines up with the page/logo centerline
 * when the card is the middle column.
 */
function TileThumb({ vehicle, title }: { vehicle: VehicleCardType; title: string }) {
  const candidates = useMemo(() => buildThumbCandidates(vehicle), [vehicle]);
  const [idx, setIdx] = useState(0);
  const src = candidates[Math.min(idx, candidates.length - 1)] || PLACEHOLDER;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <img
        key={src}
        src={src}
        alt=""
        role="presentation"
        loading="lazy"
        decoding="async"
        onError={() => {
          setIdx((i) => (i + 1 < candidates.length ? i + 1 : i));
        }}
        className="h-full w-full max-h-full max-w-full bg-white object-contain object-center transition-transform duration-[var(--motion-slow)] ease-[var(--ease-smooth-out)] group-hover:scale-[1.015]"
        style={{
          backgroundColor: "#FFFFFF",
          objectPosition: "50% 50%",
        }}
        title={title}
      />
    </div>
  );
}

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
          ? "z-20 col-span-full border-accent/40 shadow-[var(--shadow-card-hover)]"
          : "hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={cn(
          "grid",
          expanded
            ? "md:grid-cols-[minmax(240px,38%)_1fr] lg:grid-cols-[minmax(280px,34%)_1fr]"
            : "grid-cols-1",
        )}
      >
        <div className="flex flex-col">
          {/* Square stage — car always geometrically centered in the tile */}
          <div
            className={cn(
              "relative w-full overflow-hidden bg-white",
              expanded
                ? "aspect-square md:aspect-auto md:min-h-[320px] md:flex-1"
                : "aspect-square",
            )}
          >
            <TileThumb vehicle={vehicle} title={title} />
          </div>

          <div className="flex flex-col items-center bg-surface px-3.5 pt-2 pb-4 text-center sm:px-4 sm:pt-2.5 sm:pb-4">
            <p className="mb-1.5 max-w-[94%] text-[9px] font-medium tracking-[0.22em] text-fg-subtle uppercase sm:text-[10px] sm:tracking-[0.26em]">
              {dealerLabel}
            </p>

            <h3 className="text-[13px] leading-snug font-normal tracking-wide text-fg-muted sm:text-sm">
              {shortTitle}
              {vehicle.trim ? ` ${vehicle.trim}` : ""}
            </h3>

            <p className="mt-1 text-[13px] font-medium tabular-nums tracking-wide text-price sm:text-sm">
              {formatCad(vehicle.price_cents)}
              <span className="mx-1.5 text-fg-subtle">-</span>
              <span className="tabular-nums">{formatNumber(vehicle.mileage)} KM</span>
            </p>

            <div className="mt-3 flex w-full items-center justify-center gap-4">
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
          <div className="border-t border-border bg-surface-2/40 md:border-t-0 md:border-l">
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
  const highValue = isHighValueVehicle(vehicle.price_cents);
  const [termMonths, setTermMonths] = useState(
    LEASE_TERM_OPTIONS.includes(baseSettings.termMonths as (typeof LEASE_TERM_OPTIONS)[number])
      ? baseSettings.termMonths
      : 37,
  );
  const [downRate, setDownRate] = useState(
    highValue ? HIGH_VALUE_DOWN_RATE : baseSettings.downPaymentRate || 0.2,
  );

  // Lock 30% down on $1M+ cars (and if vehicle identity changes)
  useEffect(() => {
    if (isHighValueVehicle(vehicle.price_cents)) {
      setDownRate(HIGH_VALUE_DOWN_RATE);
    }
  }, [vehicle.price_cents, vehicle.id]);
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
        thumbnail_url: "",
        photos: (vehicle.photos || []).filter(
          (p) => !isEphemeral(p) && !p.startsWith("data:") && !p.includes("/vehicles/"),
        ),
        make: vehicle.make,
        model: vehicle.model,
      }),
      { limit: 12 },
    ),
  );
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    requestAnimationFrame(() => {
      document
        .getElementById(`quote-panel-${vehicle.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [vehicle.id]);

  useEffect(() => {
    let cancelled = false;
    setGalleryLoading(true);
    getVehicleGallery({
      data: {
        vehicleId: vehicle.id,
        listingUrl: vehicle.dealer_listing_url,
        make: vehicle.make,
        model: vehicle.model,
        existingPhotos: (vehicle.photos || []).filter(
          (p) =>
            !isEphemeral(p) &&
            !p.startsWith("data:") &&
            !p.includes("/vehicles/"),
        ),
        thumbnail: undefined,
      },
    })
      .then((res) => {
        if (cancelled) return;
        if (res.photos?.length) {
          setGallery(
            res.photos.filter(
              (p) =>
                !isEphemeral(p) &&
                !p.startsWith("data:") &&
                !p.includes("/vehicles/"),
            ),
          );
        }
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
  }, [
    vehicle.id,
    vehicle.dealer_listing_url,
    vehicle.make,
    vehicle.model,
    vehicle.photos,
    vehicle.thumbnail_url,
  ]);

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
    <div
      id={`quote-panel-${vehicle.id}`}
      className="flex h-full max-h-[min(92vh,920px)] flex-col overflow-y-auto p-4 sm:p-5 lg:p-6"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.16em] text-fg-subtle uppercase">Est. monthly</p>
          <p
            key={quote.monthlyPaymentCents}
            className="font-display text-3xl font-semibold tabular-nums tracking-tight text-price transition-all duration-200 lg:text-4xl"
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
            <p className="mt-1.5 w-full text-[10px] text-fg-subtle">
              Residual auto: 25→63% · 37→52% · 49→41% · 61→32%
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] tracking-[0.14em] text-fg-subtle uppercase">Cash down</p>
          {highValue ? (
            <div className="space-y-1.5">
              <div className="inline-flex h-8 items-center rounded-full border border-fg bg-fg px-3 text-[12px] font-medium text-primary-fg">
                30% required
              </div>
              <p className="text-[10px] text-fg-subtle">
                Vehicles over $1,000,000 require a 30% down payment
              </p>
            </div>
          ) : (
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
          )}
          <p className="mt-1.5 text-[11px] tabular-nums text-fg-muted">
            Down payment{" "}
            <span className="font-medium text-fg">{formatCad(quote.downPaymentCents)}</span>
            <span className="mx-1 text-fg-subtle">·</span>
            Residual{" "}
            <span className="font-medium text-fg">
              {formatCad(quote.residualCents)}
            </span>{" "}
            <span className="text-fg-subtle">
              ({(quote.residualRate * 100).toFixed(0)}%)
            </span>
          </p>
        </div>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-border/70 pb-3 text-[12px] sm:grid-cols-3">
        <div className="col-span-2 flex justify-between gap-2 sm:col-span-1 sm:flex-col sm:justify-start">
          <dt className="text-fg-muted">Price</dt>
          <dd className="tabular-nums text-fg">{formatCad(quote.priceCents)}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
          <dt className="text-fg-muted">Cap cost</dt>
          <dd className="tabular-nums text-fg">{formatCad(quote.capCostCents)}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
          <dt className="text-fg-muted">Finance / mo</dt>
          <dd className="tabular-nums text-fg">{formatCadExact(quote.financeChargeCents)}</dd>
        </div>
      </dl>

      {step === "quote" && (
        <>
          <div className="mb-4">
            <p className="mb-2 text-[10px] tracking-[0.14em] text-fg-subtle uppercase">Vehicle</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:grid-cols-3 sm:text-[12px]">
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
                <span className="truncate text-right font-medium text-fg">{vehicle.dealer_name}</span>
              </div>
            </div>
          </div>

          <ListingGallery
            photos={gallery}
            loading={galleryLoading}
            onOpen={(i) => setLightboxIndex(i)}
            onPhotosChange={setGallery}
          />
        </>
      )}

      {step === "done" && leadId != null ? (
        <div className="mt-auto flex items-start gap-2 rounded-[var(--radius-lg)] bg-surface p-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="font-medium">Application #{leadId}</p>
            <p className="mt-0.5 text-xs text-fg-muted">Track status anytime via Login → Client.</p>
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
            <span className="font-medium text-fg">
              {formatCadExact(quote.monthlyPaymentCents)}/mo
            </span>
            {" · "}
            {termMonths} mo · {(downRate * 100).toFixed(0)}% down
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

      {lightboxIndex != null && gallery[lightboxIndex] && (
        <GalleryLightbox
          photos={gallery}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndex={setLightboxIndex}
        />
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


const MIN_GALLERY_WIDTH = 300;

/** Small thumbs only until click — large view + arrows live in GalleryLightbox. */
function ListingGallery({
  photos,
  loading,
  onOpen,
  onPhotosChange,
}: {
  photos: string[];
  loading: boolean;
  onOpen: (index: number) => void;
  onPhotosChange: (next: string[]) => void;
}) {
  function rejectPhoto(src: string) {
    onPhotosChange(photos.filter((p) => p !== src));
  }

  const count = photos.length;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">Gallery</p>
        {loading ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
            <Loader2 className="size-3 animate-spin" /> Loading dealer photos
          </span>
        ) : (
          <span className="text-[10px] text-fg-subtle">
            {count} photo{count === 1 ? "" : "s"}
            {count > 0 ? " · tap to enlarge" : ""}
          </span>
        )}
      </div>

      {count === 0 && !loading ? (
        <p className="text-[12px] text-fg-subtle">No dealer photos available</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {photos.slice(0, 12).map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => onOpen(i)}
              className="aspect-square overflow-hidden rounded-[var(--radius-md)] border border-border/60 bg-white transition-[transform,box-shadow,border-color] hover:z-10 hover:scale-[1.03] hover:border-accent/50 hover:shadow-md"
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover object-center"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalWidth < MIN_GALLERY_WIDTH) {
                    rejectPhoto(src);
                  }
                }}
                onError={() => rejectPhoto(src)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryLightbox({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: string[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const count = photos.length;
  const src = photos[index] || "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndex((index - 1 + count) % count);
      if (e.key === "ArrowRight") onIndex((index + 1) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onClose, onIndex]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="size-5" />
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            className="absolute top-1/2 left-3 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25 sm:left-6"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index - 1 + count) % count);
            }}
            aria-label="Previous image"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            className="absolute top-1/2 right-3 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25 sm:right-6"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index + 1) % count);
            }}
            aria-label="Next image"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}

      <img
        src={src}
        alt=""
        className="max-h-[85vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-white tabular-nums">
        {index + 1} / {count}
      </span>
    </div>
  );
}


void (0 as unknown as LeaseQuote);
