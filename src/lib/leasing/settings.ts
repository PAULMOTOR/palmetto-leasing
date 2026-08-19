/**
 * Portal / quote helpers for the marketing site.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  loadQuoteSettings,
  loadQuoteSettingsAsync,
  saveQuoteSettings,
} from "./quote-config";
import { DEFAULT_QUOTE_SETTINGS } from "./calc";
import { activeDealers } from "./catalog";
import { DEALERS } from "./seed";

const ADMIN_PIN = () => process.env.ADMIN_PIN?.trim() || "palmetto";
const DEALER_PIN = () => process.env.DEALER_PIN?.trim() || "dealer";

export { loadQuoteSettings };

export const getQuoteSettings = createServerFn({ method: "GET" }).handler(async () => {
  return loadQuoteSettingsAsync();
});

/** Persist quote defaults to Neon (admin panel). */
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
    const settings = await saveQuoteSettings({
      baseInterestRate: data.baseInterestRate,
      termMonths: data.termMonths,
      residualRate: data.residualRate,
      downPaymentRate: data.downPaymentRate,
      kmPerYear: DEFAULT_QUOTE_SETTINGS.kmPerYear,
    });
    return { ok: true as const, settings };
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

export const clientLookup = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const statusUrl = process.env.CRM_STATUS_URL?.trim();
    if (statusUrl) {
      try {
        const secret = process.env.CRM_HANDOFF_SECRET?.trim();
        const res = await fetch(`${statusUrl}?email=${encodeURIComponent(email)}`, {
          headers: secret ? { authorization: `Bearer ${secret}` } : {},
        });
        if (res.ok) {
          const body = (await res.json()) as { applications?: unknown[] };
          if (Array.isArray(body.applications)) {
            return { email, applications: body.applications as never[] };
          }
        }
      } catch {
        /* fall through */
      }
    }
    return {
      email,
      applications: [] as {
        id: string;
        vehicleLabel: string;
        status: string;
        missingDocs: string[];
        contractStatus: string;
        monthlyPaymentCents: number;
        buyoutCents: number | null;
      }[],
    };
  });
