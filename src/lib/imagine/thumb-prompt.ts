/**
 * Short catalog prompt — the 15s / ~150KB tiles from last week.
 * Do not stack more rules.
 */
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";

export type ThumbSubject = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  exteriorColor?: string;
  interiorColor?: string;
  bodyStyle?: string;
};

export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = vehicleDisplayTitle(car);
  const paint = car.exteriorColor?.trim() || "the paint in the first photo";
  const cabin = car.interiorColor?.trim() || "the interior in the first photo";

  return (
    `Catalog still of this exact ${label}. Paint: ${paint}. Cabin: ${cabin}. ` +
    `First photo = this VIN (copy paint, stripes, body). Second photo = greyscale camera plate only. ` +
    `High boom, long telephoto, nose at the BOTTOM, whole car ~70% of the square. Wheels straight. Headlights OFF. ` +
    `Seamless studio floor, soft shadow, high-gloss paint, crisp speculars. Square, no text.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  return buildThumbEditPrompt(car);
}

export function buildStyleLockAddendum(): string {
  return "";
}

export function buildDealerRefsAddendum(): string {
  return "";
}
