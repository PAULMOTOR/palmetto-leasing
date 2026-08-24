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
    `The FIRST photo is this exact car — copy paint, stripes/livery, carbon, badges, interior, and body from it. ` +
    `The SECOND photo is a greyscale overhead camera plate only (no paint, no body). Use it for boom height, tilt, and studio floor. ` +
    `If the first photo is red, output red. Black → black. Never invent yellow unless the first photo is yellow. ` +
    `SHOW THE ENTIRE CAR, ~70% of the square — same fill as a catalog plate. Smooth edges, no resize artifacts. ` +
    `Nose DOWN (grille at BOTTOM). Wheels straight. Headlights OFF. Lights out of frame. No text.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  return buildThumbEditPrompt(car);
}

export function buildStyleLockAddendum(): string {
  return (
    ` First attached image = THIS VIN (identity). Second = greyscale camera plate. ` +
    `Color and stripes from the first photo only.`
  );
}

export function buildDealerRefsAddendum(): string {
  return buildStyleLockAddendum();
}
