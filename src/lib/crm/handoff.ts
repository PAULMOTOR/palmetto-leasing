/**
 * Server-side handoff to the CRM Vercel project.
 * POST body is the quote the customer just saw — dollars and % — not cents.
 * Palmetto never opens the CRM database.
 */
import type { LeaseQuote } from "@/lib/leasing/calc";

/** Canonical Apply payload (what CRM_HANDOFF_URL receives). */
export type HandoffPayload = {
  referenceId: string;
  name: string;
  email: string;
  phone: string;
  car: {
    year: number | null;
    make: string;
    model: string;
    vin: string;
    trim?: string;
    stock?: string;
    image?: string;
    photoUrl?: string;
  };
  dealer: { name: string };
  price: number;
  down: number;
  residual: number;
  term: number;
  monthly: number;
  rate: number;
  creditConsent: boolean;
  /** Public HTTPS URL of the inventory tile the customer saw. */
  image?: string;
  photoUrl?: string;
  heroImageUrl?: string;
  photos?: string[];
  kmPerYear?: number;
  excessKmPenalty?: number;
  // extras the CRM already stores (address / job / notes)
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  province?: string;
  postal?: string;
  employer?: string;
  occupation?: string;
  income?: string;
  vehicle?: string;
  notes?: string;
  source?: string;
  site?: string;
  createdAt?: string;
  application?: Record<string, unknown>;
};

export type HandoffResult = {
  ok: boolean;
  queued: boolean;
  referenceId: string;
  message: string;
  crmLeadId?: string;
};

/** Whole dollars — same as the price / down / residual on the quote card. */
function dollarsSeen(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents / 100);
}

/** Two-decimal dollars — same as the monthly the customer sees. */
function monthlySeen(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

/** APR as 7.49 — same % shown on the quote, not 0.0749. */
function rateSeen(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  const pct = rate > 0 && rate < 1 ? rate * 100 : rate;
  return Math.round(pct * 100) / 100;
}

function field(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function publicImageUrl(v: unknown): string | undefined {
  const s = field(v);
  if (!/^https?:\/\//i.test(s)) return undefined;
  return s.slice(0, 500);
}

function yearSeen(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n >= 1980 && n <= 2100 ? Math.round(n) : null;
}

export async function handoffLeaseToCrm(input: {
  vehicleId: string;
  vehicleLabel: string;
  dealerName: string;
  quote: LeaseQuote;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  source?: string;
  application?: Record<string, unknown>;
  year?: string | number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string | null;
  stock?: string | null;
  image?: string | null;
}): Promise<HandoffResult> {
  const referenceId = `pml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const site =
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.VITE_PUBLIC_SITE_URL?.trim() ||
    "https://www.palmettoleasing.com";

  const app = input.application ?? {};
  const name = input.customerName.trim();
  const nameParts = name.split(/\s+/).filter(Boolean);
  const email = input.customerEmail.trim().toLowerCase();
  const phone = field(input.customerPhone);
  const creditConsent = app.consentCredit === true || app.creditConsent === true;
  const image = publicImageUrl(input.image);

  const payload: HandoffPayload = {
    referenceId,
    name,
    email,
    phone,
    car: {
      year: yearSeen(input.year),
      make: field(input.make),
      model: field(input.model),
      vin: field(input.vin).toUpperCase(),
      trim: field(input.trim) || undefined,
      stock: field(input.stock) || undefined,
      image,
      photoUrl: image,
    },
    dealer: { name: input.dealerName },
    price: dollarsSeen(input.quote.priceCents),
    down: dollarsSeen(input.quote.downPaymentCents),
    residual: dollarsSeen(input.quote.residualCents),
    term: input.quote.termMonths,
    monthly: monthlySeen(input.quote.monthlyPaymentCents),
    rate: rateSeen(input.quote.baseInterestRate),
    creditConsent,
    image,
    photoUrl: image,
    heroImageUrl: image,
    photos: image ? [image] : undefined,
    kmPerYear: input.quote.kmPerYear,
    excessKmPenalty: input.quote.excessKmPenaltyPerKm,
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" "),
    address: field(app.address),
    city: field(app.city),
    province: field(app.province),
    postal: field(app.postalCode),
    employer: field(app.employer),
    occupation: field(app.occupation),
    income: field(app.annualIncome),
    vehicle: input.vehicleLabel,
    notes: input.notes || "",
    source: input.source || "apply_now",
    site,
    createdAt: new Date().toISOString(),
    application: input.application,
  };

  const url = process.env.CRM_HANDOFF_URL?.trim();
  const secret = process.env.CRM_HANDOFF_SECRET?.trim();

  if (!url) {
    console.info("[crm-handoff] CRM_HANDOFF_URL not set — application accepted locally only", {
      referenceId,
      email: payload.email,
    });
    return {
      ok: true,
      queued: false,
      referenceId,
      message:
        "Application received. Connect CRM_HANDOFF_URL on Vercel to push leads into your CRM project.",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        "x-palmetto-reference": referenceId,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[crm-handoff] failed", res.status, text.slice(0, 300));
      return {
        ok: false,
        queued: false,
        referenceId,
        message: `CRM handoff failed (${res.status}). We'll still record your request — please call us if urgent.`,
      };
    }
    let crmLeadId: string | undefined;
    try {
      const body = JSON.parse(text) as { id?: string };
      if (body.id) crmLeadId = body.id;
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      queued: true,
      referenceId,
      crmLeadId,
      message: "Application sent to Paul Motor CRM.",
    };
  } catch (err) {
    console.error("[crm-handoff] network error", err);
    return {
      ok: false,
      queued: false,
      referenceId,
      message: "Could not reach CRM handoff. Please try again or contact Palmetto.",
    };
  }
}
