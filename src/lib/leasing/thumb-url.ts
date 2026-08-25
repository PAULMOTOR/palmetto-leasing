/** Public origin for inventory tiles posted to the CRM. */
export function palmettoOrigin(): string {
  return (
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.VITE_PUBLIC_SITE_URL?.trim() ||
    "https://www.palmettoleasing.com"
  ).replace(/\/$/, "");
}

export function tileCacheToken(updatedAt?: string | Date | null): string {
  if (!updatedAt) return "";
  if (updatedAt instanceof Date) return String(updatedAt.getTime());
  const ms = Date.parse(updatedAt);
  if (Number.isFinite(ms) && ms > 0) return String(ms);
  return updatedAt.replace(/[^\d]/g, "").slice(0, 14);
}

/** Public tile URL — never ship data: URIs in the inventory JSON. */
export function publicTileUrl(
  vehicleId: string,
  thumbnailUrl: string | null | undefined,
  updatedAt?: string | Date | null,
): string {
  const t = thumbnailUrl || "";
  const token = tileCacheToken(updatedAt);
  const qs = token ? `?v=${encodeURIComponent(token)}` : "";
  if (t.startsWith("data:image/")) {
    return `/api/thumb/${encodeURIComponent(vehicleId)}${qs}`;
  }
  if (/imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(t)) {
    return `/api/thumb/${encodeURIComponent(vehicleId)}${qs}`;
  }
  return t;
}

/** Absolute HTTPS URL of the inventory tile — safe to POST to the CRM. */
export function absolutePublicTileUrl(
  vehicleId: string,
  thumbnailUrl: string | null | undefined,
  origin: string,
): string {
  const rel = publicTileUrl(vehicleId, thumbnailUrl).trim();
  if (!rel) return inventoryTileHandoffUrl(vehicleId, origin);
  if (/^https?:\/\//i.test(rel)) return rel;
  const base = (origin || palmettoOrigin()).replace(/\/$/, "");
  if (rel.startsWith("/")) return `${base}${rel}`;
  return `${base}/${rel}`;
}

/**
 * Canonical Hero Shot URL for CRM Apply.
 * Always a plain https string — never a relative path, never { url }.
 * /api/thumb/:id serves the studio tile bytes (or redirects to a real photo).
 */
export function inventoryTileHandoffUrl(
  vehicleId: string,
  origin = palmettoOrigin(),
  updatedAt?: string | Date | null,
): string {
  const id = encodeURIComponent((vehicleId || "").trim());
  if (!id) return "";
  const token = tileCacheToken(updatedAt);
  const qs = token ? `?v=${encodeURIComponent(token)}` : "";
  return `${(origin || palmettoOrigin()).replace(/\/$/, "")}/api/thumb/${id}${qs}`;
}

export function slimPhotoUrls(photos: string[]): string[] {
  return photos.filter(
    (p) =>
      /^https?:\/\//i.test(p) &&
      !p.startsWith("data:") &&
      !/imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(p),
  );
}
