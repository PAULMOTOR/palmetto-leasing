/**
 * Before-6 catalog recipe. 1K quality, ~15–20s.
 * First image = this VIN. Second = greyscale camera plate.
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
  const paint = car.exteriorColor?.trim() || "the exact paint in the first photo";
  const cabin = car.interiorColor?.trim() || "the interior in the first photo";

  return (
    `Photorealistic luxury inventory thumbnail of this exact car: ${label}. ` +
    `PAINT: ${paint}. INTERIOR: ${cabin}. Copy stripes, livery, carbon, and badges from the FIRST photo. ` +
    `The FIRST photo is THIS VIN. The SECOND photo is a greyscale overhead camera plate — camera/lighting only, no paint. ` +
    `If the first photo is red, output red. Never invent yellow unless the first photo is yellow. ` +
    `SHOW THE ENTIRE CAR, ~70% of the square, even margin, not touching the edges. ` +
    `ORIENTATION: nose DOWN (grille at BOTTOM), rear at TOP. Dead-centered. Wheels straight. ` +
    `CAMERA: copy the second photo — elevated front-top, grille AND roof readable, ~40–50° from vertical. Not 3/4, not nadir, not eye-level. ` +
    `STUDIO: infinity cyclorama, off-white to light grey. Soft drop shadow. Lights OUT OF FRAME — no visible softbox or ceiling panel. ` +
    `HEADLIGHTS OFF. High-gloss OEM paint, crisp speculars. No text, plates, or people.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  return buildThumbEditPrompt(car);
}

export function buildStyleLockAddendum(): string {
  return (
    ` First attached image = THIS VIN (identity, paint, stripes). ` +
    `Second = greyscale camera plate (angle and studio only).`
  );
}

export function buildDealerRefsAddendum(): string {
  return buildStyleLockAddendum();
}
