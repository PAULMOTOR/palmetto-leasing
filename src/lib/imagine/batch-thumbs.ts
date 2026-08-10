/**
 * Generate Imagine studio tiles.
 * Default: only cars still on dealer photos (unrendered).
 * force: re-render including existing imgen thumbs.
 */
import { getSql } from "@/lib/db";
import { generateVehicleThumbnail } from "./generate-thumb";
import { parsePhotos } from "@/lib/leasing/types";

function isImagineThumb(url: string): boolean {
  return /imgen\.x\.ai|xai-tmp-imgen|imagine|xai-imgen/i.test(url || "");
}

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
  // Missing-only can run larger batches; force re-render stays smaller (cost/time)
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
      photos.some((p) => /^https?:\/\//i.test(p)) ||
      /^https?:\/\//i.test(r.thumbnail_url || "")
    );
  });

  const unrendered = withRefs.filter((r) => !isImagineThumb(r.thumbnail_url || ""));
  const need = (force ? withRefs : unrendered).slice(0, limit);
  const remainingBefore = force
    ? Math.max(0, withRefs.length - limit)
    : Math.max(0, unrendered.length - limit);

  let succeeded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of need) {
    const photos = parsePhotos(r.photo_urls);
    // Prefer real dealer photos as refs (not previous imgen output)
    const refs = [
      ...photos.filter((p) => /^https?:\/\//i.test(p) && !isImagineThumb(p)),
      ...(r.thumbnail_url?.startsWith("http") && !isImagineThumb(r.thumbnail_url)
        ? [r.thumbnail_url]
        : []),
      // fallback: any photo if all we have is imgen (force path)
      ...photos.filter((p) => /^https?:\/\//i.test(p)),
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

      if (imag.ok && imag.url) {
        await sql`
          update vehicles
          set thumbnail_url = ${imag.url}, updated_at = now()
          where id = ${r.id}
        `;
        succeeded += 1;
      } else if (imag.ok && imag.b64) {
        const dataUrl = imag.b64.startsWith("data:")
          ? imag.b64
          : `data:image/jpeg;base64,${imag.b64}`;
        if (dataUrl.length < 900_000) {
          await sql`
            update vehicles
            set thumbnail_url = ${dataUrl}, updated_at = now()
            where id = ${r.id}
          `;
          succeeded += 1;
        } else {
          errors.push(`${r.make} ${r.model}: image too large to store inline`);
        }
      } else {
        errors.push(`${r.make} ${r.model}: ${imag.error || imag.mode}`);
      }
    } catch (err) {
      errors.push(
        `${r.make} ${r.model}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200),
      );
    }
  }

  const remaining = Math.max(0, remainingBefore - succeeded);

  return {
    attempted: need.length,
    succeeded,
    skipped,
    remaining: force ? remainingBefore : Math.max(0, unrendered.length - succeeded),
    errors: errors.slice(0, 15),
    hasApiKey: true,
  };
}
