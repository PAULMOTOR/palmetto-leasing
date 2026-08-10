import { getSql } from "@/lib/db";
import {
  BASE_INVENTORY,
  DEALERS,
  PREMIUM_MIN_CENTS,
  dealerListingUrl,
  slugifyVehicle,
  type SeedVehicle,
} from "@/lib/leasing/seed";
import { fetchDealerInventory } from "./fetch-dealer";

const PREMIUM_THRESHOLD_CENTS = PREMIUM_MIN_CENTS;
const POOL_VERSION = "5-neon-live"; // bump to re-sync dealer seed rows

let seedChain: Promise<unknown> = Promise.resolve();
function enqueueSeed<T>(fn: () => Promise<T>): Promise<T> {
  const next = seedChain.then(fn, fn);
  seedChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export type CrawlResult = {
  runId: number;
  status: "completed" | "failed";
  dealersScanned: number;
  listingsFound: number;
  added: number;
  updated: number;
  removed: number;
  sources?: Record<string, string>;
  notes?: string[];
};

/**
 * Crawl active dealership inventory URLs → Neon (or PGLite fallback).
 * Live HTTP first; curated seed fills gaps when sites block bots.
 */
export async function runInventoryCrawl(opts?: { forceIncludeAll?: boolean }) {
  return enqueueSeed(() => runInventoryCrawlInner(opts));
}

async function runInventoryCrawlInner(opts?: { forceIncludeAll?: boolean }): Promise<CrawlResult> {
  const sql = await getSql();

  const runRows = await sql<{ id: number }>`
    insert into crawl_runs (status) values ('running') returning id
  `;
  const runId = Number(runRows[0]!.id);

  let added = 0;
  let updated = 0;
  let removed = 0;
  let listingsFound = 0;
  const sources: Record<string, string> = {};
  const notes: string[] = [];

  try {
    const ver = await sql<{ value: string }>`
      select value from app_meta where key = 'pool_version' limit 1
    `;
    const needsPoolSync = ver[0]?.value !== POOL_VERSION;

    for (const d of DEALERS) {
      if (needsPoolSync) {
        await sql`
          insert into dealerships (id, name, city, province, brands, website_url, inventory_url, active)
          values (
            ${d.id}, ${d.name}, ${d.city}, ${d.province}, ${d.brands},
            ${d.website_url}, ${d.inventory_url}, ${d.active}
          )
          on conflict (id) do update set
            name = excluded.name,
            city = excluded.city,
            province = excluded.province,
            brands = excluded.brands,
            website_url = excluded.website_url,
            inventory_url = excluded.inventory_url,
            active = excluded.active
        `;
      } else {
        await sql`
          insert into dealerships (id, name, city, province, brands, website_url, inventory_url, active)
          values (
            ${d.id}, ${d.name}, ${d.city}, ${d.province}, ${d.brands},
            ${d.website_url}, ${d.inventory_url}, ${d.active}
          )
          on conflict (id) do update set
            name = excluded.name,
            city = excluded.city,
            province = excluded.province,
            brands = excluded.brands
        `;
      }
    }

    if (needsPoolSync) {
      await sql`
        insert into app_meta (key, value, updated_at)
        values ('pool_version', ${POOL_VERSION}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
    }

    const activeDealers = await sql<{ id: string; inventory_url: string; name: string }>`
      select id, inventory_url, name from dealerships where active = true
    `;
    const activeIds = new Set(activeDealers.map((d) => d.id));

    const liveFeed: SeedVehicle[] = [];
    for (const d of activeDealers) {
      const result = await fetchDealerInventory(d.id, d.inventory_url);
      sources[d.id] = result.source;
      notes.push(`${d.name}: ${result.source} · ${result.items.length} · ${result.notes.join("; ")}`);
      liveFeed.push(...result.items.filter((v) => v.price_cents >= PREMIUM_THRESHOLD_CENTS));
    }

    // Safety net: if crawl completely empty, force full seed
    if (liveFeed.length === 0 || opts?.forceIncludeAll) {
      const seedAll = BASE_INVENTORY.filter(
        (v) => activeIds.has(v.dealership_id) && v.price_cents >= PREMIUM_THRESHOLD_CENTS,
      );
      const keys = new Set(liveFeed.map((v) => `${v.dealership_id}::${v.external_id}`));
      for (const s of seedAll) {
        const k = `${s.dealership_id}::${s.external_id}`;
        if (!keys.has(k)) liveFeed.push(s);
      }
      notes.push(`Seed safety net applied · feed size ${liveFeed.length}`);
    }

    listingsFound = liveFeed.length;
    const seenExternal = new Set<string>();

    for (const item of liveFeed) {
      const key = `${item.dealership_id}::${item.external_id}`;
      seenExternal.add(key);
      const result = await upsertVehicle(sql, item, runId);
      if (result === "added") added += 1;
      else if (result === "updated") updated += 1;
    }

    const active = await sql<{ id: string; dealership_id: string; external_id: string }>`
      select id, dealership_id, external_id from vehicles where status = 'active'
    `;
    for (const row of active) {
      if (!activeIds.has(row.dealership_id)) {
        await sql`
          update vehicles
          set status = 'removed', removed_at = now(), updated_at = now()
          where id = ${row.id}
        `;
        removed += 1;
        continue;
      }
      const key = `${row.dealership_id}::${row.external_id}`;
      if (seenExternal.has(key)) continue;
      await sql`
        update vehicles
        set status = 'removed', removed_at = now(), updated_at = now()
        where id = ${row.id}
      `;
      await sql`
        insert into crawl_events (crawl_run_id, dealership_id, vehicle_id, event_type, detail)
        values (${runId}, ${row.dealership_id}, ${row.id}, 'removed', 'Listing no longer in crawl feed')
      `;
      removed += 1;
    }

    const now = new Date();
    await sql`
      update crawl_runs set
        finished_at = now(),
        status = 'completed',
        dealers_scanned = ${activeDealers.length},
        listings_found = ${listingsFound},
        added = ${added},
        updated = ${updated},
        removed = ${removed}
      where id = ${runId}
    `;

    await sql`
      insert into app_meta (key, value, updated_at)
      values ('last_crawl_at', ${now.toISOString()}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;

    return {
      runId,
      status: "completed",
      dealersScanned: activeDealers.length,
      listingsFound,
      added,
      updated,
      removed,
      sources,
      notes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      update crawl_runs set
        finished_at = now(),
        status = 'failed',
        error_message = ${message},
        dealers_scanned = 0,
        listings_found = ${listingsFound},
        added = ${added},
        updated = ${updated},
        removed = ${removed}
      where id = ${runId}
    `;
    throw err;
  }
}

type Sql = Awaited<ReturnType<typeof getSql>>;

async function upsertVehicle(
  sql: Sql,
  item: SeedVehicle,
  runId: number,
): Promise<"added" | "updated"> {
  const id = `${item.dealership_id}_${item.external_id}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const slug = slugifyVehicle(item);
  const isPremium = item.price_cents >= PREMIUM_THRESHOLD_CENTS;
  const listingUrl = item.listing_path.startsWith("http")
    ? item.listing_path
    : dealerListingUrl(item.dealership_id, item.listing_path);
  const specsJson = JSON.stringify(item.specs);
  const photosJson = JSON.stringify(item.photos.length ? item.photos : [item.thumbnail]);
  const thumbnail = item.thumbnail;

  const existing = await sql<{ id: string }>`
    select id from vehicles where id = ${id} limit 1
  `;
  const isNew = existing.length === 0;

  await sql`
    insert into vehicles (
      id, dealership_id, external_id, slug, year, make, model, trim,
      body_style, exterior_color, interior_color, mileage, price_cents,
      currency, vin, stock_number, description, specs_json, thumbnail_url,
      photo_urls, dealer_listing_url, status, is_premium,
      first_seen_at, last_seen_at, updated_at
    ) values (
      ${id}, ${item.dealership_id}, ${item.external_id}, ${slug},
      ${item.year}, ${item.make}, ${item.model}, ${item.trim},
      ${item.body_style}, ${item.exterior_color}, ${item.interior_color},
      ${item.mileage}, ${item.price_cents}, 'CAD', ${item.vin},
      ${item.stock_number}, ${item.description}, ${specsJson}, ${thumbnail},
      ${photosJson}, ${listingUrl}, 'active', ${isPremium},
      now(), now(), now()
    )
    on conflict (id) do update set
      year = excluded.year,
      make = excluded.make,
      model = excluded.model,
      trim = excluded.trim,
      body_style = excluded.body_style,
      exterior_color = excluded.exterior_color,
      interior_color = excluded.interior_color,
      mileage = excluded.mileage,
      price_cents = excluded.price_cents,
      vin = excluded.vin,
      stock_number = excluded.stock_number,
      description = excluded.description,
      specs_json = excluded.specs_json,
      thumbnail_url = excluded.thumbnail_url,
      photo_urls = excluded.photo_urls,
      dealer_listing_url = excluded.dealer_listing_url,
      status = 'active',
      is_premium = excluded.is_premium,
      removed_at = null,
      last_seen_at = now(),
      updated_at = now()
  `;

  await sql`
    insert into crawl_events (crawl_run_id, dealership_id, vehicle_id, event_type, detail)
    values (
      ${runId},
      ${item.dealership_id},
      ${id},
      ${isNew ? "added" : "updated"},
      ${isNew ? `${item.year} ${item.make} ${item.model}` : `Price ${item.price_cents}`}
    )
  `;
  return isNew ? "added" : "updated";
}

export async function ensureSeededInventory() {
  return enqueueSeed(async () => {
    const sql = await getSql();
    const rows = await sql<{ c: number }>`select count(*)::int as c from vehicles where status = 'active'`;
    const count = Number(rows[0]?.c ?? 0);
    if (count > 0) {
      const ver = await sql<{ value: string }>`
        select value from app_meta where key = 'pool_version' limit 1
      `;
      if (ver[0]?.value !== POOL_VERSION) {
        return runInventoryCrawlInner({ forceIncludeAll: true });
      }
      return { seeded: false as const, count };
    }
    const result = await runInventoryCrawlInner({ forceIncludeAll: true });
    return { seeded: true as const, ...result };
  });
}
