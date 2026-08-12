/**
 * Pull image URLs from a dealer VDP / inventory listing page.
 * Upgrades thumbs to full-res; blocks AutoTrader promo chrome.
 */
import {
  isInteriorPhoto,
  isLikelyJunk,
  selectGalleryPhotos,
  upgradeImageUrl,
  normalizeGalleryUrls,
} from "./gallery";

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
          "Mozilla/5.0 (compatible; PalmettoLeasingBot/2.1; +https://palmettoleasing.com)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-CA,en;q=0.9",
      },
      signal: AbortSignal.timeout(14_000),
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
      let abs = new URL(raw.trim().replace(/&/g, "&"), baseUrl).toString();
      abs = upgradeImageUrl(abs);
      if (!/^https?:/i.test(abs)) return;
      if (isLikelyJunk(abs)) return;
      if (/\.svg(\?|$)/i.test(abs) && !/vehicle|car|photo/i.test(abs)) return;
      // Skip non-photo extensions
      if (/\.(gif|ico|css|js)(\?|$)/i.test(abs)) return;
      urls.push(abs);
    } catch {
      /* ignore */
    }
  };

  // Prefer structured gallery JSON first (usually has full-size listing images)
  for (const m of html.matchAll(
    /"(?:image|url|src|photo|full|large|hiRes|highRes|original|imageUrl|photoUrl)"\s*:\s*"(https?:[^"]+\.(?:jpe?g|webp|png)[^"]*)"/gi,
  )) {
    push(m[1]!);
  }

  // Explicit listing-images CDN paths (AutoScout / AT)
  for (const m of html.matchAll(
    /https?:\/\/[^"'\\\s]+listing-images[^"'\\\s]+\.(?:jpe?g|webp|png)(?:\/\d+x\d+\.(?:jpe?g|webp|png))?/gi,
  )) {
    push(m[0]!);
  }

  // og:image
  for (const m of html.matchAll(
    /property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi,
  )) {
    push(m[1]!);
  }
  for (const m of html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image/gi)) {
    push(m[1]!);
  }

  // img src / data-src / data-lazy / srcset — take largest srcset candidate only
  for (const m of html.matchAll(
    /<(?:img|source)[^>]+(?:srcset)=["']([^"']+)["']/gi,
  )) {
    const candidates = m[1]!
      .split(",")
      .map((part) => {
        const bits = part.trim().split(/\s+/);
        const u = bits[0] || "";
        const w = Number((bits[1] || "").replace(/w$/i, "")) || 0;
        return { u, w };
      })
      .filter((c) => c.u);
    candidates.sort((a, b) => b.w - a.w);
    if (candidates[0]) push(candidates[0].u);
  }

  for (const m of html.matchAll(
    /<(?:img|source)[^>]+(?:src|data-src|data-lazy|data-original)=["']([^"']+)["']/gi,
  )) {
    push(m[1]!);
  }

  // JSON-LD
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walkImages(JSON.parse(m[1]!), push);
    } catch {
      /* ignore */
    }
  }

  return normalizeGalleryUrls(urls);
}

function walkImages(node: unknown, push: (u: string) => void, depth = 0): void {
  if (depth > 10 || node == null) return;
  if (typeof node === "string") {
    if (/\.(jpe?g|webp|png)/i.test(node) || /image|photo|media|listing-images/i.test(node)) {
      push(node);
    }
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
