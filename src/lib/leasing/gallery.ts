/**
 * Smart gallery selection: up to 12 images, not just the first N exteriors.
 * Prefer interiors when labeled; otherwise space samples across the set.
 */

const INTERIOR_RE =
  /interior|cabin|seat|cockpit|dash|dashboard|console|leather|steering|wheel.?int|upholst|rear.?seat|front.?seat|door.?panel|headliner|suede|alcantara/i;

const EXTERIOR_RE =
  /exterior|outside|side|rear|front|grille|wheel|rim|badge|profile|three.?quarter|3.?4|hero|studio|top.?down/i;

const SKIP_RE =
  /logo|icon|sprite|pixel|1x1|favicon|badge\.svg|placeholder|data:image\/svg|spacer|blank|loading/i;

export function isInteriorPhoto(url: string, alt = ""): boolean {
  const s = `${url} ${alt}`;
  return INTERIOR_RE.test(s);
}

export function isLikelyJunk(url: string): boolean {
  return SKIP_RE.test(url) || url.length < 8;
}

/**
 * Pick up to `limit` photos from a pool.
 * Strategy:
 * 1) Score interiors high
 * 2) Take spaced samples from full list so mid/late gallery shots aren't ignored
 * 3) Ensure at least ~30% slots try for interiors when available
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

  // Space-sample interiors first
  for (const u of spaceSample(interiors, interiorTarget)) picked.add(u);

  // Space-sample remaining slots across full list (not only head of array)
  for (const u of spaceSample(cleaned, limit)) {
    if (picked.size >= limit) break;
    picked.add(u);
  }

  // Fill from exteriors if still short
  for (const u of spaceSample(exteriors, limit)) {
    if (picked.size >= limit) break;
    picked.add(u);
  }

  return [...picked].slice(0, limit);
}

/** Evenly space indices across array length. */
export function spaceSample<T>(arr: T[], n: number): T[] {
  if (n <= 0 || arr.length === 0) return [];
  if (arr.length <= n) return [...arr];
  const out: T[] = [];
  if (n === 1) return [arr[Math.floor(arr.length / 2)]!];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (arr.length - 1)) / (n - 1));
    out.push(arr[idx]!);
  }
  // de-dupe while preserving order
  return [...new Set(out)];
}

/** Brand pack fallbacks so quote panel isn't empty when only one seed thumb exists. */
export function brandPhotoPack(make: string, model: string): string[] {
  const m = make.toLowerCase();
  const md = model.toLowerCase();
  if (m.includes("porsche") && md.includes("taycan")) {
    return [
      "/vehicles/top-porsche-taycan.jpg",
      "/vehicles/front-porsche-taycan.jpg",
      "/vehicles/porsche-911.jpg",
    ];
  }
  if (m.includes("porsche")) {
    return [
      "/vehicles/top-porsche-911.jpg",
      "/vehicles/front-porsche-911.jpg",
      "/vehicles/porsche-911.jpg",
    ];
  }
  if (m.includes("ferrari") && md.includes("puro")) {
    return [
      "/vehicles/top-ferrari-purosangue.jpg",
      "/vehicles/front-ferrari-purosangue.jpg",
      "/vehicles/ferrari-roma.jpg",
    ];
  }
  if (m.includes("ferrari")) {
    return [
      "/vehicles/top-ferrari-458.jpg",
      "/vehicles/front-ferrari-red.jpg",
      "/vehicles/front-ferrari-white.jpg",
      "/vehicles/ferrari-roma.jpg",
    ];
  }
  if (m.includes("lamborghini") || md.includes("urus")) {
    return [
      "/vehicles/top-urus.jpg",
      "/vehicles/front-urus.jpg",
      "/vehicles/lamborghini-urus.jpg",
    ];
  }
  if (m.includes("mclaren")) {
    return [
      "/vehicles/top-mclaren.jpg",
      "/vehicles/front-mclaren.jpg",
      "/vehicles/mclaren-720s.jpg",
    ];
  }
  if (m.includes("rolls")) {
    return [
      "/vehicles/top-rolls-spectre.jpg",
      "/vehicles/front-rolls-spectre.jpg",
      "/vehicles/front-rolls.jpg",
      "/vehicles/rolls-ghost.jpg",
    ];
  }
  if (m.includes("bentley")) {
    return [
      "/vehicles/top-bentley.jpg",
      "/vehicles/front-bentley.jpg",
      "/vehicles/bentley-gt.jpg",
    ];
  }
  if (m.includes("aston")) {
    return [
      "/vehicles/top-bentley.jpg",
      "/vehicles/front-aston.jpg",
      "/vehicles/aston-db12.jpg",
    ];
  }
  if (m.includes("land rover") || m.includes("range") || m.includes("jaguar")) {
    return ["/vehicles/top-urus.jpg", "/vehicles/front-range.jpg", "/vehicles/range-rover.jpg"];
  }
  if (m.includes("bmw")) {
    return ["/vehicles/top-porsche-911.jpg", "/vehicles/front-bmw.jpg", "/vehicles/bmw-m8.jpg"];
  }
  if (m.includes("mercedes") || m.includes("amg") || m.includes("maybach")) {
    return [
      "/vehicles/top-porsche-911.jpg",
      "/vehicles/front-mercedes.jpg",
      "/vehicles/mercedes-amg.jpg",
    ];
  }
  if (m.includes("audi")) {
    return [
      "/vehicles/top-porsche-taycan.jpg",
      "/vehicles/front-porsche-taycan.jpg",
      "/vehicles/front-bmw.jpg",
    ];
  }
  return ["/vehicles/top-porsche-911.jpg", "/vehicles/front-porsche-911.jpg"];
}

export function buildVehicleGalleryPool(vehicle: {
  thumbnail_url?: string | null;
  photos?: string[];
  make: string;
  model: string;
}): string[] {
  const base = [
    ...(vehicle.photos || []),
    vehicle.thumbnail_url || "",
    ...brandPhotoPack(vehicle.make, vehicle.model),
  ].filter(Boolean);
  return [...new Set(base)];
}
