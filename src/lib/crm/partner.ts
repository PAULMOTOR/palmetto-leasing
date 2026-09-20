/**
 * Palmetto server → Paul Motor CRM. Bearer secret never leaves this module.
 * When CRM_HANDOFF_SECRET is missing (preview), a per-rooftop demo board is used.
 */
import { slugifyDealer } from "@/lib/crm/dealers";
import {
  DESK_BUCKETS,
  emptyGauges,
  isDeskBucket,
  tallyGauges,
  type DeskBucket,
} from "@/lib/desk/buckets";
import type { DeskBoard, DeskDeal } from "@/lib/desk/types";

export type { DeskBoard, DeskDeal };

function crmOrigin(): string {
  const explicit = process.env.CRM_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const handoff = process.env.CRM_HANDOFF_URL?.trim();
  if (handoff) {
    try {
      return new URL(handoff).origin;
    } catch {
      /* fall through */
    }
  }
  return "https://crm.paulmotorcompany.com";
}

export function crmHandoffUrl(): string {
  const handoff = process.env.CRM_HANDOFF_URL?.trim();
  if (handoff && /handoff\/lease/i.test(handoff)) return handoff.split("?")[0]!;
  return `${crmOrigin()}/api/handoff/lease`;
}

function crmSecret(): string {
  return process.env.CRM_HANDOFF_SECRET?.trim() || "";
}

export function crmIsLive(): boolean {
  return Boolean(crmSecret());
}

async function crmFetch(
  path: string,
  opts: {
    method?: string;
    dealer: string;
    body?: unknown;
    timeoutMs?: number;
  },
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const secret = crmSecret();
  const dealer = slugifyDealer(opts.dealer);
  if (!secret) return { ok: false, status: 0, json: { ok: false, error: "no-secret" } };
  const method = opts.method || "GET";
  const url = new URL(path, `${crmOrigin()}/`);
  if (dealer) url.searchParams.set("dealer", dealer);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${secret}`,
    "x-dealer-slug": dealer,
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
    });
    const text = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      json: { ok: false, error: err instanceof Error ? err.message : "network" },
    };
  }
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return "";
  return String(v).trim();
}

function asYear(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n >= 1980 && n <= 2100 ? Math.round(n) : null;
}

function asStringList(v: unknown): string[] {
  if (v === true) return ["documents missing"];
  if (v === false || v == null) return [];
  if (Array.isArray(v)) return v.map((x) => asString(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function parseDeal(raw: unknown, fallbackDealer: string): DeskDeal | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const car = (o.car && typeof o.car === "object" ? o.car : {}) as Record<string, unknown>;
  const id = asString(o.id);
  if (!id) return null;
  const bucketRaw = asString(o.bucket) || "started";
  const bucket: DeskBucket = isDeskBucket(bucketRaw) ? bucketRaw : "started";
  const year = asYear(o.year ?? car.year);
  const make = asString(o.make ?? car.make);
  const model = asString(o.model ?? car.model);
  const trim = asString(o.trim ?? car.trim);
  const vin = asString(o.vin ?? car.vin).toUpperCase();
  const vehicle =
    asString(o.vehicle) ||
    [year, make, model, trim].filter(Boolean).join(" ").trim();
  void fallbackDealer;
  const quoteRaw = o.quote && typeof o.quote === "object" ? (o.quote as Record<string, unknown>) : null;
  return {
    id,
    clientName: asString(o.clientName ?? o.name ?? o.client),
    email: asString(o.email) || undefined,
    phone: asString(o.phone) || undefined,
    vin,
    year,
    make,
    model,
    trim,
    vehicle,
    bucket,
    bucketLabel: isDeskBucket(bucket) ? bucket : asString(o.bucketLabel) || bucket,
    docsMissing: asStringList(o.docsMissing ?? o.docs_missing),
    complianceHold: Boolean(o.complianceHold ?? o.compliance_hold),
    updatedAt: asString(o.updatedAt ?? o.updated_at) || new Date().toISOString(),
    quote: quoteRaw
      ? {
          price: Number(quoteRaw.price) || undefined,
          down: Number(quoteRaw.down) || undefined,
          residual: Number(quoteRaw.residual) || undefined,
          term: Number(quoteRaw.term) || undefined,
          monthly: Number(quoteRaw.monthly) || undefined,
          rate: Number(quoteRaw.rate) || undefined,
        }
      : undefined,
  };
}

function parseGauges(raw: unknown, deals: DeskDeal[]): Record<DeskBucket, number> {
  const g = tallyGauges(deals);
  if (!raw) return g;
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const b = asString(o.bucket);
      const n = Number(o.count ?? o.n ?? 0);
      if (isDeskBucket(b) && Number.isFinite(n)) g[b] = n;
    }
    return g;
  }
  if (typeof raw === "object") {
    for (const b of DESK_BUCKETS) {
      const n = Number((raw as Record<string, unknown>)[b]);
      if (Number.isFinite(n)) g[b] = n;
    }
  }
  return g;
}

function parseDealerField(raw: unknown, fallback: string): { slug: string; name?: string } {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return { slug: asString(o.slug) || fallback, name: asString(o.name) || undefined };
  }
  return { slug: asString(raw) || fallback };
}

function parseBoard(json: Record<string, unknown>, dealer: string): DeskBoard {
  const list = Array.isArray(json.deals) ? json.deals : [];
  const deals = list.map((row) => parseDeal(row, dealer)).filter((d): d is DeskDeal => Boolean(d));
  const parsed = parseDealerField(json.dealer, dealer);
  return {
    dealer: parsed.slug,
    dealerName: parsed.name,
    gauges: parseGauges(json.gauges, deals),
    deals,
    live: true,
  };
}

/* ── demo board (preview / missing secret) ─────────────────────────── */

const demoStore = new Map<string, DeskDeal[]>();

function demoSeed(slug: string): DeskDeal[] {
  const now = Date.now();
  const mk = (
    i: number,
    bucket: DeskBucket,
    extra: Partial<DeskDeal>,
  ): DeskDeal => ({
    id: `demo-${slug}-${i}`,
    clientName: extra.clientName || "Client",
    email: extra.email,
    phone: extra.phone,
    vin: extra.vin || "",
    year: extra.year ?? 2024,
    make: extra.make || "Porsche",
    model: extra.model || "911",
    trim: extra.trim || "",
    vehicle: extra.vehicle || "",
    bucket,
    bucketLabel: bucket,
    docsMissing: extra.docsMissing || [],
    complianceHold: Boolean(extra.complianceHold),
    updatedAt: new Date(now - i * 3600_000).toISOString(),
    quote: extra.quote,
  });
  const rows: DeskDeal[] = [
    mk(1, "started", {
      clientName: "Amélie Côté",
      email: "amelie@example.com",
      phone: "514-555-0142",
      vin: "WP0AB2A99RS123001",
      year: 2024,
      make: "Porsche",
      model: "911",
      trim: "Carrera S",
    }),
    mk(2, "quote_sent", {
      clientName: "James Whitmore",
      email: "james@example.com",
      vin: "ZFF90HLA0R0123002",
      year: 2024,
      make: "Ferrari",
      model: "Roma",
      quote: { price: 320000, down: 64000, residual: 166400, term: 37, monthly: 2890, rate: 5.9 },
    }),
    mk(3, "app_ids", {
      clientName: "Sofia Rahman",
      vin: "ZHWUA6ZX9SLA0177A",
      year: 2025,
      make: "Lamborghini",
      model: "Revuelto",
    }),
    mk(4, "credit_review", {
      clientName: "Marc-André Bélisle",
      vin: "SCBFR2ZG5NC012304",
      year: 2022,
      make: "Bentley",
      model: "Continental GT",
    }),
    mk(5, "docs_missing", {
      clientName: "Hannah Li",
      vin: "SALKZ9F97RA123005",
      year: 2024,
      make: "Land Rover",
      model: "Range Rover",
      docsMissing: ["documents missing"],
    }),
    mk(6, "gsm_approved", {
      clientName: "Olivier Gagnon",
      vin: "W1K6G7JB5PA123006",
      year: 2023,
      make: "Mercedes-Benz",
      model: "AMG GT",
    }),
    mk(7, "compliance_hold", {
      clientName: "Priya Shah",
      vin: "WP0AF2A99PS123007",
      year: 2023,
      make: "Porsche",
      model: "911",
      trim: "GT3",
      complianceHold: true,
    }),
    mk(8, "in_book", {
      clientName: "Daniel Park",
      vin: "ZFF79ALA0N0123008",
      year: 2022,
      make: "Ferrari",
      model: "F8 Tributo",
    }),
  ];
  for (const r of rows) {
    r.vehicle = [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ");
  }
  return rows;
}

function demoBoard(slug: string): DeskBoard {
  let deals = demoStore.get(slug);
  if (!deals) {
    deals = demoSeed(slug);
    demoStore.set(slug, deals);
  }
  return { dealer: slug, gauges: tallyGauges(deals), deals, live: false };
}

export async function fetchDeskBoard(dealer: string): Promise<DeskBoard> {
  const slug = slugifyDealer(dealer);
  if (!crmIsLive()) return demoBoard(slug);
  const res = await crmFetch("/api/partner/deals", { dealer: slug });
  if (!res.ok) {
    return {
      dealer: slug,
      gauges: emptyGauges(),
      deals: [],
      live: true,
      error: asString(res.json.error) || `CRM ${res.status || "unreachable"}`,
    };
  }
  return parseBoard(res.json, slug);
}

export async function fetchDeskDeal(dealer: string, id: string): Promise<DeskDeal | null> {
  const slug = slugifyDealer(dealer);
  if (!crmIsLive()) {
    return demoBoard(slug).deals.find((d) => d.id === id) || null;
  }
  const res = await crmFetch(`/api/partner/deals/${encodeURIComponent(id)}`, { dealer: slug });
  if (!res.ok) return null;
  const raw = res.json.deal ?? res.json;
  return parseDeal(raw, slug);
}

export async function explodeVin(
  dealer: string,
  vin: string,
): Promise<{ ok: boolean; year?: number; make?: string; model?: string; trim?: string }> {
  const clean = vin.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length !== 17) return { ok: false };
  if (crmIsLive()) {
    const res = await crmFetch("/api/partner/vin", {
      method: "POST",
      dealer,
      body: { vin: clean },
    });
    if (!res.ok || res.json.ok === false) return { ok: false };
    const car = (res.json.car && typeof res.json.car === "object"
      ? res.json.car
      : res.json) as Record<string, unknown>;
    const year = asYear(car.year);
    const make = asString(car.make);
    const model = asString(car.model);
    if (!year && !make && !model) return { ok: false };
    return { ok: true, year: year || undefined, make, model, trim: asString(car.trim) || undefined };
  }
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(clean)}?format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { Results?: Array<Record<string, string | number | null>> };
    const row = json.Results?.[0] || {};
    const year = asYear(row.ModelYear);
    const make = asString(row.Make);
    const model = asString(row.Model);
    const trim = asString(row.Trim);
    if (!year && !make && !model) return { ok: false };
    return { ok: true, year: year || undefined, make, model, trim: trim || undefined };
  } catch {
    return { ok: false };
  }
}

export async function startCrmDeal(input: {
  dealer: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  vin: string;
  year?: number | null;
  make?: string;
  model?: string;
  trim?: string;
  odometerKm: number;
  price?: number;
  down?: number;
  residual?: number;
  term?: number;
  monthly?: number;
  rate?: number;
  kmPerYear?: number;
  application?: Record<string, unknown>;
  assignedRep?: { name: string; email: string; phone: string } | null;
  sendCreditLink?: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string; live: boolean }> {
  const slug = slugifyDealer(input.dealer);
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const vin = input.vin.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!name || !email) return { ok: false, error: "Name and email are required", live: crmIsLive() };
  if (vin.length !== 17) return { ok: false, error: "VIN is required (17 characters)", live: crmIsLive() };
  if (!Number.isFinite(input.odometerKm) || input.odometerKm < 0) {
    return { ok: false, error: "Kilometres are required", live: crmIsLive() };
  }

  const filledApp = Boolean(input.application && Object.keys(input.application).length);
  const bucket: DeskBucket = filledApp || input.sendCreditLink ? "credit_review" : "quote_sent";
  const assigned = input.assignedRep
    ? {
        name: input.assignedRep.name,
        email: input.assignedRep.email,
        phone: input.assignedRep.phone,
        kind: "dealer_user",
      }
    : null;

  const payload = {
    name,
    firstName: (input.firstName || name.split(/\s+/)[0] || "").trim(),
    lastName: (input.lastName || name.split(/\s+/).slice(1).join(" ") || "").trim(),
    email,
    phone: (input.phone || "").trim(),
    car: {
      vin,
      year: input.year ?? null,
      make: input.make || "",
      model: input.model || "",
      trim: input.trim || "",
      odometerKm: Math.round(input.odometerKm),
    },
    dealer: { slug },
    dealerSlug: slug,
    price: input.price || 0,
    down: input.down || 0,
    residual: input.residual || 0,
    term: input.term || 0,
    monthly: input.monthly || 0,
    rate: input.rate || 0,
    kmPerYear: input.kmPerYear || 6000,
    creditConsent: filledApp,
    source: "dealer_desk",
    site: "https://www.palmettoleasing.com",
    vehicle: [input.year, input.make, input.model, input.trim].filter(Boolean).join(" "),
    stage: "quoted",
    bucket,
    assignPaulMotorRep: false,
    skipDefaultRep: true,
    assignedRep: assigned,
    application: input.application || undefined,
    notes: assigned
      ? `Dealer desk · ${assigned.name} (${assigned.email}${assigned.phone ? ` · ${assigned.phone}` : ""})`
      : "Dealer desk — rooftop login, no employee on file",
  };

  if (!crmIsLive()) {
    const board = demoBoard(slug);
    const id = `demo-${slug}-${Date.now().toString(36)}`;
    const deal: DeskDeal = {
      id,
      clientName: name,
      email,
      phone: payload.phone || undefined,
      vin,
      year: input.year ?? null,
      make: input.make || "",
      model: input.model || "",
      trim: input.trim || "",
      vehicle: payload.vehicle,
      bucket,
      bucketLabel: bucket,
      docsMissing: [],
      complianceHold: false,
      updatedAt: new Date().toISOString(),
      quote: {
        price: input.price,
        down: input.down,
        residual: input.residual,
        term: input.term,
        monthly: input.monthly,
        rate: input.rate,
      },
    };
    board.deals.unshift(deal);
    demoStore.set(slug, board.deals);
    return { ok: true, id, live: false };
  }

  const url = new URL(crmHandoffUrl());
  url.searchParams.set("dealer", slug);
  const secret = crmSecret();
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${secret}`,
        "x-dealer-slug": slug,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      /* ignore */
    }
    const id = asString(json.id) || asString(json.leadId) || asString(json.crmLeadId) || asString(json.referenceId);
    if (!res.ok || json.ok === false) {
      return { ok: false, error: asString(json.error) || `CRM ${res.status}`, live: true };
    }
    if (!id) return { ok: false, error: "CRM did not return a deal id", live: true };
    return { ok: true, id, live: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network", live: true };
  }
}

export async function sendCreditLink(
  dealer: string,
  dealId: string,
  email?: string,
): Promise<{ ok: boolean; url?: string; token?: string; error?: string }> {
  const slug = slugifyDealer(dealer);
  if (!crmIsLive()) {
    const token = dealId.startsWith("demo-") ? dealId : `demo-${dealId}`;
    return {
      ok: true,
      token,
      url: `https://crm.paulmotorcompany.com/credit-app/${token}`,
    };
  }
  const res = await crmFetch(`/api/partner/deals/${encodeURIComponent(dealId)}/credit-link`, {
    method: "POST",
    dealer: slug,
    body: email ? { email } : {},
  });
  if (!res.ok || res.json.ok === false) {
    return { ok: false, error: asString(res.json.error) || `CRM ${res.status}` };
  }
  const url = asString(res.json.url);
  const token = asString(res.json.token);
  if (!url) return { ok: false, error: "CRM did not return a credit-app URL" };
  return { ok: true, url, token };
}

export async function saveDeskQuote(
  dealer: string,
  dealId: string,
  quote: {
    price: number;
    down: number;
    residual: number;
    term: number;
    monthly: number;
    rate: number;
    vin?: string;
    year?: number | null;
    make?: string;
    model?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const slug = slugifyDealer(dealer);
  if (!crmIsLive()) {
    const board = demoBoard(slug);
    const deal = board.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found" };
    deal.quote = quote;
    if (deal.bucket === "started") {
      deal.bucket = "quote_sent";
      deal.bucketLabel = "quote_sent";
    }
    deal.updatedAt = new Date().toISOString();
    return { ok: true };
  }
  const res = await crmFetch(`/api/partner/deals/${encodeURIComponent(dealId)}/quote`, {
    method: "POST",
    dealer: slug,
    body: quote,
  });
  if (!res.ok || res.json.ok === false) {
    return { ok: false, error: asString(res.json.error) || `CRM ${res.status}` };
  }
  return { ok: true };
}
