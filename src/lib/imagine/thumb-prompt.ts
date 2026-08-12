/**
 * Locked Palmetto studio tile template.
 *
 * Approved composition (every tile):
 *   - FULL car visible (nose to tail)
 *   - Nose / front bumper points DOWN (toward bottom of square)
 *   - Rear / wing points UP (toward top of square)
 *   - Car perfectly centered (longitudinal axis = vertical midline)
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
    // —— Dead-center placement (critical for inventory grid alignment) ——
    `CENTERING (mandatory): the car is perfectly dead-centered in the square on both axes. ` +
    `The car's longitudinal centerline is the exact vertical midline of the image — equal white space left and right, pixel-perfect. ` +
    `The hood badge / front emblem sits on that vertical centerline. ` +
    `Do not shift the car left, right, up, or down. Symmetric margins on all four sides. ` +
    // —— Orientation ——
    `ORIENTATION LOCK: the nose of the car points DOWN. ` +
    `Front bumper, headlights, and grille are at the BOTTOM of the image. ` +
    `The rear of the car (tail lights, rear bumper, rear wing/spoiler) is at the TOP of the image. ` +
    `Think: the car is driving toward the bottom edge of the square. ` +
    `NEVER put the nose at the top. NEVER put the rear wing at the bottom. That is upside down and rejected. ` +
    // —— Camera ——
    `CAMERA: strict high bird's-eye / overhead product shot, looking nearly straight down from above. ` +
    `Slight depth so hood and roof read clearly. Body axis perfectly vertical. ` +
    `NOT a 3/4 hero angle, NOT eye-level, NOT side profile, NOT a low front shot. ` +
    // —— Scale ——
    `SCALE: whole car fits comfortably in the square (~70% of frame height) with even white margin on all four sides (~8–12%). ` +
    `Nothing clipped. Not a tiny floating toy. ` +
    // —— Studio ——
    `BACKGROUND: pure seamless #FFFFFF only. ` +
    `SHADOW: soft short contact shadow under the car, also centered with the car. ` +
    `LIGHTING: soft-box studio, even, realistic paint and glass. Photoreal — not CGI plastic. ` +
    `No text, logos, watermarks, people, or props. Output one 1:1 square image.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim() || "factory-accurate color";
  return (
    `Photoreal luxury inventory thumbnail of a complete ${label} in ${color}. ` +
    `ENTIRE car nose-to-tail visible. Perfectly dead-centered — equal left/right margins, hood badge on the vertical midline. ` +
    `ORIENTATION: nose points DOWN — front bumper at BOTTOM of frame, rear/wing at TOP. Never upside down. ` +
    `High bird's-eye overhead only. Pure #FFFFFF, soft under-car shadow, even margins. No 3/4 angles. No text.`
  );
}

/** Style lock = lighting / overhead full-car template. Subject = identity only. */
export function buildStyleLockAddendum(): string {
  return (
    ` DUAL-IMAGE RULES: Image 0 is the overhead studio TEMPLATE (full car, nose DOWN / front at bottom, dead-centered). ` +
    `Image 1 is the SUBJECT car identity only (paint, body, badges, wheels). ` +
    `Output MUST match Image 0 for: full-car framing, nose-DOWN orientation (front at BOTTOM, rear at TOP), ` +
    `perfect centering on the vertical midline, overhead camera, white background, soft shadow, and equal margins. ` +
    `Output MUST match Image 1 for car identity only. ` +
    `Discard Image 1's angle, rotation, and off-center framing completely. ` +
    `Final check: car dead-center; headlights near the BOTTOM edge; rear wing/tail near the TOP; equal white left and right.`
  );
}
