/**
 * Locked Palmetto studio tile template — product photography contract.
 * Only car identity (year/make/model/color from references) may change.
 *
 * Orientation (confirmed from approved tiles):
 *   FRONT of car (bumper / headlights / grille) → BOTTOM of the square
 *   ROOF / mid-body / rear of the crop → TOP of the square
 *   Rear wing/spoiler sits near the TOP when visible — never at the bottom.
 */

export type ThumbSubject = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  exteriorColor?: string;
  bodyStyle?: string;
};

/**
 * Create a clean, high-end product photography thumbnail of the exact car
 * in the reference images. Composition is locked for inventory-grid consistency.
 */
export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const colorBit = car.exteriorColor?.trim()
    ? `Match the exact paint color from the references (${car.exteriorColor}).`
    : `Match the exact paint color, body lines, badges, and wheels from the reference images.`;

  return (
    `Professional luxury-car inventory thumbnail of the exact vehicle in the subject reference photos ` +
    `(this real ${label} only — faithful body lines, badges, wheels, paint). ${colorBit} ` +
    // —— Orientation (matches approved Palmetto tiles) ——
    `ORIENTATION (non-negotiable — match the approved inventory look): ` +
    `the FRONT of the car points toward the BOTTOM of the square frame. ` +
    `Front bumper, headlights, grille, and brand badge sit in the LOWER portion of the image. ` +
    `The roof / cabin / mid-body extend toward the TOP of the frame. ` +
    `Any rear wing, spoiler, or rear deck that remains in the crop sits near the TOP — never at the bottom. ` +
    `WRONG (never do this): front bumper at the top, headlights at the top, or rear wing at the bottom. That is upside down. ` +
    `RIGHT: bottom of image = nose/front; top of image = roof / toward the rear. ` +
    // —— Hard ban on wrong angles ——
    `HARD BAN — never produce: front 3/4 hero, side 3/4, low front view, eye-level driveway shot, ` +
    `rolling shot, diagonal corner view, convertible glamour pose, or full side profile. ` +
    `If the subject photo is 3/4, side, or low angle, IGNORE that camera — rebuild as overhead with front at BOTTOM. ` +
    // —— Camera ——
    `CAMERA: high bird's-eye product shot looking down at the front half of the car. ` +
    `Nearly straight down with a tiny pitch so the hood and roof are clearly visible. ` +
    `Body axis vertical on the square, perfectly centered left-right. ` +
    // —— Crop ——
    `FRAMING: front half of the car — from the front bumper (near the BOTTOM of the frame) ` +
    `through roughly mid-roof / just past the windshield (toward the TOP). Crop the far rear if needed. ` +
    `For cars with large rear wings (GT2 RS, GT cars): if the wing is in frame, it must be near the TOP, not the bottom. ` +
    `SCALE / MARGINS: car fills about 65–75% of the square with ~10–15% even white margin on all sides. ` +
    `Never clip the front bumper, mirrors, or roof. Never edge-to-edge zoom. Never a tiny floating car. ` +
    // —— Background / shadow ——
    `BACKGROUND: pure seamless #FFFFFF. No gradient, floor line, props, or environment. ` +
    `SHADOW: one soft realistic contact/drop shadow under the car — light grey, short, diffused. ` +
    // —— Light / realism ——
    `LIGHTING: soft-box studio, even, gentle paint reflections. No hard specular blowouts. ` +
    `RENDER: photoreal dealership photography. Not plastic, toy, or CGI. ` +
    `No text, logos, watermarks, people, or extra objects. Single 1:1 square thumbnail-ready image.`
  );
}

/** Text-only fallback — same locked geometry when no reference photo is available. */
export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim() || "accurate factory color from the model";
  return (
    `Professional luxury-car inventory thumbnail of a ${label} in ${color}. ` +
    `ORIENTATION: front bumper/headlights/grille at the BOTTOM of the frame; roof toward the TOP; rear wing near the TOP if visible. ` +
    `Never put the nose at the top (that is upside down). ` +
    `HARD BAN: no front 3/4, no side 3/4, no eye-level hero. High bird's-eye front-half crop. ` +
    `Car fills 65–75% of the square with ~10–15% white margin on all sides. ` +
    `Pure #FFFFFF, soft under-car drop shadow. Photoreal dealership studio photo. No text or logos.`
  );
}

/**
 * Dual-image contract: style-lock is composition master; subject is identity only.
 * generate-thumb attaches style-lock as image[0], subject as image[1].
 */
export function buildStyleLockAddendum(): string {
  return (
    ` DUAL-IMAGE RULES (mandatory): Image 0 is the COMPOSITION MASTER (style lock). ` +
    `Image 1 is the CAR IDENTITY ONLY (subject listing photos). ` +
    `Output MUST match Image 0 for: camera height, pitch, orientation with FRONT at BOTTOM of frame and roof toward TOP, ` +
    `front-half crop, balanced margins, soft under-car shadow, pure white background. ` +
    `Output MUST match Image 1 for: body shape, paint, badges, wheels, unique details. ` +
    `Discard Image 1's camera angle, rotation, and crop entirely. ` +
    `If unsure which way is up: headlights and front badge go toward the BOTTOM edge; rear wing/spoiler toward the TOP. ` +
    `Think: drop the car from Image 1 into Image 0's overhead template — front at bottom, never upside down.`
  );
}
