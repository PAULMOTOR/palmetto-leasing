/**
 * Locked Palmetto studio tile template.
 *
 * Approved composition (every tile):
 *   - FULL car visible (nose to tail)
 *   - Nose / front bumper points DOWN (toward bottom of square)
 *   - Rear / wing points UP (toward top of square)
 *   - High bird's-eye, pure white, soft shadow
 */

export type ThumbSubject = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  exteriorColor?: string;
  bodyStyle?: string;
};

export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const colorBit = car.exteriorColor?.trim()
    ? `Exact paint from references: ${car.exteriorColor}.`
    : `Exact paint, body lines, badges, and wheels from the subject references.`;

  return (
    `Create a photorealistic luxury dealership inventory thumbnail of this exact car: ${label}. ${colorBit} ` +
    // —— Full car ——
    `SHOW THE ENTIRE CAR — nose to tail, complete silhouette. Do not crop to front half only. ` +
    `Wheels, side mirrors, roof, rear bumper, and any rear wing must all be visible inside the frame. ` +
    // —— Orientation (critical) ——
    `ORIENTATION LOCK: the nose of the car points DOWN. ` +
    `Front bumper, headlights, and grille are at the BOTTOM of the image. ` +
    `The rear of the car (tail lights, rear bumper, rear wing/spoiler) is at the TOP of the image. ` +
    `Think: the car is driving toward the bottom edge of the square. ` +
    `NEVER put the nose at the top. NEVER put the rear wing at the bottom. That is upside down and rejected. ` +
    // —— Camera ——
    `CAMERA: strict high bird's-eye / overhead product shot, looking nearly straight down from above. ` +
    `Slight depth so hood and roof read clearly. Body axis vertical, car centered. ` +
    `NOT a 3/4 hero angle, NOT eye-level, NOT side profile, NOT a low front shot. ` +
    // —— Scale ——
    `SCALE: whole car fits comfortably in the square (~70% of frame height) with even white margin on all four sides (~8–12%). ` +
    `Nothing clipped. Not a tiny floating toy. ` +
    // —— Studio ——
    `BACKGROUND: pure seamless #FFFFFF only. ` +
    `SHADOW: soft short contact shadow under the car. ` +
    `LIGHTING: soft-box studio, even, realistic paint and glass. Photoreal — not CGI plastic. ` +
    `No text, logos, watermarks, people, or props. Output one 1:1 square image.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim() || "factory-accurate color";
  return (
    `Photoreal luxury inventory thumbnail of a complete ${label} in ${color}. ` +
    `ENTIRE car nose-to-tail visible. ` +
    `ORIENTATION: nose points DOWN — front bumper at BOTTOM of frame, rear/wing at TOP. Never upside down. ` +
    `High bird's-eye overhead only. Pure #FFFFFF, soft under-car shadow, even margins. No 3/4 angles. No text.`
  );
}

/** Style lock = lighting / overhead full-car template. Subject = identity only. */
export function buildStyleLockAddendum(): string {
  return (
    ` DUAL-IMAGE RULES: Image 0 is the overhead studio TEMPLATE (full car, nose DOWN / front at bottom). ` +
    `Image 1 is the SUBJECT car identity only (paint, body, badges, wheels). ` +
    `Output MUST match Image 0 for: full-car framing, nose-DOWN orientation (front at BOTTOM, rear at TOP), ` +
    `overhead camera, white background, soft shadow, and margins. ` +
    `Output MUST match Image 1 for car identity only. ` +
    `Discard Image 1's angle and rotation completely. If Image 1 is upside down or 3/4, rebuild correctly. ` +
    `Final check: headlights near the BOTTOM edge of the square; rear wing/tail near the TOP.`
  );
}
