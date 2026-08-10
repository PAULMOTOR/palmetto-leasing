/**
 * Portal / quote helpers for the marketing site (no database).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadQuoteSettings } from "./quote-config";
import { activeDealers, listCatalogDealerSummaries } from "./catalog";
import { calculateLease, type QuoteSettings } from "./calc";
import { DEALERS } from "./seed";

const ADMIN_PIN = () => process.env.ADMIN_PIN?.trim() || "palmetto";
const DEALER_PIN = () => process.env.DEALER_PIN?.trim() || "dealer";

export { loadQuoteSettings };

export const getQuoteSettings = createServerFn({ method: "GET" }).handler(async () => {
  return loadQuoteSettings();
});

/** Quote defaults are env-driven on Vercel — this endpoint documents them only. */
export const updateQuoteSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        baseInterestRate: z.number().min(0).max(0.4),
        termMonths: z.number().int().min(12).max(72),
        residualRate: z.number().min(0.1).max(0.9),
        downPaymentRate: z.number().min(0).max(0.5),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    // Marketing site has no DB — settings come from Vercel env vars.
    return {
      ok: false as const,
      message:
        "Set QUOTE_BASE_INTEREST_RATE, QUOTE_TERM_MONTHS, QUOTE_RESIDUAL_RATE, QUOTE_DOWN_PAYMENT_RATE in Vercel env, then redeploy.",
      settings: loadQuoteSettings(),
    };
  });

export const verifyAdminPin = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ pin: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    if (data.pin !== ADMIN_PIN()) return { ok: false as const };
    return { ok: true as const, token: "admin-ok" as const };
  });

export const dealerPortalLogin = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ dealerId: z.string().min(1), pin: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const d = DEALERS.find((x) => x.id === data.dealerId);
    if (!d) return { ok: false as const };
    if (data.pin !== DEALER_PIN() && data.pin !== ADMIN_PIN()) return { ok: false as const };
    return {
      ok: true as const,
      token: `dealer:${d.id}`,
      dealer: {
        id: d.id,
        name: d.name,
        referralFeeBps: 150,
        quoteRateOffsetBps: 0,
        active: d.active,
      },
    };
  });

export const updateDealerPortalSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        referralFeeBps: z.number().int().min(0).max(1000),
        quoteRateOffsetBps: z.number().int().min(-500).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!data.token.startsWith("dealer:")) throw new Error("Unauthorized");
    // Preferences will live in the CRM project; accept UI saves for UX only.
    return {
      ok: true as const,
      message: "Saved for this session. Wire to CRM handoff for permanent dealer economics.",
      referralFeeBps: data.referralFeeBps,
      quoteRateOffsetBps: data.quoteRateOffsetBps,
    };
  });

export const getDealerPortal = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    if (!data.token.startsWith("dealer:")) throw new Error("Unauthorized");
    const dealerId = data.token.slice("dealer:".length);
    const d = DEALERS.find((x) => x.id === dealerId);
    if (!d) throw new Error("Dealer not found");
    return {
      dealer: {
        id: d.id,
        name: d.name,
        city: d.city,
        province: d.province,
        referralFeeBps: 150,
        quoteRateOffsetBps: 0,
        active: d.active,
        inventoryUrl: d.inventory_url,
      },
      referrals: [] as {
        id: number;
        vehicle_label: string;
        customer_name: string;
        monthly_payment_cents: number;
        status: string;
        created_at: string;
      }[],
    };
  });

export const listActiveDealersForLogin = createServerFn({ method: "GET" }).handler(async () => {
  return activeDealers().map((d) => ({
    id: d.id,
    name: d.name,
    city: d.city,
    province: d.province,
  }));
});

/** Client status lives in CRM — marketing site only acknowledges handoff wiring. */
export const clientLookup = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    // No CRM DB here. When CRM exposes a status API, call it with CRM_HANDOFF_SECRET.
    const statusUrl = process.env.CRM_STATUS_URL?.trim();
    if (statusUrl) {
      try {
        const secret = process.env.CRM_HANDOFF_SECRET?.trim();
        const res = await fetch(
          `${statusUrl}?email=${encodeURIComponent(email)}`,
          {
            headers: secret ? { authorization: `Bearer ${secret}` } : {},
          },
        );
        if (res.ok) {
          const body = (await res.json()) as { applications?: unknown[] };
          if (Array.isArray(body.applications)) {
            return { email, applications: body.applications as never[] };
          }
        }
      } catch (err) {
        console.error("[client-status]", err);
      }
    }
    return {
      email,
      applications: [] as {
        id: number;
        vehicleLabel: string;
        dealerName: string;
        priceCents: number;
        monthlyPaymentCents: number;
        termMonths: number;
        residualCents: number;
        status: string;
        contractStatus: string;
        missingDocs: string[];
        buyoutCents: number;
        monthsElapsed: number;
        createdAt: string;
        customerName: string;
      }[],
      note: "Application status is tracked in the Paul Motor CRM. Connect CRM_STATUS_URL when ready.",
    };
  });

export function estimateBuyout(
  priceCents: number,
  monthsElapsed: number,
  settings?: QuoteSettings,
): number {
  const s = settings ?? loadQuoteSettings();
  const q = calculateLease(priceCents, s);
  const elapsed = Math.min(Math.max(0, monthsElapsed), q.termMonths);
  const remaining = q.termMonths - elapsed;
  const paidDep = Math.round((q.depreciationCents * elapsed) / q.termMonths);
  const remainingDep = Math.max(0, q.depreciationCents - paidDep);
  return Math.round(q.residualCents + remainingDep * (remaining / Math.max(1, q.termMonths)));
}

export function adminDealerList() {
  return DEALERS.map((d) => ({
    id: d.id,
    name: d.name,
    city: d.city,
    province: d.province,
    brands: d.brands,
    website_url: d.website_url,
    inventory_url: d.inventory_url,
    active: d.active,
    vehicle_count: listCatalogDealerSummaries().find((x) => x.id === d.id)?.count
      ?? (d.active
        ? 0
        : 0),
  }));
}
