import { getSql } from "@/lib/db";
import {
  BASE_INVENTORY,
  DEALERS,
  PREMIUM_MIN_CENTS,
  RETIRED_DEALER_IDS,
  dealerListingUrl,
  slugifyVehicle,
  type SeedVehicle,
} from "@/lib/leasing/seed";
import { fetchDealerInventory } from "./fetch-dealer";
import { generateVehicleThumbnail } from "@/lib/imagine/generate-thumb";
import { isEphemeralImagineUrl, isStudioThumbUrl } from "@/lib/imagine/persist-image";
import {
  isPlaceholderListing,
  listingHasActualDealerPhotos,
} from "@/lib/imagine/thumb-source";
import { listingFingerprint } from "./parse-vehicles";
import { parsePhotos, parseSpecs } from "@/lib/leasing/types";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { sweepDeadListings } from "./dead-listings";

const PREMIUM_THRESHOLD_CENTS = PREMIUM_MIN_CENTS;
const POOL_VERSION = "11-paul-motor-co";
const MAX_IMAGINE_PER_CRAWL = Number(process.env.IMAGINE_MAX_PER_CRAWL || 20);

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
  imagined?: number;
  sources?: Record<string, string>;
  notes?: string[];
};

export async function runInventoryCrawl(opts?: {
  forceIncludeAll?: boolean;
  generateThumbs?: boolean;
  dealerIds?: string[];
}) {
  return enqueueSeed(() => runInventoryCrawlInner(opts));
}

async function purgeRetiredDealers(sql: Awaited<ReturnType<typeof getSql>>, notes: string[]) {
  for (const id of RETIRED_DEALER_IDS) {
    const v = await sql<{ c: number }>`
      select count(*)::int as c from vehicles where dealership_id = ${id}
    `;
    const d = await sql<{ c: number }>`
      select count(*)::int as c from dealerships where id = ${id}
    `;
    const vc = Number(v[0]?.c ?? 0);
    const dc = Number(d[0]?.c ?? 0);
    if (vc === 0 && dc === 0) continue;

    // Hard delete events first if FK, then vehicles, then dealer
    try {
      await sql`delete from crawl_events where dealership_id = ${id}`;
    } catch {
      /* table may not have rows / FK */
    }
    await sql`delete from vehicles where dealership_id = ${id}`;
    await sql`delete from dealerships where id = ${id}`;
    notes.push(`Permanently deleted retired dealer ${id} (${vc} vehicles)`);
  }
}

async function runInventoryCrawlInner(opts?: {
  forceIncludeAll?: boolean;
  generateThumbs?: boolean;
  dealerIds?: string[];
}): Promise<CrawlResult> {
  const sql = await getSql();
  const wantThumbs = opts?.generateThumbs !== false;
  await ensurePortalSchema();

  const runRows = await sql<{ id: number }>`
    insert into crawl_runs (status) values ('running') returning id
  `;
  const runId = Number(runRows[0]!.id);

  let added = 0;
  let updated = 0;
  let removed = 0;
  let listingsFound = 0;
  let imagined = 0;
  const sources: Record<string, string> = {};
  const notes: string[] = [];

  try {
    // Always purge the original 12 built-in dealers
    await purgeRetiredDealers(sql, notes);

    // Rewrite stale Sigma /autos/:slug listing URLs (404) → /inventory/:slug
    await sql`
      update vehicles
      set dealer_listing_url = replace(dealer_listing_url, '/autos/', '/inventory/'),
          updated_at = now()
      where dealer_listing_url like '%sigmaautomotive.ca/autos/%'
    `;
    await sql`
      update dealerships
      set name = 'Paul Motor Co.'
      where id = 'paul-motor' and name <> 'Paul Motor Co.'
    `;
    // One-shot: GCL tiles were rendered from flag / body-style chrome. Drop those
    // studio thumbs so the next Imagine pass uses real /products/ listing photos.
    const gclRev = await sql<{ value: string }>`
      select value from app_meta where key = 'gcl_imagine_rev' limit 1
    `;
    if (gclRev[0]?.value !== "2") {
      await sql`
        update vehicles
        set thumbnail_url = '', updated_at = now()
        where thumbnail_url like 'data:image/%'
          and (
            dealership_id like '%gcl%'
            or dealer_listing_url like '%gclcars.ca%'
          )
      `;
      await sql`
        insert into app_meta (key, value, updated_at)
        values ('gcl_imagine_rev', '2', now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
      notes.push("Reset GCL Imagine tiles so they re-render from listing photos");
    }

    // One-shot: Lease Sniper tiles mixed theme icons + other cars from VDP HTML.
    const lsRev = await sql<{ value: string }>`
      select value from app_meta where key = 'leasesniper_imagine_rev' limit 1
    `;
    if (lsRev[0]?.value !== "1") {
      await sql`
        update vehicles
        set thumbnail_url = '', updated_at = now()
        where dealer_listing_url like '%leasesniper.ca%'
          and thumbnail_url like 'data:image/%'
      `;
      await sql`
        insert into app_meta (key, value, updated_at)
        values ('leasesniper_imagine_rev', '1', now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
      notes.push("Reset Lease Sniper Imagine tiles so they re-render from listing photos");
    }

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

    const activeDealers = await sql<{
      id: string;
      inventory_url: string;
      name: string;
      website_url: string;
    }>`
      select id, inventory_url, name, website_url from dealerships where active = true
    `;
    // Never crawl retired IDs even if somehow still present
    const retired = new Set<string>(RETIRED_DEALER_IDS as unknown as string[]);
    const only = (opts?.dealerIds || []).filter(Boolean);
    const crawlDealers = activeDealers.filter((d) => {
      if (retired.has(d.id)) return false;
      if (only.length) return only.includes(d.id);
      return true;
    });
    const partial = only.length > 0;
    const activeIds = new Set(
      (partial ? activeDealers : crawlDealers).filter((d) => !retired.has(d.id)).map((d) => d.id),
    );

    const liveFeed: SeedVehicle[] = [];
    for (const d of crawlDealers) {
      const result = await fetchDealerInventory(d.id, d.inventory_url, {
        name: d.name,
        websiteUrl: d.website_url,
      });
      sources[d.id] = result.source;
      notes.push(`${d.name}: ${result.source} · ${result.items.length} · ${result.notes.join("; ")}`);
      liveFeed.push(...result.items.filter((v) => v.price_cents >= PREMIUM_THRESHOLD_CENTS));
    }

    const globalSeen = new Set<string>();
    const uniqueFeed: SeedVehicle[] = [];
    for (const item of liveFeed) {
      if (retired.has(item.dealership_id)) continue;
      const fp = listingFingerprint({
        vin: item.vin,
        stock: item.stock_number,
        url: item.listing_path,
        year: item.year,
        make: item.make,
        model: item.model,
        trim: item.trim,
        priceCents: item.price_cents,
        mileage: item.mileage,
      });
      const soft = `${item.dealership_id}|${item.year}|${item.make}|${item.model}|${item.price_cents}|${item.mileage}`
        .toUpperCase()
        .replace(/\s+/g, "");
      if (globalSeen.has(fp) || globalSeen.has(soft)) continue;
      globalSeen.add(fp);
      globalSeen.add(soft);
      uniqueFeed.push(item);
    }
    if (uniqueFeed.length < liveFeed.length) {
      notes.push(`Dedupe removed ${liveFeed.length - uniqueFeed.length} duplicate listings`);
    }

    if (uniqueFeed.length === 0) {
      notes.push("No live ≥$150k inventory returned — catalog empty until partners are fixed");
    }

    listingsFound = uniqueFeed.length;
    const seenExternal = new Set<string>();

    for (const item of uniqueFeed) {
      const key = `${item.dealership_id}::${item.external_id}`;
      seenExternal.add(key);
      const result = await upsertVehicle(sql, item, runId);
      if (result === "added") added += 1;
      else if (result === "updated") updated += 1;
    }

    if (wantThumbs && process.env.XAI_API_KEY?.trim()) {
      const candidates = await sql<{
        id: string;
        year: number;
        make: string;
        model: string;
        trim: string;
        exterior_color: string;
        interior_color: string;
        body_style: string;
        photo_urls: string;
        thumbnail_url: string;
        thumbnail_source: string;
        specs_json: string;
      }>`
        select id, year, make, model, trim, exterior_color, interior_color, body_style,
               photo_urls, thumbnail_url, coalesce(thumbnail_source, '') as thumbnail_source,
               specs_json
        from vehicles
        where status = 'active'
          and (
            thumbnail_url is null
            or thumbnail_url = ''
            or thumbnail_url not like 'data:image/%'
            or coalesce(thumbnail_source, '') = 'inferred'
          )
        order by
          case when coalesce(thumbnail_source, '') = 'inferred' then 0 else 1 end,
          last_seen_at desc
        limit ${MAX_IMAGINE_PER_CRAWL * 3}
      `;
      const batch = candidates.filter((item) => {
        const placeholder = isPlaceholderListing(item.specs_json);
        const photos = parsePhotos(item.photo_urls);
        const actual = listingHasActualDealerPhotos(photos, {
          placeholder,
          source: parseSpecs(item.specs_json).source,
        });
        const studio = isStudioThumbUrl(item.thumbnail_url);
        const inferred = item.thumbnail_source === "inferred";
        if (inferred && studio) return actual;
        if (!studio) return true;
        return false;
      }).slice(0, MAX_IMAGINE_PER_CRAWL);

      for (const item of batch) {
        const photos = parsePhotos(item.photo_urls);
        const placeholder = isPlaceholderListing(item.specs_json);
        const actual = listingHasActualDealerPhotos(photos, {
          placeholder,
          source: parseSpecs(item.specs_json).source,
        });
        const imag = await generateVehicleThumbnail({
          car: {
            year: item.year,
            make: item.make,
            model: item.model,
            trim: item.trim,
            exteriorColor: item.exterior_color,
            interiorColor: item.interior_color,
            bodyStyle: item.body_style,
          },
          referencePhotoUrls: photos,
          listingPhotosArePlaceholder: placeholder || !actual,
        });
        if (imag.ok && imag.url && isStudioThumbUrl(imag.url)) {
          const source = imag.source || (actual && imag.mode === "edit" ? "photographed" : "inferred");
          await sql`
            update vehicles
            set thumbnail_url = ${imag.url},
                thumbnail_source = ${source},
                updated_at = now()
            where id = ${item.id}
          `;
          imagined += 1;
        } else if (imag.error) {
          notes.push(`Imagine ${item.id}: ${imag.error}`);
        }
      }
      notes.push(
        `Imagine tiles: ${imagined}/${batch.length} (photographed locked; inferred re-rendered only with dealer photos)`,
      );
    } else if (wantThumbs) {
      notes.push("XAI_API_KEY unset — tiles use real dealer photos until Imagine is configured");
    }

    // Remove stale vehicles. Partial crawls only touch the requested dealer(s).
    const active = await sql<{ id: string; dealership_id: string; external_id: string }>`
      select id, dealership_id, external_id from vehicles where status = 'active'
    `;
    for (const row of active) {
      if (retired.has(row.dealership_id) || !activeIds.has(row.dealership_id)) {
        await sql`delete from vehicles where id = ${row.id}`;
        removed += 1;
        continue;
      }
      if (partial && !only.includes(row.dealership_id)) continue;
      const key = `${row.dealership_id}::${row.external_id}`;
      if (seenExternal.has(key)) continue;
      await sql`delete from vehicles where id = ${row.id}`;
      removed += 1;
    }

    const dead = await sweepDeadListings(sql, { limit: 80, concurrency: 6 });
    removed += dead.removed;
    if (dead.removed) {
      notes.push(`Dead listing URLs (404/sold): removed ${dead.removed}/${dead.checked}`);
    }

    // Second pass purge in case anything remains
    await purgeRetiredDealers(sql, notes);

    const now = new Date();
    await sql`
      update crawl_runs set
        finished_at = now(),
        status = 'completed',
        dealers_scanned = ${crawlDealers.length},
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
      dealersScanned: crawlDealers.length,
      listingsFound,
      added,
      updated,
      removed,
      imagined,
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
  const thumbnail = item.thumbnail.startsWith("http")
    ? item.thumbnail
    : item.photos.find((p) => p.startsWith("http")) || item.thumbnail;

  const existing = await sql<{ id: string; thumbnail_url: string; thumbnail_source: string }>`
    select id, thumbnail_url, coalesce(thumbnail_source, '') as thumbnail_source
    from vehicles where id = ${id} limit 1
  `;
  const isNew = existing.length === 0;
  const incomingPlaceholder = isPlaceholderListing(item.specs);
  const incomingActual = listingHasActualDealerPhotos(
    item.photos.length ? item.photos : [item.thumbnail].filter(Boolean),
    { placeholder: incomingPlaceholder, source: item.specs?.source },
  );
  const prevUrl = existing[0]?.thumbnail_url || "";
  const prevSource = existing[0]?.thumbnail_source || "";
  const prevStudio =
    Boolean(prevUrl) &&
    !isEphemeralImagineUrl(prevUrl) &&
    (prevUrl.startsWith("data:image/") || prevUrl.startsWith("http"));

  // Photographed studio tiles stay. Inferred guesses stay until real dealer
  // photography appears — then Imagine replaces them in this same crawl.
  let keepThumb = thumbnail;
  let thumbSource = prevSource;
  if (!isNew && prevUrl.startsWith("data:image/") && !isEphemeralImagineUrl(prevUrl)) {
    if (prevSource === "photographed" || (prevSource === "" && incomingActual)) {
      keepThumb = prevUrl;
      thumbSource = "photographed";
    } else {
      keepThumb = prevUrl;
      thumbSource = "inferred";
    }
  } else if (!isNew && prevStudio) {
    keepThumb = prevUrl.startsWith("data:image/") || prevUrl.startsWith("http") ? prevUrl : thumbnail;
    thumbSource = prevSource || (incomingActual ? "dealer" : "dealer");
  }

  await sql`
    insert into vehicles (
      id, dealership_id, external_id, slug, year, make, model, trim,
      body_style, exterior_color, interior_color, mileage, price_cents,
      currency, vin, stock_number, description, specs_json, thumbnail_url,
      photo_urls, dealer_listing_url, status, is_premium, thumbnail_source,
      first_seen_at, last_seen_at, updated_at
    ) values (
      ${id}, ${item.dealership_id}, ${item.external_id}, ${slug},
      ${item.year}, ${item.make}, ${item.model}, ${item.trim},
      ${item.body_style}, ${item.exterior_color}, ${item.interior_color},
      ${item.mileage}, ${item.price_cents}, 'CAD', ${item.vin},
      ${item.stock_number}, ${item.description}, ${specsJson}, ${keepThumb},
      ${photosJson}, ${listingUrl}, 'active', ${isPremium}, ${thumbSource},
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
      thumbnail_source = excluded.thumbnail_source,
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
      ${isNew ? `LIVE ${item.year} ${item.make} ${item.model}` : `Price ${item.price_cents}`}
    )
  `;
  return isNew ? "added" : "updated";
}

export async function ensureSeededInventory() {
  return enqueueSeed(async () => {
    const sql = await getSql();
    // Always run purge path when pool version changes
    const ver = await sql<{ value: string }>`
      select value from app_meta where key = 'pool_version' limit 1
    `;
    if (ver[0]?.value !== POOL_VERSION) {
      return runInventoryCrawlInner({ forceIncludeAll: false, generateThumbs: false });
    }
    const rows = await sql<{ c: number }>`select count(*)::int as c from vehicles where status = 'active'`;
    const count = Number(rows[0]?.c ?? 0);
    if (count > 0) return { seeded: false as const, count };
    const result = await runInventoryCrawlInner({ forceIncludeAll: false, generateThumbs: true });
    return { seeded: true as const, ...result };
  });
}
