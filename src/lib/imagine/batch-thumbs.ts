/**
 * Generate Imagine studio tiles.
 * Default: any live car that still shows a dealer photo (not a data:image studio tile).
 */
import { getSql } from "@/lib/db";
import { generateVehicleThumbnail } from "./generate-thumb";
import { isEphemeralImagineUrl, isStudioThumbUrl } from "./persist-image";
import { parsePhotos, parseSpecs } from "@/lib/leasing/types";
import { selectImagineRefs, listingPhotosInDealerOrder } from "@/lib/leasing/gallery";
import { fetchListingGallery } from "@/lib/leasing/fetch-listing-gallery";
import {
  isPlaceholderListing,
  listingHasActualDealerPhotos,
} from "@/lib/imagine/thumb-source";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";

export async function generateMissingImagineThumbs(opts?: {
  limit?: number;
  force?: boolean;
  /** Case-insensitive substring against year/make/model/trim. */
  match?: string;
}): Promise<{
  attempted: number;
  succeeded: number;
  skipped: number;
  remaining: number;
  errors: string[];
  hasApiKey: boolean;
}> {
  const hasApiKey = Boolean(process.env.XAI_API_KEY?.trim());
  if (!hasApiKey) {
    return {
      attempted: 0,
      succeeded: 0,
      skipped: 0,
      remaining: 0,
      errors: ["XAI_API_KEY is not set on this deployment"],
      hasApiKey: false,
    };
  }

  const force = Boolean(opts?.force);
  const match = opts?.match?.trim() || "";
  const limit = Math.min(opts?.limit ?? (match ? 8 : force ? 12 : 40), match ? 15 : force ? 25 : 60);

  const sql = await getSql();
  await ensurePortalSchema();
  const like = match ? `%${match}%` : "";
  const rows = match
    ? await sql<{
        id: string;
        year: number;
        make: string;
        model: string;
        trim: string;
        exterior_color: string;
        interior_color: string;
        body_style: string;
        thumbnail_url: string;
        photo_urls: string;
        dealership_id: string;
        thumbnail_source: string;
        specs_json: string;
      }>`
        select id, year, make, model, trim, exterior_color, interior_color, body_style, thumbnail_url, photo_urls, price_cents, dealership_id,
               coalesce(thumbnail_source, '') as thumbnail_source, specs_json
        from vehicles
        where status = 'active'
          and (
            make ilike ${like}
            or model ilike ${like}
            or coalesce(trim, '') ilike ${like}
            or (cast(year as text) || ' ' || make || ' ' || model || ' ' || coalesce(trim, '')) ilike ${like}
          )
        order by price_cents desc
        limit 80
      `
    : await sql<{
        id: string;
        year: number;
        make: string;
        model: string;
        trim: string;
        exterior_color: string;
        interior_color: string;
        body_style: string;
        thumbnail_url: string;
        photo_urls: string;
        dealership_id: string;
        thumbnail_source: string;
        specs_json: string;
      }>`
        select id, year, make, model, trim, exterior_color, interior_color, body_style, thumbnail_url, photo_urls, price_cents, dealership_id,
               coalesce(thumbnail_source, '') as thumbnail_source, specs_json
        from vehicles
        where status = 'active'
        order by price_cents desc
        limit 800
      `;

  const withRefs = rows.filter((r) => {
    const photos = parsePhotos(r.photo_urls);
    return (
      photos.some((p) => /^https?:\/\//i.test(p) && !isEphemeralImagineUrl(p)) ||
      (/^https?:\/\//i.test(r.thumbnail_url || "") && !isEphemeralImagineUrl(r.thumbnail_url))
    );
  });

  // Studio tile = persisted data URI. Dealer HTTP photos are fallbacks, not finished tiles.
  // `match` always re-renders (prompt fixes).
  const needsRender = withRefs.filter((r) => {
    if (force || match) return true;
    if (!isStudioThumbUrl(r.thumbnail_url)) return true;
    if (r.thumbnail_source !== "inferred") return false;
    const placeholder = isPlaceholderListing(r.specs_json);
    return listingHasActualDealerPhotos(parsePhotos(r.photo_urls), {
      placeholder,
      source: parseSpecs(r.specs_json).source,
    });
  });

  const need = needsRender.slice(0, limit);

  let succeeded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of need) {
    const photos = parsePhotos(r.photo_urls);
    const placeholder = isPlaceholderListing(r.specs_json);
    const actual = listingHasActualDealerPhotos(photos, {
      placeholder,
      source: parseSpecs(r.specs_json).source,
    });
    const pool = [
      ...photos,
      ...(r.thumbnail_url?.startsWith("http") && !isEphemeralImagineUrl(r.thumbnail_url)
        ? [r.thumbnail_url]
        : []),
    ];
    if (!selectImagineRefs(pool, { limit: 1 }).length) {
      skipped += 1;
      continue;
    }

    try {
      const imag = await generateVehicleThumbnail({
        car: {
          year: Number(r.year),
          make: r.make,
          model: r.model,
          trim: r.trim,
          exteriorColor: r.exterior_color,
          interiorColor: r.interior_color,
          bodyStyle: r.body_style,
        },
        referencePhotoUrls: pool,
        listingPhotosArePlaceholder: placeholder || !actual,
      });

      if (imag.ok && imag.url && isStudioThumbUrl(imag.url)) {
        const source = imag.source || (actual && imag.mode === "edit" ? "photographed" : "inferred");
        await sql`
          update vehicles
          set thumbnail_url = ${imag.url},
              thumbnail_source = ${source},
              updated_at = now()
          where id = ${r.id}
        `;
        succeeded += 1;
      } else {
        errors.push(`${r.make} ${r.model}: ${imag.error || "no studio image"}`);
      }
    } catch (err) {
      errors.push(
        `${r.make} ${r.model}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200),
      );
    }
  }

  const remaining = Math.max(0, needsRender.length - succeeded);

  return {
    attempted: need.length,
    succeeded,
    skipped,
    remaining,
    errors: errors.slice(0, 12),
    hasApiKey: true,
  };
}

/** Replace one vehicle's studio tile. Does not run on crawl or page load. */
export async function generateVehicleThumbById(vehicleId: string): Promise<{
  ok: boolean;
  hasApiKey: boolean;
  error?: string;
  updatedAt?: string;
  source?: "photographed" | "inferred";
}> {
  const hasApiKey = Boolean(process.env.XAI_API_KEY?.trim());
  if (!hasApiKey) {
    return { ok: false, hasApiKey: false, error: "XAI_API_KEY is not set on this deployment" };
  }
  const id = vehicleId.trim();
  if (!id) return { ok: false, hasApiKey: true, error: "Missing vehicle" };

  const sql = await getSql();
  await ensurePortalSchema();
  const rows = await sql<{
    id: string;
    year: number;
    make: string;
    model: string;
    trim: string;
    exterior_color: string;
    interior_color: string;
    body_style: string;
    thumbnail_url: string;
    photo_urls: string;
    dealer_listing_url: string;
    specs_json: string;
  }>`
    select id, year, make, model, trim, exterior_color, interior_color, body_style,
           thumbnail_url, photo_urls, dealer_listing_url, specs_json
    from vehicles
    where id = ${id} and status = 'active'
    limit 1
  `;
  const r = rows[0];
  if (!r) return { ok: false, hasApiKey: true, error: "Vehicle not found" };

  const stored = parsePhotos(r.photo_urls);
  let photos = stored;
  // Only scrape the VDP if we have no usable listing photos (keeps re-render ~15–20s).
  const haveListing = listingPhotosInDealerOrder(stored, 4).length > 0;
  if (!haveListing && r.dealer_listing_url?.startsWith("http")) {
    const live = await Promise.race([
      fetchListingGallery(r.dealer_listing_url, { limit: 12 }),
      new Promise<{ photos: string[] }>((resolve) =>
        setTimeout(() => resolve({ photos: [] }), 6_000),
      ),
    ]);
    if (live.photos.length) photos = [...live.photos, ...stored];
  }
  const ordered = listingPhotosInDealerOrder(photos, 16);
  if (selectImagineRefs(ordered, { limit: 1 }).length === 0) {
    return {
      ok: false,
      hasApiKey: true,
      error: "No listing photos to render from (chrome/stock skipped)",
    };
  }

  if (ordered.length) {
    await sql`
      update vehicles
      set photo_urls = ${JSON.stringify(ordered)},
          updated_at = now()
      where id = ${r.id}
    `;
  }

  const imag = await generateVehicleThumbnail({
    car: {
      year: Number(r.year),
      make: r.make,
      model: r.model,
      trim: r.trim,
      exteriorColor: r.exterior_color,
      interiorColor: r.interior_color,
      bodyStyle: r.body_style,
    },
    referencePhotoUrls: ordered,
    listingPhotosArePlaceholder: false,
  });
  if (!imag.ok || !imag.url || !isStudioThumbUrl(imag.url)) {
    return { ok: false, hasApiKey: true, error: imag.error || "Imagine returned no studio image" };
  }

  const now = new Date().toISOString();
  await sql`
    update vehicles
    set thumbnail_url = ${imag.url},
        thumbnail_source = ${"photographed"},
        updated_at = now()
    where id = ${r.id}
  `;
  return { ok: true, hasApiKey: true, updatedAt: now, source: "photographed" };
}
