/**
 * Template = public/vehicles/palmetto-style-lock.jpg (yellow Urus "before" set).
 * Image 0 ALWAYS: camera + chimera lighting + infinity floor.
 * Images 1–2: this VIN only (paint, body, interior, rear). Never their camera.
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
    `Luxury studio catalog thumbnail of this exact ${label}. Paint ${paint}. Cabin ${cabin}. ` +
    `Match Image 0 exactly for CAMERA and LIGHTING: high overhead boom, nose at the BOTTOM, a bit of the front fascia visible, car long and slender, whole car in the square. ` +
    `Massive chimera softbox from above. Infinity-edge cyclorama (soft off-white to light grey, no hard white flood, no spray-paint). Soft drop shadow that fades into the floor. Optional faint glossy reflection. ` +
    `Headlights OFF. Wheels straight. Cabin lit through the glass. High-gloss paint, a few crisp speculars. ` +
    `FORBIDDEN: 3/4 hero, eye-level, side profile, dealer-lot photo, phone snapshot, ball-like wide-angle, hard cutout. ` +
    `Square 1:1, no text, no plates, no people.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  return buildThumbEditPrompt(car);
}

export function buildStyleLockAddendum(): string {
  return (
    ` Image 0 is the TEMPLATE (camera, chimera, infinity floor, shadow) — copy those, never its yellow paint, body, or interior. ` +
    `Images 1 and 2 (if present) are THIS VIN: copy paint, body, badges, interior color, and rear (louvers vs glass, wing vs none). ` +
    `Do not copy Images 1–2 camera or lighting.`
  );
}

export function buildDealerRefsAddendum(): string {
  return buildStyleLockAddendum();
}
