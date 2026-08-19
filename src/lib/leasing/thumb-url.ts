/** Public origin for inventory tiles posted to the CRM. */
export function palmettoOrigin(): string {
  return (
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.VITE_PUBLIC_SITE_URL?.trim() ||
    "https://www.palmettoleasing.com"
  ).replace(/\/$/, "");
}

/** Public tile URL — never ship data: URIs in the inventory JSON. */
export function publicTileUrl(vehicleId: string, thumbnailUrl: string | null | undefined): string {
  const t = thumbnailUrl || "";
  if (t.startsWith("data:image/")) {
    return `/api/thumb/${encodeURIComponent(vehicleId)}`;
  }
  if (/imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(t)) {
    return `/api/thumb/${encodeURIComponent(vehicleId)}`;
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
export function inventoryTileHandoffUrl(vehicleId: string, origin = palmettoOrigin()): string {
  const id = encodeURIComponent((vehicleId || "").trim());
  if (!id) return "";
  return `${(origin || palmettoOrigin()).replace(/\/$/, "")}/api/thumb/${id}`;
}

export function slimPhotoUrls(photos: string[]): string[] {
  return photos.filter(
    (p) =>
      /^https?:\/\//i.test(p) &&
      !p.startsWith("data:") &&
      !/imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(p),
  );
}
