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
  const colorBit = car.exteriorColor?.trim()
    ? `Exact paint from the subject photo: ${car.exteriorColor}.`
    : `Exact paint, body lines, and badges from the subject photo.`;
  const cabinBit = car.interiorColor?.trim()
    ? ` Interior: ${car.interiorColor}.`
    : "";

  return (
    `Create a photorealistic luxury dealership inventory thumbnail of this exact car: ${label}. ${colorBit}${cabinBit} ` +
    `Use Image 1 only for the car's identity (shape, paint, badges, interior, rear). Ignore text, banners, prices, watermarks. ` +
    `SHOW THE ENTIRE CAR — nose to tail. Mirrors, roof, rear bumper, and any wing stay in frame. ` +
    `CENTERING: dead-centered. Longitudinal axis = vertical midline. Hood badge on the centerline. ` +
    `ORIENTATION: nose DOWN — front bumper, headlights, and grille at the BOTTOM. Rear at the TOP. ` +
    `CAMERA: copy Image 0 exactly — same boom height, same telephoto, same tilt. Grille AND roof both readable, like Image 0. Do not raise to a roof-only nadir. Do not drop to a front-heavy hero. ` +
    `WHEELS: straight 0°. Tires in the arches. ` +
    `SQUARE, edge to edge. Whole car ~70% of frame height, even margin. ` +
    `STUDIO: seamless infinity cyclorama, off-white to light grey. Soft contact shadow that fades into the floor. Lighting is a huge overhead chimera that is OUT OF FRAME. ` +
    `FORBIDDEN: any visible softbox, octabox, ceiling panel, light bank, stand, or a white burst/hot rectangle above the car. The top of the frame is empty cyclorama, not a studio ceiling. ` +
    `HEADLIGHTS OFF. High-gloss paint with crisp speculars. Photoreal, not CGI. ` +
    `NO TEXT, plates, people, or props.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  return buildThumbEditPrompt(car);
}

export function buildStyleLockAddendum(): string {
  return (
    ` DUAL-IMAGE: Image 0 is the TEMPLATE — copy camera, lighting, infinity floor, and shadow only. Never copy Image 0's yellow paint, body, or interior. ` +
    `Image 1 is THIS VIN — copy paint, body, interior, rear window/louvers/wing. Never copy Image 1's camera or 3/4 angle. ` +
    `Final check: same camera as Image 0; this car's color; empty cyclorama above the car (no softbox in frame); no 3/4.`
  );
}

export function buildDealerRefsAddendum(): string {
  return buildStyleLockAddendum();
}
