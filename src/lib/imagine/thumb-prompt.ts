/**
 * Frozen prompt — this is the recipe that produced the good "Before 6" tiles.
 * Do not keep stacking rules. Image 0 = camera/light. Image 1 = this VIN.
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
  const paint = car.exteriorColor?.trim() || "the exact paint in Image 1";
  const cabin = car.interiorColor?.trim() || "the exact interior in Image 1";

  return (
    `THIS VIN: ${label}. PAINT: ${paint}. INTERIOR: ${cabin}. ` +
    `Image 0 is a GREYSCALE camera plate with NO color — never copy yellow, gold, or any paint from it. ` +
    `Image 1 is the real car. Copy its EXACT paint, livery, racing stripes, carbon, badges, interior, and rear. ` +
    `If Image 1 is red, the output is red. If it is black, the output is black. Never invent Giallo/yellow unless Image 1 is yellow. ` +
    `SHOW THE ENTIRE CAR — nose to tail, including mirrors and any wing. ` +
    `CENTERING: dead-centered. Equal cyclorama buffer on ALL four sides (at least ~10%). The car must not touch any edge. ` +
    `ORIENTATION: nose DOWN (grille at BOTTOM), rear at TOP. ` +
    `CAMERA: copy Image 0 boom/tilt/telephoto. Grille AND roof readable. Not nadir, not 3/4, not eye-level. ` +
    `WHEELS straight. ` +
    `STUDIO: seamless off-white/light-grey infinity cyclorama. Soft fading shadow. Lights OUT OF FRAME — no visible softbox, ceiling panel, or white burst above the car. ` +
    `HEADLIGHTS OFF. High-gloss OEM paint. No text, plates, or people.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  return buildThumbEditPrompt(car);
}

export function buildStyleLockAddendum(): string {
  return (
    ` DUAL-IMAGE: Image 0 is GREYSCALE camera/lighting only — it has no paint. ` +
    `Image 1 is THIS VIN. Copy paint, stripes/livery, interior, and rear from Image 1 only. ` +
    `Final check: color matches Image 1 (not yellow unless the car is yellow); car not touching edges; no 3/4.`
  );
}

export function buildDealerRefsAddendum(): string {
  return buildStyleLockAddendum();
}
