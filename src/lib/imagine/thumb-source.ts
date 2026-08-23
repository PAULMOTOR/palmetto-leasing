/**
 * Studio tiles are either photographed (from this car's listing photos) or
 * inferred (text-to-image / AutoTrader stock placeholder). Only inferred
 * tiles may be replaced automatically when real dealer photography appears.
 */
import { imageIdentityKey, selectImagineRefs } from "@/lib/leasing/gallery";
import { parseSpecs, type VehicleSpecs } from "@/lib/leasing/types";

export type ThumbSource = "photographed" | "inferred" | "dealer";

export function isPlaceholderListing(
  specs: VehicleSpecs | Record<string, string | undefined> | string | null | undefined,
): boolean {
  let s: Record<string, unknown> = {};
  if (typeof specs === "string") s = parseSpecs(specs) as Record<string, unknown>;
  else if (specs && typeof specs === "object") s = specs as Record<string, unknown>;
  const v = String(s.photosPlaceholder ?? s.isCoverImagePlaceholder ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function listingHasActualDealerPhotos(
  photos: string[],
  opts?: { placeholder?: boolean; source?: string },
): boolean {
  if (opts?.placeholder) return false;
  const refs = selectImagineRefs(photos || [], { limit: 8 });
  if (!refs.length) return false;
  const unique = new Set(refs.map(imageIdentityKey)).size;
  // AutoTrader often ships one representative stock hero until the dealer
  // uploads the car — that is not actual photography.
  const fromAt =
    (opts?.source || "").toLowerCase() === "autotrader" ||
    refs.some((u) => /autotrader\.ca|autoscout24\.net/i.test(u));
  if (fromAt && unique <= 1) return false;
  return true;
}

export function thumbSourceFromImagine(opts: {
  mode: "edit" | "generate";
  hasActualPhotos: boolean;
}): "photographed" | "inferred" {
  if (opts.mode === "edit" && opts.hasActualPhotos) return "photographed";
  return "inferred";
}
