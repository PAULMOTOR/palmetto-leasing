/**
 * Short Palmetto tile prompt. Long rule-lists made Imagine ignore identity
 * and leak the style-lock car (tan California seats, rear glass).
 *
 * Camera/studio in text. Identity from dealer photos (up to 3).
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

function subjectLine(car: ThumbSubject): string {
  return vehicleDisplayTitle(car);
}

export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = subjectLine(car);
  const paint = car.exteriorColor?.trim() || "the paint in the dealer photos";
  const cabin = car.interiorColor?.trim() || "the interior color in the dealer photos";

  return (
    `Catalog still of this exact ${label}. ` +
    `Paint: ${paint}. Cabin leather: ${cabin}. ` +
    `CAMERA: high boom, long telephoto. The car looks long and slender (not a ball). Nose at the BOTTOM, rear at the TOP, whole car in frame, ~70% of the square. Headlights OFF. Wheels straight. ` +
    `STUDIO: seamless floor to every edge of the square — no picture-frame, no inset plate. Soft smooth shadow under the car; a faint glossy floor reflection is welcome. No hard cutout halo, no sticker drop-shadow. ` +
    `GLASS: windshield clean; cabin clearly lit from above so the real leather color reads. ` +
    `GLOSS: high-gloss paint with a few crisp speculars (invent them if the photos are dark). ` +
    `Square 1:1, no text, no plates, no people.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  return buildThumbEditPrompt(car);
}

/** Appended only when Image 0 is the studio template (1 dealer photo). */
export function buildStyleLockAddendum(): string {
  return (
    ` Image 0 = camera and lighting only. Image 1 = this VIN. ` +
    `Do not copy Image 0's body, interior color, or rear window.`
  );
}

/** Appended when 2–3 dealer photos and no template car. */
export function buildDealerRefsAddendum(): string {
  return (
    ` The attached images are THIS VIN from different angles. ` +
    `Image 1 = exterior identity. Image 2 = REAR or 3/4 — copy that rear exactly (louvers vs glass, wing vs no wing). ` +
    `Image 3 (if present) = cabin; copy that interior color. ` +
    `Never invent a generic model's rear window or seats.`
  );
}
