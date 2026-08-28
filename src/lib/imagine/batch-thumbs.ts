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
import { STUDIO_PROMPT_REV } from "./thumb-prompt";

export async function generateMissingImagineThumbs(opts?: {
  limit?: number;
  force?: boolean;
  /** Case-insensitive substring against year/make/model/trim. */
  match?: string;
  /** Exact dealership id. Required when force-re-rendering existing tiles. */
  dealer?: string;
}): Promise<{
  attempted: number;
  succeeded: number;
  skipped: number;
  rejected: number;
  remaining: number;
  errors: string[];
  hasApiKey: boolean;
  dealer?: string;
  rev: string;
}> {
  const empty = {
    attempted: 0,
    succeeded: 0,
    skipped: 0,
    rejected: 0,
    remaining: 0,
    errors: [] as string[],
    hasApiKey: false,
    rev: STUDIO_PROMPT_REV,
  };
  const hasApiKey = Boolean(process.env.XAI_API_KEY?.trim());
  if (!hasApiKey) {
    return { ...empty, errors: ["XAI_API_KEY is not set on this deployment"] };
  }

  const force = Boolean(opts?.force);
  const match = opts?.match?.trim() || "";
  const dealer = (opts?.dealer || "").trim().toLowerCase();
  if (dealer && !/^[a-z0-9-]{2,64}$/i.test(dealer)) {
    return { ...empty, hasApiKey: true, errors: ["Invalid dealer"] };
  }
  if (force && !dealer && !match) {
    return {
      ...empty,
      hasApiKey: true,
      errors: ["Pick a dealer — refusing to re-render the whole catalog"],
    };
  }
  const limit = Math.min(opts?.limit ?? 3, 4);

  const sql = await getSql();
  await ensurePortalSchema();
  const like = match ? `%${match}%` : "";
  const rowType = {} as {
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
    dealer_listing_url: string;
    thumbnail_source: string;
    specs_json: string;
  };
  void rowType;
  const clauses = ["status = 'active'"];
  const params: unknown[] = [];
  if (dealer) {
    params.push(dealer);
    clauses.push(`dealership_id = $${params.length}`);
  }
  if (like) {
    params.push(like);
    const p = `$${params.length}`;
    clauses.push(
      `(make ilike ${p} or model ilike ${p} or coalesce(trim, '') ilike ${p} or (cast(year as text) || ' ' || make || ' ' || model || ' ' || coalesce(trim, '')) ilike ${p})`,
    );
  }
  const cap = dealer || match ? 80 : 800;
  params.push(cap);
  const rows = await sql.query<typeof rowType>(
    `select id, year, make, model, trim, exterior_color, interior_color, body_style,
            thumbnail_url, photo_urls, price_cents, dealership_id,
            coalesce(dealer_listing_url, '') as dealer_listing_url,
            coalesce(thumbnail_source, '') as thumbnail_source, specs_json
     from vehicles
     where ${clauses.join(" and ")}
     order by price_cents desc
     limit $${params.length}`,
    params,
  );

  const withRefs = rows.filter((r) => {
    const photos = parsePhotos(r.photo_urls);
    return (
      photos.some((p) => /^https?:\/\//i.test(p) && !isEphemeralImagineUrl(p)) ||
      (/^https?:\/\//i.test(r.thumbnail_url || "") && !isEphemeralImagineUrl(r.thumbnail_url))
    );
  });

  // Missing tiles always render. Stale studio tiles (wrong rev) only when a
  // dealer or match is in hand — never a catalog-wide rewrite.
  const needsRender = withRefs.filter((r) => {
    const specs = parseSpecs(r.specs_json || "{}");
    if (specs.imagineSkip === "1") return false;
    const fails = Number(specs.imagineQaFails || 0);
    if (fails >= 3) return false;
    const studio = isStudioThumbUrl(r.thumbnail_url);
    const current = specs.imagineRev === STUDIO_PROMPT_REV;
    // force = redo this dealer even if the tile already passed the current recipe
    if (!force && studio && current && specs.imagineQa !== "fail") return false;
    if (!studio) return true;
    if (force || match || dealer) return true;
    if (r.thumbnail_source !== "inferred") return false;
    const placeholder = isPlaceholderListing(r.specs_json);
    return listingHasActualDealerPhotos(parsePhotos(r.photo_urls), {
      placeholder,
      source: specs.source,
    });
  });

  const need = needsRender
    .slice()
    .sort((a, b) => {
      const fa = Number(parseSpecs(a.specs_json).imagineQaFails || 0);
      const fb = Number(parseSpecs(b.specs_json).imagineQaFails || 0);
      return fa - fb;
    })
    .slice(0, limit);

  await Promise.all(
    need.map(async (r) => {
      const photos = parsePhotos(r.photo_urls);
      if (listingPhotosInDealerOrder(photos, 8).length >= 3) return;
      if (!r.dealer_listing_url?.startsWith("http")) return;
      const live = await Promise.race([
        fetchListingGallery(r.dealer_listing_url, { limit: 12 }),
        new Promise<{ photos: string[] }>((resolve) =>
          setTimeout(() => resolve({ photos: [] }), 7_000),
        ),
      ]);
      if (!live.photos.length) return;
      const merged = listingPhotosInDealerOrder([...live.photos, ...photos], 16);
      r.photo_urls = JSON.stringify(merged);
      await sql`
        update vehicles
        set photo_urls = ${r.photo_urls}, updated_at = now()
        where id = ${r.id}
      `;
    }),
  );

  let succeeded = 0;
  let skipped = 0;
  let rejected = 0;
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
        const specs = stampImagineSpecs(r.specs_json, { imagineRev: STUDIO_PROMPT_REV, imagineQa: "pass" });
        await sql`
          update vehicles
          set thumbnail_url = ${imag.url},
              thumbnail_source = ${source},
              specs_json = ${specs},
              updated_at = now()
          where id = ${r.id}
        `;
        succeeded += 1;
      } else if (imag.mode === "rejected") {
        rejected += 1;
        const prev = Number(parseSpecs(r.specs_json).imagineQaFails || 0) + 1;
        const specs = stampImagineSpecs(r.specs_json, {
          imagineQa: "fail",
          imagineQaFails: String(prev),
        });
        await sql`
          update vehicles set specs_json = ${specs}, updated_at = now()
          where id = ${r.id}
        `;
        errors.push(`${r.make} ${r.model}: ${imag.error || "QA rejected"}`);
      } else {
        errors.push(`${r.make} ${r.model}: ${imag.error || "no studio image"}`);
        if (/download a listing photo/i.test(imag.error || "")) {
          const specs = stampImagineSpecs(r.specs_json, { imagineSkip: "1" });
          await sql`
            update vehicles set specs_json = ${specs}, updated_at = now()
            where id = ${r.id}
          `;
        }
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
    rejected,
    remaining,
    errors: errors.slice(0, 12),
    hasApiKey: true,
    dealer: dealer || undefined,
    rev: STUDIO_PROMPT_REV,
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
  const thumbHttp =
    r.thumbnail_url?.startsWith("http") && !isEphemeralImagineUrl(r.thumbnail_url)
      ? [r.thumbnail_url]
      : [];
  let photos = [...stored, ...thumbHttp];
  // Scrape the VDP when we don't have a real walkaround (AT SRP is often 1 cover).
  const haveListing = listingPhotosInDealerOrder(photos, 4).length >= 2;
  if (!haveListing && r.dealer_listing_url?.startsWith("http")) {
    const live = await Promise.race([
      fetchListingGallery(r.dealer_listing_url, { limit: 12 }),
      new Promise<{ photos: string[] }>((resolve) =>
        setTimeout(() => resolve({ photos: [] }), 6_000),
      ),
    ]);
    if (live.photos.length) photos = [...live.photos, ...photos];
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
  const specs = stampImagineSpecs(r.specs_json, { imagineRev: STUDIO_PROMPT_REV, imagineQa: "pass" });
  await sql`
    update vehicles
    set thumbnail_url = ${imag.url},
        thumbnail_source = ${"photographed"},
        specs_json = ${specs},
        updated_at = now()
    where id = ${r.id}
  `;
  return { ok: true, hasApiKey: true, updatedAt: now, source: "photographed" };
}

function isJpegDataUri(s: string): boolean {
  return (
    typeof s === "string" &&
    s.length > 800 &&
    s.length < 900_000 &&
    /^data:image\/jpe?g;base64,/i.test(s)
  );
}

export async function generateVehicleThumbFromUploads(
  vehicleId: string,
  uploads: { front: string; rear: string; interior: string },
): Promise<{
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
  if (!isJpegDataUri(uploads.front) || !isJpegDataUri(uploads.rear) || !isJpegDataUri(uploads.interior)) {
    return { ok: false, hasApiKey: true, error: "Need three JPEG uploads (front, rear, seats)" };
  }

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
    specs_json: string;
  }>`
    select id, year, make, model, trim, exterior_color, interior_color, body_style, specs_json
    from vehicles
    where id = ${vehicleId.trim()} and status = 'active'
    limit 1
  `;
  const r = rows[0];
  if (!r) return { ok: false, hasApiKey: true, error: "Vehicle not found" };

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
    identityDataUris: uploads,
    listingPhotosArePlaceholder: false,
  });
  if (!imag.ok || !imag.url || !isStudioThumbUrl(imag.url)) {
    return { ok: false, hasApiKey: true, error: imag.error || "Imagine returned no studio image" };
  }

  const now = new Date().toISOString();
  const specs = stampImagineSpecs(r.specs_json, { imagineRev: STUDIO_PROMPT_REV, imagineQa: "pass" });
  await sql`
    update vehicles
    set thumbnail_url = ${imag.url},
        thumbnail_source = ${"photographed"},
        specs_json = ${specs},
        updated_at = now()
    where id = ${r.id}
  `;
  return { ok: true, hasApiKey: true, updatedAt: now, source: "photographed" };
}

function stampImagineSpecs(
  raw: string | null | undefined,
  patch: Record<string, string>,
): string {
  const next = { ...parseSpecs(raw || "{}") };
  for (const [k, v] of Object.entries(patch)) {
    if (v) next[k] = v;
  }
  if (patch.imagineQa === "pass") delete next.imagineQaFails;
  return JSON.stringify(next);
}
