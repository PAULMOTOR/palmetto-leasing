/**
 * Server-side handoff to the separate CRM Vercel project.
 * Never embeds CRM database credentials here.
 *
 * The CRM parser (moss-drift-able-monarch) reads name/email/phone/vehicle
 * and dollar amounts — not Palmetto's customerName / *Cents fields.
 * We send both shapes so either side can stay compatible.
 */
import type { LeaseQuote } from "@/lib/leasing/calc";

export type HandoffPayload = {
  type: "lease_application" | "lease_quote";
  referenceId: string;
  vehicleId: string;
  vehicleLabel: string;
  dealerName: string;
  priceCents: number;
  downPaymentCents: number;
  residualCents: number;
  termMonths: number;
  monthlyPaymentCents: number;
  baseInterestRate: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
  application?: Record<string, unknown>;
  source: string;
  site: string;
  createdAt: string;
  // CRM-native aliases (what parsePalmettoPayload actually reads)
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postal: string;
  postalCode: string;
  employer: string;
  occupation: string;
  job: string;
  income: string;
  creditConsent: boolean;
  vehicle: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  vin: string;
  stock: string;
  price: number;
  down: number;
  residual: number;
  term: number;
  monthly: number;
  rate: number;
  customer: Record<string, unknown>;
  quote: Record<string, unknown>;
  car: Record<string, unknown>;
  dealer: Record<string, unknown>;
};

export type HandoffResult = {
  ok: boolean;
  queued: boolean;
  referenceId: string;
  message: string;
  crmLeadId?: string;
};

function centsToDollars(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

/** CRM notes render `Rate ${n}%` — send 7.99, not 0.0799. */
function ratePercent(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return rate > 0 && rate < 1 ? Math.round(rate * 10_000) / 100 : rate;
}

function field(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
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
}): Promise<HandoffResult> {
  const referenceId = `pml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const site =
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.VITE_PUBLIC_SITE_URL?.trim() ||
    "https://palmettoleasing.com";

  const app = input.application ?? {};
  const name = input.customerName.trim();
  const nameParts = name.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");
  const email = input.customerEmail.trim().toLowerCase();
  const phone = field(input.customerPhone);
  const address = field(app.address);
  const city = field(app.city);
  const province = field(app.province);
  const postal = field(app.postalCode);
  const employer = field(app.employer);
  const occupation = field(app.occupation);
  const income = field(app.annualIncome);
  const creditConsent = app.consentCredit === true || app.creditConsent === true;
  const year = field(input.year);
  const make = field(input.make);
  const model = field(input.model);
  const trim = field(input.trim);
  const vin = field(input.vin).toUpperCase();
  const stock = field(input.stock);
  const price = centsToDollars(input.quote.priceCents);
  const down = centsToDollars(input.quote.downPaymentCents);
  const residual = centsToDollars(input.quote.residualCents);
  const monthly = centsToDollars(input.quote.monthlyPaymentCents);
  const term = input.quote.termMonths;
  const rate = ratePercent(input.quote.baseInterestRate);
  const vehicle = input.vehicleLabel;

  const payload: HandoffPayload = {
    type: "lease_application",
    referenceId,
    vehicleId: input.vehicleId,
    vehicleLabel: vehicle,
    dealerName: input.dealerName,
    priceCents: input.quote.priceCents,
    downPaymentCents: input.quote.downPaymentCents,
    residualCents: input.quote.residualCents,
    termMonths: term,
    monthlyPaymentCents: input.quote.monthlyPaymentCents,
    baseInterestRate: input.quote.baseInterestRate,
    customerName: name,
    customerEmail: email,
    customerPhone: phone,
    notes: input.notes || "",
    application: input.application,
    source: input.source || "palmettoleasing.com",
    site,
    createdAt: new Date().toISOString(),
    name,
    firstName,
    lastName,
    email,
    phone,
    address,
    city,
    province,
    postal,
    postalCode: postal,
    employer,
    occupation,
    job: [occupation, employer].filter(Boolean).join(" · "),
    income,
    creditConsent,
    vehicle,
    year,
    make,
    model,
    trim,
    vin,
    stock,
    price,
    down,
    residual,
    term,
    monthly,
    rate,
    customer: {
      name,
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      province,
      postal,
      postalCode: postal,
      employer,
      occupation,
      income,
      creditConsent,
    },
    quote: { price, down, residual, term, monthly, rate, termMonths: term },
    car: { year, make, model, trim, vin, stock, label: vehicle, name: vehicle },
    dealer: { name: input.dealerName },
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
      const body = JSON.parse(text) as { id?: string; ok?: boolean };
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
