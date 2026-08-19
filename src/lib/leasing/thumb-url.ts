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
  if (!rel) return "";
  if (/^https?:\/\//i.test(rel)) return rel;
  const base = (origin || "https://www.palmettoleasing.com").replace(/\/$/, "");
  if (rel.startsWith("/")) return `${base}${rel}`;
  return `${base}/${rel}`;
}

export function slimPhotoUrls(photos: string[]): string[] {
  return photos.filter(
    (p) =>
      /^https?:\/\//i.test(p) &&
      !p.startsWith("data:") &&
      !/imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(p),
  );
}
