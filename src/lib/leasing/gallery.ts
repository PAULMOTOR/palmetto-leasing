/**
 * Smart gallery selection for in-card lease quote.
 * Dealer listing photos only — never brand-pack stock or Imagine studio thumbs.
 */

const INTERIOR_RE =
  /interior|cabin|seat|cockpit|dash|dashboard|console|leather|steering|wheel.?int|upholst|rear.?seat|front.?seat|door.?panel|headliner|suede|alcantara/i;

const SKIP_RE =
  /logo|icon|sprite|pixel|1x1|favicon|badge\.svg|placeholder|data:image\/svg|spacer|blank|loading|avatar|profile|banner.?ad/i;

/** Studio / seed / brand-pack assets that are NOT the listing car. */
function isNonListingAsset(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("/vehicles/") || url.includes("/vehicles/")) return true;
  if (/imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(url)) return true;
  // Our public seed pack filenames (wrong car when mixed into a different listing)
  if (
    /palmetto-style-lock|top-porsche|front-porsche|top-ferrari|front-ferrari|top-bentley|front-bentley|top-mclaren|front-mclaren|top-urus|front-urus|top-rolls|front-rolls|bmw-m8|mercedes-amg|rolls-ghost|aston-db12|ferrari-roma|lamborghini-urus|mclaren-720s|porsche-911|bentley-gt|range-rover/i.test(
      url,
    )
  ) {
    return true;
  }
  return false;
}

export function isInteriorPhoto(url: string, alt = ""): boolean {
  const s = `${url} ${alt}`;
  return INTERIOR_RE.test(s);
}

export function isLikelyJunk(url: string): boolean {
  return SKIP_RE.test(url) || url.length < 8 || isNonListingAsset(url);
}

/**
 * Pick up to `limit` photos from a pool.
 * Prefer interiors when labeled; space samples so mid/late shots aren't ignored.
 */
export function selectGalleryPhotos(
  photos: string[],
  opts?: { limit?: number; preferInteriorShare?: number },
): string[] {
  const limit = opts?.limit ?? 12;
  const preferShare = opts?.preferInteriorShare ?? 0.35;
  const cleaned = [...new Set(photos.filter((p) => p && !isLikelyJunk(p)))];
  if (cleaned.length <= limit) return cleaned;

  const interiors = cleaned.filter((u) => isInteriorPhoto(u));
  const exteriors = cleaned.filter((u) => !isInteriorPhoto(u));

  const interiorTarget = Math.min(interiors.length, Math.max(2, Math.round(limit * preferShare)));
  const picked = new Set<string>();

  for (const u of spaceSample(interiors, interiorTarget)) picked.add(u);
  for (const u of spaceSample(cleaned, limit)) {
    if (picked.size >= limit) break;
    picked.add(u);
  }
  for (const u of spaceSample(exteriors, limit)) {
    if (picked.size >= limit) break;
    picked.add(u);
  }

  return [...picked].slice(0, limit);
}

export function spaceSample<T>(arr: T[], n: number): T[] {
  if (n <= 0 || arr.length === 0) return [];
  if (arr.length <= n) return [...arr];
  const out: T[] = [];
  if (n === 1) return [arr[Math.floor(arr.length / 2)]!];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (arr.length - 1)) / (n - 1));
    out.push(arr[idx]!);
  }
  return [...new Set(out)];
}

/**
 * Listing gallery pool: real photos only.
 * Do NOT inject brand-pack / Imagine / local seed images — those are wrong cars.
 */
export function buildVehicleGalleryPool(vehicle: {
  thumbnail_url?: string | null;
  photos?: string[];
  make: string;
  model: string;
}): string[] {
  const base = [
    ...(vehicle.photos || []),
    // Only keep thumbnail if it's a real remote listing photo (not studio data URI)
    vehicle.thumbnail_url || "",
  ].filter((u) => u && !isNonListingAsset(u) && !isLikelyJunk(u));
  return [...new Set(base)];
}

/** @deprecated Kept for any legacy call sites that still want brand art — not for galleries. */
export function brandPhotoPack(_make: string, _model: string): string[] {
  return [];
}
