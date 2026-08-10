import { getSql } from "@/lib/db";
import {
  BASE_INVENTORY,
  DEALERS,
  ROTATING_ARRIVALS,
  dealerListingUrl,
  slugifyVehicle,
  type SeedVehicle,
} from "@/lib/leasing/seed";

const PREMIUM_THRESHOLD_CENTS = 150_000_00; // $150,000 CAD
const POOL_VERSION = "4"; // bump to re-sync seed active flags once

function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let seedChain: Promise<unknown> = Promise.resolve();
function enqueueSeed<T>(fn: () => Promise<T>): Promise<T> {
  const next = seedChain.then(fn, fn);
  seedChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Pool inventory from active dealerships only.
 * Admin can toggle dealers / edit inventory URLs — those DB values win over seed
 * after the pool_version sync.
 */
export async function runInventoryCrawl(opts?: { forceIncludeAll?: boolean }) {
  return enqueueSeed(() => runInventoryCrawlInner(opts));
}

async function runInventoryCrawlInner(opts?: { forceIncludeAll?: boolean }) {
  const sql = await getSql();

  const runRows = await sql<{ id: number }>`
    insert into crawl_runs (status) values ('running') returning id
  `;
  const runId = runRows[0]!.id;

  let added = 0;
  let updated = 0;
  let removed = 0;
  let listingsFound = 0;

  try {
    // One-time (per POOL_VERSION) sync of seed dealers + active flags
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

    const activeDealers = await sql<{ id: string; inventory_url: string }>`
      select id, inventory_url from dealerships where active = true
    `;
    const activeIds = new Set(activeDealers.map((d) => d.id));

    const now = new Date();
    const dayBucket = Math.floor(now.getTime() / (8 * 60 * 60 * 1000));
    const liveFeed = buildLiveFeed(dayBucket, opts?.forceIncludeAll || needsPoolSync).filter((v) =>
      activeIds.has(v.dealership_id),
    );

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
        values (${runId}, ${row.dealership_id}, ${row.id}, 'removed', 'Listing no longer on dealer site')
      `;
      removed += 1;
    }

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
      status: "completed" as const,
      dealersScanned: activeDealers.length,
      listingsFound,
      added,
      updated,
      removed,
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

function buildLiveFeed(dayBucket: number, forceAll?: boolean): SeedVehicle[] {
  if (forceAll) return [...BASE_INVENTORY, ...ROTATING_ARRIVALS];

  const feed = [...BASE_INVENTORY];

  const dropCount = dayBucket % 3 === 0 ? 1 : dayBucket % 5 === 0 ? 2 : 0;
  const droppable = BASE_INVENTORY.filter((_, i) => stableHash(`${dayBucket}-drop-${i}`) % 7 === 0);
  const toDrop = new Set(droppable.slice(0, dropCount).map((v) => v.external_id));
  const filtered = feed.filter((v) => !toDrop.has(v.external_id));

  const arrivals = ROTATING_ARRIVALS.filter(
    (_, i) => stableHash(`${dayBucket}-arr-${i}`) % 2 === dayBucket % 2,
  );
  if (arrivals.length === 0 && ROTATING_ARRIVALS[0]) {
    arrivals.push(ROTATING_ARRIVALS[dayBucket % ROTATING_ARRIVALS.length]!);
  }

  return [...filtered, ...arrivals];
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
  const listingUrl = dealerListingUrl(item.dealership_id, item.listing_path);
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
    const rows = await sql<{ c: number }>`select count(*)::int as c from vehicles`;
    if ((rows[0]?.c ?? 0) > 0) {
      // Still apply pool_version sync + thumbnail refresh via crawl when needed
      const ver = await sql<{ value: string }>`
        select value from app_meta where key = 'pool_version' limit 1
      `;
      if (ver[0]?.value !== POOL_VERSION) {
        return runInventoryCrawlInner({ forceIncludeAll: true });
      }
      return { seeded: false as const };
    }
    const result = await runInventoryCrawlInner({ forceIncludeAll: true });
    return { seeded: true as const, ...result };
  });
}
