/**
 * Dual-image: hero-dominant identity sheet + greyscale camera plate.
 * Paint always comes from the LARGE top photo — never the grey plate.
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
  const named =
    raw && !/^(grey|gray|silver|n\/a|na|-)$/i.test(raw) ? raw : "";
  const hint = named ? ` Listing text says ${named}, but the PHOTO wins if they disagree.` : "";
  return (
    `PAINT: copy the LARGE TOP photo in Image 1 exactly.${hint} ` +
    `If that photo is yellow, output yellow. If charcoal, charcoal. Never Image 2's grey body.`
  );
}

function cabinInstruction(car: ThumbSubject): string {
  const raw = car.interiorColor?.trim() || "";
  const named = raw && !/^(n\/a|na|-)$/i.test(raw) ? raw : "";
  if (named) {
    return `CABIN: ${named}, matching the bottom-right seat strip. Do not invent red Ferrari seats.`;
  }
  return "CABIN: copy the bottom-right seat strip exactly. Black stays black, yellow trim stays yellow. Do not default to red seats.";
}

export function buildThumbEditPrompt(car: ThumbSubject, opts?: { fromUploads?: boolean }): string {
  const label = vehicleDisplayTitle(car);
  const source = opts?.fromUploads
    ? `Image 1 was built ONLY from three photos an operator uploaded for this VIN. LARGE TOP = front 3/4 (paint, this car). Bottom-left = rear 3/4 (slats vs glass, wing). Bottom-right = seats. Ignore listing color text if it disagrees with those photos.`
    : `Image 1 is a contact sheet of THIS VIN (not the output). LARGE TOP = main dealer photo (paint, this car). Bottom-left = rear (slats vs glass, wing). Bottom-right = seats.`;

  return (
    `Catalog still of this exact ${label}. ${paintInstruction(car)} ${cabinInstruction(car)} ` +
    `${source} ` +
    `Image 2 is a greyscale camera plate — camera and studio only, ignore its body color. ` +
    `ONE overhead car. Never a collage, never a 3/4 hero. ` +
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
