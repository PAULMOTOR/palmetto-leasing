/**
 * Smart gallery selection for in-card lease quote.
 * Dealer listing photos only — hi-res preferred; never ads / brand packs / Imagine thumbs.
 */

const INTERIOR_RE =
  /interior|cabin|seat|cockpit|dash|dashboard|console|leather|steering|wheel.?int|upholst|rear.?seat|front.?seat|door.?panel|headliner|suede|alcantara/i;

const SKIP_RE =
  /logo|icon|sprite|pixel|1x1|favicon|badge\.svg|placeholder|data:image\/svg|spacer|blank|loading|avatar|profile|banner.?ad|feedback-dan|\/feedback\/|as24-home|\/assets\/as24|promo|advert|testimonial|reviewer|host-with|microphone|podcast|carfax|wechat|favicon/i;

/** Studio / seed / brand-pack assets that are NOT the listing car. */
function isNonListingAsset(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("/vehicles/") || url.includes("/vehicles/")) return true;
  if (/imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(url)) return true;
  if (
    /palmetto-style-lock|top-porsche|front-porsche|top-ferrari|front-ferrari|top-bentley|front-bentley|top-mclaren|front-mclaren|top-urus|front-urus|top-rolls|front-rolls|bmw-m8|mercedes-amg|rolls-ghost|aston-db12|ferrari-roma|lamborghini-urus|mclaren-720s|porsche-911|bentley-gt|range-rover/i.test(
      url,
    )
  ) {
    return true;
  }
  return false;
}

/** AutoTrader / site chrome that is never a vehicle photo. */
function isPromoOrChrome(url: string): boolean {
  const u = url.toLowerCase();
  // The "man with mic" feedback ad + similar marketing
  if (/feedback-dan|\/feedback\/|as24-home|\/assets\/as24|testimonial|review-avatar/i.test(u)) {
    return true;
  }
  // AutoTrader static site assets (not listing photos)
  if (/autotrader\.ca\/assets\//i.test(u) && !/listing/i.test(u)) return true;
  if (/autotrader\.ca\/images\//i.test(u) && !/listing|vehicle|inventory|dealer/i.test(u)) {
    return true;
  }
  // Social / tracking / app store badges
  if (/apple-touch|android-chrome|mstile|opengraph-default|share-default/i.test(u)) return true;
  // PNGs on marketing paths with alpha (ads) — ban non-listing pngs from AT
  if (/autotrader\.ca/i.test(u) && /\.png(\?|$)/i.test(u) && !/listing-images/i.test(u)) {
    return true;
  }
  if (isGclChrome(u)) return true;
  return false;
}

/**
 * GCL (gclcars.ca) pages start with a Canadian flag + generic white body-style
 * icons (BMW convertible / Mustang coupe silhouettes). Those are not the car.
 * Only `/img/tmp/products/…` shots are listing photography.
 */
function isGclChrome(url: string): boolean {
  const u = url.toLowerCase();
  const fromGclCdn = /dp-prod\.s3|gclcars\.ca/i.test(u);
  if (!fromGclCdn) return false;
  if (/\/img\/tmp\/products\//i.test(u)) return false;
  if (/\/languages\/|\/en\.png|\/zh\.png|flag|maple/i.test(u)) return true;
  if (/\/car_style\/|style_convertible|style_coupe|style_sedan|style_suv|style_truck|style_wagon|style_van|style_hatch|style_minivan/i.test(u))
    return true;
  if (/logo-gcl|gclcanada|\/user\.png|card-[1-4]\.(png|jpe?g)|gcl-wechat/i.test(u)) return true;
  // Any other GCL site chrome (header, cards, icons)
  if (/\.png(\?|$)/i.test(u)) return true;
  return true;
}

/**
 * Upgrade thumbnail / low-res CDN URLs to full dealer photography size.
 * AutoScout24: .../uuid.jpg/120x90.jpg → .../uuid.jpg/1920x1080.jpg
 */
export function upgradeImageUrl(url: string): string {
  if (!url || url.startsWith("data:")) return url;
  let out = url;

  // AutoScout / AutoTrader CA listing CDN size segments
  // e.g. /120x90.jpg, /320x240.webp, /640x480.jpg → 1920x1080
  out = out.replace(/\/(\d{2,4})x(\d{2,4})\.(jpe?g|webp|png)(\?|$)/i, (_m, w, h, ext, end) => {
    const ww = Number(w);
    const hh = Number(h);
    // Only upscale obvious thumbs / mid sizes; leave already-large alone
    if (ww >= 1600 || hh >= 1000) return `/${w}x${h}.${ext}${end}`;
    return `/1920x1080.${ext}${end}`;
  });

  // Common query params
  out = out
    .replace(/([?&])(w|width)=\d+/gi, "$1$2=1920")
    .replace(/([?&])(h|height)=\d+/gi, "$1$2=1080")
    .replace(/([?&])quality=\d+/gi, "$1quality=90")
    .replace(/([?&])(size|sz)=(?:thumb|small|tiny|xs|s|m)\b/gi, "$1$2=large");

  // Path tokens
  out = out
    .replace(/\/thumbs?\//gi, "/")
    .replace(/\/small\//gi, "/large/")
    .replace(/_thumb(?=\.|$|\?)/gi, "")
    .replace(/_small(?=\.|$|\?)/gi, "")
    .replace(/-thumb(?=\.|$|\?)/gi, "");

  return out;
}

/** Stable key so 120x90 and 1920x1080 of same photo collapse. */
export function imageIdentityKey(url: string): string {
  try {
    const u = new URL(url);
    // Strip size segment for autoscout: /listing-images/ID_UUID.ext/SIZE.ext
    let path = u.pathname
      .replace(/\/\d{2,4}x\d{2,4}\.(jpe?g|webp|png)$/i, "")
      .replace(/_(?:thumb|small|medium|large|hires)/gi, "")
      .toLowerCase();
    return `${u.hostname}${path}`;
  } catch {
    return url.split("?")[0]!.toLowerCase();
  }
}

export function isInteriorPhoto(url: string, alt = ""): boolean {
  const s = `${url} ${alt}`;
  return INTERIOR_RE.test(s);
}

export function isLikelyJunk(url: string): boolean {
  return (
    SKIP_RE.test(url) ||
    url.length < 8 ||
    isNonListingAsset(url) ||
    isPromoOrChrome(url)
  );
}

/**
 * Photos Imagine may use as subject identity. Drops flags, body-style icons,
 * interiors-first, and dealer chrome. Prefers real listing photography.
 */
export function selectImagineRefs(photos: string[], opts?: { limit?: number }): string[] {
  const limit = opts?.limit ?? 4;
  const cleaned = normalizeGalleryUrls(photos).filter((u) => /^https?:\/\//i.test(u));
  if (!cleaned.length) return [];

  const exteriors = cleaned.filter((u) => !isInteriorPhoto(u));
  const pool = exteriors.length ? exteriors : cleaned;
  const preferred = pool.filter(
    (u) => /\/img\/tmp\/products\//i.test(u) || /listing-images/i.test(u),
  );
  const use = preferred.length ? preferred : pool;
  return use.slice(0, limit);
}

/**
 * Normalize a raw URL list: upgrade res, drop junk, de-dupe by photo identity
 * (prefer already-hi-res when both thumb + full appear).
 */
export function normalizeGalleryUrls(photos: string[]): string[] {
  const best = new Map<string, string>();
  for (const raw of photos) {
    if (!raw || isLikelyJunk(raw)) continue;
    const upgraded = upgradeImageUrl(raw);
    if (isLikelyJunk(upgraded)) continue;
    const key = imageIdentityKey(upgraded);
    const prev = best.get(key);
    if (!prev) {
      best.set(key, upgraded);
      continue;
    }
    // Prefer the one that already looks larger / full
    best.set(key, scoreRes(upgraded) >= scoreRes(prev) ? upgraded : prev);
  }
  return [...best.values()];
}

function scoreRes(url: string): number {
  const m = url.match(/\/(\d{2,4})x(\d{2,4})\./);
  if (m) return Number(m[1]) * Number(m[2]);
  if (/1920|1600|1280|large|hires|original/i.test(url)) return 1920 * 1080;
  if (/thumb|small|120x|320x/i.test(url)) return 100;
  return 500;
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
  const cleaned = normalizeGalleryUrls(photos);
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
    vehicle.thumbnail_url || "",
  ].filter((u) => u && !isNonListingAsset(u) && !isLikelyJunk(u));
  return normalizeGalleryUrls(base);
}

/** @deprecated */
export function brandPhotoPack(_make: string, _model: string): string[] {
  return [];
}
