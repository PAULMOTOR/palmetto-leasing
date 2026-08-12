/**
 * Locked Palmetto studio tile template — product photography contract.
 * Only car identity (year/make/model/color from references) may change.
 * Target: high bird's-eye front-half crop, balanced margins, soft shadow, photoreal.
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
    // —— Hard ban on wrong angles ——
    `HARD BAN — never produce any of these: front 3/4 hero shot, side 3/4, low front view, ` +
    `eye-level driveway photo, rolling shot, showroom floor perspective, diagonal corner view, ` +
    `convertible glamour pose, or any camera that shows the full side profile or wheels as side ellipses. ` +
    `If the subject photo is a 3/4, side, or low angle (common for spiders/convertibles), IGNORE that camera completely — rebuild from scratch as overhead. ` +
    // —— Camera ——
    `CAMERA (mandatory): high bird's-eye product shot from directly above the front of the car. ` +
    `Lens nearly straight down with a tiny pitch so HOOD and ROOF dominate; grille secondary at the bottom of the car mass. ` +
    `Nose points straight to the TOP of the square. Symmetric left-right. ` +
    `Clear view of hood top, both front fenders from above, windshield top edge, and roof — plan-view with slight depth. ` +
    // —— Crop + breathing room (anti-truncation) ——
    `FRAMING: front half only — bumper through mid-roof / just past the windshield base. Rear half cropped out. ` +
    `Body axis vertical (nose up). Perfectly centered. ` +
    `SCALE / MARGINS (critical): the full car silhouette must fit inside the square with even white breathing room on ALL four sides. ` +
    `Target car height about 65–75% of the frame — NOT edge-to-edge. ` +
    `Leave roughly 10–15% pure white above the front bumper and 10–15% pure white below the cut of the roof/rear crop. ` +
    `Never clip the front bumper, mirrors, or roof edge. Never zoom so tight that top or bottom is truncated. ` +
    `Never leave a tiny floating car either — balanced fill, not empty void, not edge-cropped. ` +
    // —— Background / shadow ——
    `BACKGROUND: pure seamless #FFFFFF. No gradient, floor line, props, or environment. ` +
    `SHADOW: one soft realistic contact/drop shadow under the car only — light grey, short, diffused. ` +
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
    `HARD BAN: no front 3/4, no side 3/4, no eye-level hero, no diagonal driveway shot. ` +
    `High bird's-eye from above the front: hood and roof dominate, nose straight UP, front half only. ` +
    `Car fills 65–75% of the square with ~10–15% white margin on all sides — never clip bumper or roof. ` +
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
    `Output MUST match Image 0 for: camera height, pitch, nose-up orientation, front-half crop, ` +
    `balanced scale with white margins on all sides (never edge-cropped), soft under-car shadow, and pure white background. ` +
    `Output MUST match Image 1 for: make/model body shape, paint color, badges, wheels, and unique details. ` +
    `Completely discard Image 1's camera angle, pose, crop, and empty space — never copy a 3/4 or side shot from Image 1. ` +
    `Think: put the car from Image 1 into the exact overhead studio template of Image 0, with breathing room so nothing is clipped.`
  );
}
