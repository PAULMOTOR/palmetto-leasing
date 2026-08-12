/**
 * Generate Imagine studio tiles.
 * Default: cars with missing OR expired (ephemeral imgen.x.ai) thumbs.
 */
import { getSql } from "@/lib/db";
import { generateVehicleThumbnail } from "./generate-thumb";
import { isEphemeralImagineUrl, isDurableThumbUrl } from "./persist-image";
import { parsePhotos } from "@/lib/leasing/types";

export async function generateMissingImagineThumbs(opts?: {
  limit?: number;
  force?: boolean;
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
  const limit = Math.min(opts?.limit ?? (force ? 12 : 40), force ? 25 : 60);

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
    price_cents: number;
  }>`
    select id, year, make, model, trim, exterior_color, body_style, thumbnail_url, photo_urls, price_cents
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

  // Missing = no durable thumb (null, local placeholder, or expired imgen tmp URL)
  const needsRender = withRefs.filter((r) => {
    if (force) return true;
    return !isDurableThumbUrl(r.thumbnail_url) || isEphemeralImagineUrl(r.thumbnail_url);
  });

  const need = needsRender.slice(0, limit);

  let succeeded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of need) {
    const photos = parsePhotos(r.photo_urls);
    const refs = [
      ...photos.filter((p) => /^https?:\/\//i.test(p) && !isEphemeralImagineUrl(p)),
      ...(r.thumbnail_url?.startsWith("http") && !isEphemeralImagineUrl(r.thumbnail_url)
        ? [r.thumbnail_url]
        : []),
    ]
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, 4);

    if (refs.length === 0) {
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
          bodyStyle: r.body_style,
        },
        referencePhotoUrls: refs,
      });

      if (imag.ok && imag.url && isDurableThumbUrl(imag.url)) {
        await sql`
          update vehicles
          set thumbnail_url = ${imag.url}, updated_at = now()
          where id = ${r.id}
        `;
        succeeded += 1;
      } else {
        errors.push(`${r.make} ${r.model}: ${imag.error || "no durable image"}`);
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
    errors: errors.slice(0, 15),
    hasApiKey: true,
  };
}
