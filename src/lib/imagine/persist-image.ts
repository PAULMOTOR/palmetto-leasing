import { normalizeStudioTileDataUri } from "./normalize-tile";

export function isEphemeralImagineUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(url);
}

/** True only for a finished Palmetto studio tile (persisted Imagine data URI). */
export function isStudioThumbUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("data:image/");
}

export function isDurableThumbUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("/")) return true;
  // Dealer / CDN photos are durable enough for *display* fallback
  if (/^https?:\/\//i.test(url) && !isEphemeralImagineUrl(url)) return true;
  return false;
}

/** Download a remote image and return a data URI, or null. */
export async function urlToDataUri(
  imageUrl: string,
  opts?: { maxBytes?: number },
): Promise<string | null> {
  const maxBytes = opts?.maxBytes ?? 900_000;
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; PalmettoLeasingBot/2.0; +https://palmettoleasing.com)",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(45_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 400 || buf.length > maxBytes) return null;
    let ctype = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim();
    if (!ctype.startsWith("image/")) ctype = "image/jpeg";
    return `data:${ctype};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Turn Imagine API output into a durable thumbnail URL for Neon.
 * Prefers b64 → data URI; else downloads temporary imgen URL immediately.
 */
export async function persistImagineResult(opts: {
  url?: string;
  b64?: string;
}): Promise<{ durableUrl: string } | { error: string }> {
  if (opts.b64) {
    const raw = opts.b64.startsWith("data:")
      ? opts.b64
      : `data:image/jpeg;base64,${opts.b64}`;
    // Cap ~700KB base64 payload for Neon row size comfort
    if (raw.length <= 950_000) {
      return { durableUrl: normalizeStudioTileDataUri(raw) || raw };
    }
  }

  if (opts.url) {
    if (opts.url.startsWith("data:image/")) {
      return { durableUrl: normalizeStudioTileDataUri(opts.url) || opts.url };
    }
    const data = await urlToDataUri(opts.url, { maxBytes: 700_000 });
    if (data) return { durableUrl: normalizeStudioTileDataUri(data) || data };
    // Last resort: keep URL only if not ephemeral (shouldn't happen for imgen)
    if (!isEphemeralImagineUrl(opts.url)) {
      return { durableUrl: opts.url };
    }
    return {
      error:
        "Imagine returned a temporary URL that could not be downloaded for permanent storage",
    };
  }

  return { error: "Imagine returned no image" };
}

export function firstDurablePhoto(photos: string[], fallback?: string | null): string {
  for (const p of photos) {
    if (p && isDurableThumbUrl(p) && !isEphemeralImagineUrl(p)) return p;
  }
  if (fallback && isDurableThumbUrl(fallback) && !isEphemeralImagineUrl(fallback)) {
    return fallback;
  }
  return "";
}
