/**
 * Public marketing API — static catalog + CRM handoff. No database.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { calculateLease } from "./calc";
import {
  getCatalogVehicleById,
  getCatalogVehicleBySlug,
  listCatalogDealerSummaries,
  listCatalogVehicles,
} from "./catalog";
import { loadQuoteSettings } from "./quote-config";
import { handoffLeaseToCrm } from "@/lib/crm/handoff";

export const bootstrapInventory = createServerFn({ method: "POST" }).handler(async () => {
  return { seeded: true as const, mode: "static" as const };
});

export const listVehicles = createServerFn({ method: "GET" })
  .validator(
    (input: unknown) =>
      z
        .object({
          q: z.string().optional(),
          make: z.string().optional(),
          dealerId: z.string().optional(),
          minPrice: z.number().optional(),
          maxPrice: z.number().optional(),
          bodyStyle: z.string().optional(),
          premiumOnly: z.boolean().optional(),
          sort: z.enum(["price_asc", "price_desc", "newest", "monthly"]).optional(),
        })
        .optional()
        .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const settings = loadQuoteSettings();
    let list = listCatalogVehicles(settings);
    const filters = data ?? {};

    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter((v) =>
        `${v.year} ${v.make} ${v.model} ${v.trim} ${v.exterior_color} ${v.dealer_name}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (filters.make) {
      list = list.filter((v) => v.make.toLowerCase() === filters.make!.toLowerCase());
    }
    if (filters.dealerId) {
      list = list.filter((v) => v.dealership_id === filters.dealerId);
    }
    if (filters.bodyStyle) {
      list = list.filter((v) => v.body_style.toLowerCase() === filters.bodyStyle!.toLowerCase());
    }
    if (filters.premiumOnly) {
      list = list.filter((v) => v.is_premium);
    }
    if (typeof filters.minPrice === "number") {
      list = list.filter((v) => v.price_cents >= filters.minPrice!);
    }
    if (typeof filters.maxPrice === "number") {
      list = list.filter((v) => v.price_cents <= filters.maxPrice!);
    }

    switch (filters.sort) {
      case "price_asc":
        list.sort((a, b) => a.price_cents - b.price_cents);
        break;
      case "newest":
        list.sort((a, b) => b.year - a.year || b.price_cents - a.price_cents);
        break;
      case "monthly":
        list.sort((a, b) => a.monthly_payment_cents - b.monthly_payment_cents);
        break;
      case "price_desc":
      default:
        list.sort((a, b) => b.price_cents - a.price_cents);
    }

    return list;
  });

export const getVehicleBySlug = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    return getCatalogVehicleBySlug(data.slug, loadQuoteSettings());
  });

export const listDealers = createServerFn({ method: "GET" }).handler(async () => {
  return listCatalogDealerSummaries();
});

export const getInventoryStats = createServerFn({ method: "GET" }).handler(async () => {
  const list = listCatalogVehicles(loadQuoteSettings());
  const prices = list.map((v) => v.price_cents);
  return {
    total: list.length,
    premium: list.filter((v) => v.is_premium).length,
    dealers: listCatalogDealerSummaries().length,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    lastCrawlAt: null as string | null,
  };
});

export const submitLeaseQuote = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        vehicleId: z.string().min(1),
        customerName: z.string().min(1).max(120),
        customerEmail: z.string().email(),
        customerPhone: z.string().max(40).optional(),
        notes: z.string().max(1000).optional(),
        source: z.enum(["lease_quote", "apply_now", "dealer_application"]).optional(),
        application: z
          .object({
            address: z.string().max(200).optional(),
            city: z.string().max(80).optional(),
            province: z.string().max(40).optional(),
            postalCode: z.string().max(20).optional(),
            employer: z.string().max(120).optional(),
            occupation: z.string().max(120).optional(),
            annualIncome: z.string().max(40).optional(),
            sinLast4: z.string().max(4).optional(),
            consentCredit: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const settings = loadQuoteSettings();
    const v = getCatalogVehicleById(data.vehicleId, settings);
    if (!v) throw new Error("Vehicle not found");

    const quote = calculateLease(v.price_cents, settings);
    const handoff = await handoffLeaseToCrm({
      vehicleId: v.id,
      vehicleLabel: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "),
      dealerName: v.dealer_name || "",
      quote,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      notes: data.notes,
      source: data.source || "apply_now",
      application: data.application,
    });

    return {
      leadId: handoff.referenceId,
      quote,
      vehicleLabel: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "),
      handoff,
    };
  });

/** CRM leads live in the separate CRM project — not stored here. */
export const getCrmLeads = createServerFn({ method: "GET" }).handler(async () => {
  return [] as const;
});

export const setLeadStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        status: z.enum(["new", "contacted", "qualified", "won", "lost"]),
      })
      .parse(input),
  )
  .handler(async () => {
    return { ok: false as const, message: "CRM lives in a separate project." };
  });

export const triggerCrawl = createServerFn({ method: "POST" }).handler(async () => {
  // No crawler DB on the marketing site — inventory is curated in seed.
  const list = listCatalogVehicles(loadQuoteSettings());
  return {
    runId: 0,
    status: "completed" as const,
    dealersScanned: listCatalogDealerSummaries().length,
    listingsFound: list.length,
    added: 0,
    updated: 0,
    removed: 0,
    mode: "static" as const,
  };
});

export const getRecentCrawlRuns = createServerFn({ method: "GET" }).handler(async () => {
  return [] as const;
});
