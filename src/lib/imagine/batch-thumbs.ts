/**
 * Generate Imagine studio tiles for vehicles that still use raw dealer photos.
 */
import { getSql } from "@/lib/db";
import { generateVehicleThumbnail } from "./generate-thumb";
import { parsePhotos } from "@/lib/leasing/types";

const MAX = Number(process.env.IMAGINE_MAX_PER_CRAWL || 20);

function looksLikeImagine(url: string): boolean {
  return /imagine|x\.ai|fal\.|generated|imgen/i.test(url || "");
}

export async function generateMissingImagineThumbs(opts?: {
  limit?: number;
}): Promise<{
  attempted: number;
  succeeded: number;
  skipped: number;
  errors: string[];
  hasApiKey: boolean;
}> {
  const hasApiKey = Boolean(process.env.XAI_API_KEY?.trim());
  if (!hasApiKey) {
    return {
      attempted: 0,
      succeeded: 0,
      skipped: 0,
      errors: ["XAI_API_KEY is not set on this deployment"],
      hasApiKey: false,
    };
  }

  const limit = opts?.limit ?? MAX;
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    year: number;
    make: string;
    model: string;
    trim: string;
    exterior_color: string;
    body_style: string;
    thumbnail_url: string;
    photo_urls: string;
  }>`
    select id, year, make, model, trim, exterior_color, body_style, thumbnail_url, photo_urls
    from vehicles
    where status = 'active'
    order by price_cents desc
    limit 500
  `;

  const need = rows.filter((r) => {
    const photos = parsePhotos(r.photo_urls);
    const hasDealer = photos.some((p) => /^https?:\/\//i.test(p)) || /^https?:\/\//i.test(r.thumbnail_url || "");
    return hasDealer && !looksLikeImagine(r.thumbnail_url || "");
  }).slice(0, limit);

  let succeeded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of need) {
    const photos = parsePhotos(r.photo_urls);
    const refs = [
      ...photos.filter((p) => /^https?:\/\//i.test(p)),
      ...(r.thumbnail_url?.startsWith("http") ? [r.thumbnail_url] : []),
    ].slice(0, 2);

    if (refs.length === 0) {
      skipped += 1;
      continue;
    }

    const imag = await generateVehicleThumbnail({
      car: {
        year: Number(r.year),
        make: r.make,
        model: r.model,
        trim: r.trim,
        exteriorColor: r.exterior_color,
        bodyStyle: r.body_style,
      },
      referencePhotoUrls: refs,
    });

    if (imag.ok && imag.url) {
      await sql`
        update vehicles
        set thumbnail_url = ${imag.url}, updated_at = now()
        where id = ${r.id}
      `;
      succeeded += 1;
    } else {
      errors.push(`${r.make} ${r.model}: ${imag.error || imag.mode}`);
    }
  }

  return {
    attempted: need.length,
    succeeded,
    skipped,
    errors: errors.slice(0, 15),
    hasApiKey: true,
  };
}
