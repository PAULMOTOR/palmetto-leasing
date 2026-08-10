/**
 * Pull image URLs from a dealer VDP / inventory listing page.
 * Used when expanding the in-card lease quote.
 */
import { isInteriorPhoto, isLikelyJunk, selectGalleryPhotos } from "./gallery";

export async function fetchListingGallery(
  listingUrl: string,
  opts?: { limit?: number },
): Promise<{ photos: string[]; interiors: number; source: string }> {
  const limit = opts?.limit ?? 12;
  if (!listingUrl || !listingUrl.startsWith("http")) {
    return { photos: [], interiors: 0, source: "invalid-url" };
  }

  try {
    const res = await fetch(listingUrl, {
      headers: {
        "user-agent":
          "PalmettoLeasingBot/1.0 (+https://palmettoleasing.com; gallery for lease quotes)",
        accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return { photos: [], interiors: 0, source: `http-${res.status}` };
    const html = await res.text();
    const found = extractImageUrls(html, listingUrl);
    const selected = selectGalleryPhotos(found, { limit, preferInteriorShare: 0.4 });
    const interiors = selected.filter((u) => isInteriorPhoto(u)).length;
    return {
      photos: selected,
      interiors,
      source: "dealer-listing",
    };
  } catch (err) {
    return {
      photos: [],
      interiors: 0,
      source: err instanceof Error ? err.message : "fetch-failed",
    };
  }
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const push = (raw: string) => {
    try {
      const abs = new URL(raw.trim().replace(/&/g, "&"), baseUrl).toString();
      if (!/^https?:/i.test(abs)) return;
      if (isLikelyJunk(abs)) return;
      // skip tiny trackers / icons by extension heuristics
      if (/\.svg(\?|$)/i.test(abs) && !/vehicle|car|photo/i.test(abs)) return;
      urls.push(abs);
    } catch {
      /* ignore */
    }
  };

  // og:image
  for (const m of html.matchAll(
    /property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi,
  )) {
    push(m[1]!);
  }
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image/gi)) {
    push(m[1]!);
  }

  // img src / data-src / data-lazy
  for (const m of html.matchAll(
    /<(?:img|source)[^>]+(?:src|data-src|data-lazy|data-original|data-srcset)=["']([^"']+)["']/gi,
  )) {
    const val = m[1]!;
    if (val.includes(",")) {
      // srcset: take largest candidate
      const parts = val.split(",").map((p) => p.trim().split(/\s+/)[0]!).filter(Boolean);
      for (const p of parts) push(p);
    } else {
      push(val);
    }
  }

  // JSON-LD images
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walkImages(JSON.parse(m[1]!), push);
    } catch {
      /* ignore */
    }
  }

  // Common gallery JSON blobs
  for (const m of html.matchAll(
    /"(?:image|url|src|photo|full|large|hiRes)"\s*:\s*"(https?:[^"]+\.(?:jpe?g|webp|png)[^"]*)"/gi,
  )) {
    push(m[1]!);
  }

  return [...new Set(urls)];
}

function walkImages(node: unknown, push: (u: string) => void, depth = 0): void {
  if (depth > 10 || node == null) return;
  if (typeof node === "string") {
    if (/\.(jpe?g|webp|png)/i.test(node) || /image|photo|media/i.test(node)) push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) walkImages(n, push, depth + 1);
    return;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.image === "string") push(o.image);
    if (Array.isArray(o.image)) for (const i of o.image) walkImages(i, push, depth + 1);
    if (typeof o.url === "string" && /\.(jpe?g|webp|png)/i.test(o.url)) push(o.url);
    for (const v of Object.values(o)) walkImages(v, push, depth + 1);
  }
}
