/** Public origin for inventory tiles posted to the CRM. */
import { bareAutoscoutUrl } from "@/lib/leasing/gallery";

export function palmettoOrigin(): string {
  return (
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.VITE_PUBLIC_SITE_URL?.trim() ||
    "https://www.palmettoleasing.com"
  ).replace(/\/$/, "");
}

/** `/api/thumb/{id}.v2` — new filename on every re-render so browsers cannot keep the old tile. */
export function studioTilePath(vehicleId: string, rev?: number | null): string {
  const id = encodeURIComponent((vehicleId || "").trim());
  const n = Math.max(1, Math.floor(Number(rev) || 1));
  return `/api/thumb/${id}.v${n}`;
}

export function parseStudioTileParam(param: string): { vehicleId: string; rev: number | null } {
  const raw = decodeURIComponent(param || "").trim();
  const m = /^(.*)\.v(\d+)$/.exec(raw);
  if (m?.[1]) return { vehicleId: m[1], rev: Number(m[2]) };
  return { vehicleId: raw.replace(/\?.*$/, ""), rev: null };
}

function revFrom(cache?: string | number | Date | null): number {
  if (typeof cache === "number" && Number.isFinite(cache) && cache > 0) return Math.floor(cache);
  return 1;
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
  revOrUpdated?: string | number | Date | null,
): string {
  const t = thumbnailUrl || "";
  const rev = revFrom(revOrUpdated);
  if (t.startsWith("data:image/") || /imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(t)) {
    return studioTilePath(vehicleId, rev);
  }
  if (/^https?:\/\//i.test(t)) return bareAutoscoutUrl(t);
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
  rev?: string | number | Date | null,
): string {
  const id = encodeURIComponent((vehicleId || "").trim());
  if (!id) return "";
  return `${(origin || palmettoOrigin()).replace(/\/$/, "")}${studioTilePath(vehicleId, revFrom(rev))}`;
}

export function slimPhotoUrls(photos: string[]): string[] {
  return photos
    .map((p) => bareAutoscoutUrl(p))
    .filter(
      (p) =>
        /^https?:\/\//i.test(p) &&
        !p.startsWith("data:") &&
        !/imgen\.x\.ai|xai-tmp-imgen|xai-imgen/i.test(p),
    );
}
