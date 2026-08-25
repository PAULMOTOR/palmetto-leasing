/**
 * Short catalog prompt — the 15s / ~150KB tiles from last week.
 * Paint always follows the dealer photo, never the listing color word
 * ("Grey" was rendering chalk instead of charcoal).
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

function paintInstruction(car: ThumbSubject): string {
  const raw = car.exteriorColor?.trim() || "";
  const generic = /^(grey|gray|silver|white|black|red|blue|green|yellow|orange|beige|gold|brown|charcoal)$/i.test(
    raw,
  );
  if (!raw || generic) {
    return "PAINT: the exact body color in the FIRST photo — if that car is charcoal/dark, output charcoal/dark. Never chalk, never floor-grey.";
  }
  return `PAINT: ${raw}, matching the FIRST photo exactly. Do not lighten the body to the studio floor.`;
}

export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = vehicleDisplayTitle(car);
  const cabin = car.interiorColor?.trim() || "the interior in the first photo";

  return (
    `Catalog still of this exact ${label}. ${paintInstruction(car)} Cabin: ${cabin}. ` +
    `First photo = this VIN (copy paint, stripes, body). Second photo = greyscale camera plate — camera only, no paint. ` +
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
