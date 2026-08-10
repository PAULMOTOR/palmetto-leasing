/**
 * Inventory API — Neon when DATABASE_URL set, else PGLite / static catalog fallback.
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
import { ensureSeededInventory, runInventoryCrawl } from "@/lib/crawler/run";
import { getSql, dbSource } from "@/lib/db";
import type { Vehicle, VehicleCard } from "./types";
import { parsePhotos, parseSpecs } from "./types";
import { buildVehicleGalleryPool, selectGalleryPhotos } from "./gallery";
import { fetchListingGallery } from "./fetch-listing-gallery";
import { generateMissingImagineThumbs } from "@/lib/imagine/batch-thumbs";

async function toCard(
  row: Vehicle & { dealer_name?: string; dealer_city?: string; dealer_province?: string },
): Promise<VehicleCard> {
  const settings = loadQuoteSettings();
  const quote = calculateLease(Number(row.price_cents), settings);
  const photos = parsePhotos(row.photo_urls).length
    ? parsePhotos(row.photo_urls)
    : row.thumbnail_url
      ? [row.thumbnail_url]
      : [];
  return {
    ...row,
    price_cents: Number(row.price_cents),
    mileage: Number(row.mileage),
    year: Number(row.year),
    is_premium: Boolean(row.is_premium),
    monthly_payment_cents: quote.monthlyPaymentCents,
    specs: parseSpecs(row.specs_json),
    photos,
  };
}

/** Collapse exact duplicate cards (same dealer + year/make/model + price). */
function dedupeCards(list: VehicleCard[]): VehicleCard[] {
  const seen = new Set<string>();
  const out: VehicleCard[] = [];
  for (const v of list) {
    const key = [
      v.dealership_id,
      v.year,
      v.make,
      v.model,
      v.trim,
      v.price_cents,
      v.mileage,
      v.vin || "",
    ]
      .join("|")
      .toUpperCase()
      .replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export const bootstrapInventory = createServerFn({ method: "POST" }).handler(async () => {
  try {
    return { ...(await ensureSeededInventory()), mode: dbSource };
  } catch (err) {
    return {
      seeded: false as const,
      mode: "static" as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
    const filters = data ?? {};
    let list: VehicleCard[] = [];

    try {
      await ensureSeededInventory();
      const sql = await getSql();
      const rows = await sql<
        Vehicle & { dealer_name: string; dealer_city: string; dealer_province: string }
      >`
        select v.*, d.name as dealer_name, d.city as dealer_city, d.province as dealer_province
        from vehicles v
        join dealerships d on d.id = v.dealership_id
        where v.status = 'active' and d.active = true and v.price_cents >= 15000000
        order by v.price_cents desc
      `;
      list = await Promise.all(rows.map((r) => toCard(r)));
    } catch (err) {
      console.warn("[listVehicles] DB unavailable, static catalog:", err);
      list = listCatalogVehicles(loadQuoteSettings());
    }

    list = dedupeCards(list);

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
    try {
      await ensureSeededInventory();
      const sql = await getSql();
      const rows = await sql<
        Vehicle & { dealer_name: string; dealer_city: string; dealer_province: string }
      >`
        select v.*, d.name as dealer_name, d.city as dealer_city, d.province as dealer_province
        from vehicles v
        join dealerships d on d.id = v.dealership_id
        where v.slug = ${data.slug}
        limit 1
      `;
      if (rows[0]) return toCard(rows[0]);
    } catch {
      /* fall through */
    }
    return getCatalogVehicleBySlug(data.slug, loadQuoteSettings());
  });

export const listDealers = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await ensureSeededInventory();
    const sql = await getSql();
    return sql<{
      id: string;
      name: string;
      city: string;
      province: string;
      brands: string;
      count: number;
    }>`
      select d.id, d.name, d.city, d.province, d.brands,
        (select count(*)::int from vehicles v where v.dealership_id = d.id and v.status = 'active') as count
      from dealerships d
      where d.active = true
      order by d.name
    `;
  } catch {
    return listCatalogDealerSummaries();
  }
});

export const getInventoryStats = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await ensureSeededInventory();
    const sql = await getSql();
    const stats = await sql<{
      total: number;
      premium: number;
      dealers: number;
      min_price: number;
      max_price: number;
    }>`
      select
        (select count(*)::int from vehicles v join dealerships d on d.id = v.dealership_id where v.status = 'active' and d.active = true) as total,
        (select count(*)::int from vehicles v join dealerships d on d.id = v.dealership_id where v.status = 'active' and d.active = true and v.is_premium = true) as premium,
        (select count(*)::int from dealerships where active = true) as dealers,
        coalesce((select min(v.price_cents)::bigint from vehicles v join dealerships d on d.id = v.dealership_id where v.status = 'active' and d.active = true), 0) as min_price,
        coalesce((select max(v.price_cents)::bigint from vehicles v join dealerships d on d.id = v.dealership_id where v.status = 'active' and d.active = true), 0) as max_price
    `;
    const last = await sql<{ value: string }>`
      select value from app_meta where key = 'last_crawl_at' limit 1
    `;
    const s = stats[0]!;
    return {
      total: Number(s.total),
      premium: Number(s.premium),
      dealers: Number(s.dealers),
      minPrice: Number(s.min_price),
      maxPrice: Number(s.max_price),
      lastCrawlAt: last[0]?.value ?? null,
      backend: dbSource,
      hasImagineKey: Boolean(process.env.XAI_API_KEY?.trim()),
    };
  } catch {
    const list = listCatalogVehicles(loadQuoteSettings());
    return {
      total: list.length,
      premium: list.filter((v) => v.is_premium).length,
      dealers: listCatalogDealerSummaries().length,
      minPrice: list.length ? Math.min(...list.map((v) => v.price_cents)) : 0,
      maxPrice: list.length ? Math.max(...list.map((v) => v.price_cents)) : 0,
      lastCrawlAt: null as string | null,
      backend: "static" as const,
      hasImagineKey: Boolean(process.env.XAI_API_KEY?.trim()),
    };
  }
});

export const getVehicleGallery = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        vehicleId: z.string().min(1),
        listingUrl: z.string().optional(),
        make: z.string().optional(),
        model: z.string().optional(),
        existingPhotos: z.array(z.string()).optional(),
        thumbnail: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const localPool = buildVehicleGalleryPool({
      thumbnail_url: data.thumbnail,
      photos: data.existingPhotos,
      make: data.make || "",
      model: data.model || "",
    });

    let live: string[] = [];
    let source = "local";
    if (data.listingUrl?.startsWith("http")) {
      const scraped = await fetchListingGallery(data.listingUrl, { limit: 24 });
      if (scraped.photos.length) {
        live = scraped.photos;
        source = scraped.source;
      }
    }

    const merged = selectGalleryPhotos([...live, ...localPool], {
      limit: 12,
      preferInteriorShare: 0.4,
    });

    return {
      photos: merged,
      source,
      count: merged.length,
      vehicleId: data.vehicleId,
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
        termMonths: z.number().int().min(12).max(72).optional(),
        downPaymentRate: z.number().min(0).max(0.5).optional(),
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
    const settings = {
      ...loadQuoteSettings(),
      ...(data.termMonths ? { termMonths: data.termMonths } : {}),
      ...(typeof data.downPaymentRate === "number"
        ? { downPaymentRate: data.downPaymentRate }
        : {}),
    };
    let vehicleLabel = "";
    let dealerName = "";
    let priceCents = 0;

    try {
      const sql = await getSql();
      const rows = await sql<Vehicle & { dealer_name: string }>`
        select v.*, d.name as dealer_name
        from vehicles v
        join dealerships d on d.id = v.dealership_id
        where v.id = ${data.vehicleId}
        limit 1
      `;
      if (rows[0]) {
        const v = rows[0];
        priceCents = Number(v.price_cents);
        vehicleLabel = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
        dealerName = v.dealer_name;
      }
    } catch {
      /* static */
    }

    if (!priceCents) {
      const v = getCatalogVehicleById(data.vehicleId, settings);
      if (!v) throw new Error("Vehicle not found");
      priceCents = v.price_cents;
      vehicleLabel = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
      dealerName = v.dealer_name || "";
    }

    const quote = calculateLease(priceCents, settings);
    const handoff = await handoffLeaseToCrm({
      vehicleId: data.vehicleId,
      vehicleLabel,
      dealerName,
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
      vehicleLabel,
      handoff,
    };
  });

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
  return runInventoryCrawl({ forceIncludeAll: false, generateThumbs: true });
});

export const triggerImagineThumbs = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
        force: z.boolean().optional(),
      })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    return generateMissingImagineThumbs({
      limit: data?.limit ?? 12,
      force: data?.force ?? true, // default force re-render with locked template
    });
  });

export const getRecentCrawlRuns = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await ensureSeededInventory();
    const sql = await getSql();
    return sql<{
      id: number;
      started_at: string;
      finished_at: string | null;
      status: string;
      dealers_scanned: number;
      listings_found: number;
      added: number;
      updated: number;
      removed: number;
      error_message: string | null;
    }>`
      select * from crawl_runs order by id desc limit 10
    `;
  } catch {
    return [] as const;
  }
});
