/**
 * Dual-image: identity contact sheet + greyscale camera plate.
 * Never send multiple VIN photos as separate images (Imagine collages them).
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
    return "PAINT: the exact body color in the contact sheet — if that car is charcoal/dark, output charcoal/dark. Never chalk, never floor-grey.";
  }
  return `PAINT: ${raw}, matching the contact sheet exactly. Do not lighten the body to the studio floor.`;
}

export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = vehicleDisplayTitle(car);
  const cabin = car.interiorColor?.trim() || "the seat color in the bottom-left panel";

  return (
    `Catalog still of this exact ${label}. ${paintInstruction(car)} Cabin leather: ${cabin}. ` +
    `Image 1 is a CONTACT SHEET of THIS VIN — not the output layout. ` +
    `Top-left = front/main (paint, grille, hood stripe). Top-right = rear (slats vs glass, wing vs none). Bottom-left = seats. Bottom-right is empty. ` +
    `Copy those facts onto ONE car. Image 2 is a greyscale camera plate — camera and studio only, no paint. ` +
    `ONE overhead car only. Never a collage, never a 3/4 hero, never extra vehicles. ` +
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
