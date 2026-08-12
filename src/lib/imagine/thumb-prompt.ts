/**
 * Locked Palmetto studio tile template — product photography contract.
 * Only car identity (year/make/model/color from references) may change.
 * Target: high bird's-eye front-half crop, nose UP, balanced margins, soft shadow.
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
    // —— Orientation lock (prevents upside-down / rear-up failures) ——
    `ORIENTATION (non-negotiable): the FRONT of the car (front bumper, headlights, grille, brand badge) ` +
    `must point toward the TOP edge of the square frame. The rear of the car points toward the BOTTOM and is mostly cropped out. ` +
    `NEVER render the car upside down or rear-up. ` +
    `If the car has a rear wing, spoiler, or engine cover vents at the back (e.g. GT2 RS, GT3, Supra, etc.), ` +
    `those parts must be at the BOTTOM of the frame or fully cropped off — NEVER at the top. ` +
    `Headlights and front badge are always in the upper half of the car silhouette. ` +
    `Double-check before finishing: top of image = front nose; bottom of image = mid-roof / toward rear. ` +
    // —— Hard ban on wrong angles ——
    `HARD BAN — never produce any of these: front 3/4 hero shot, side 3/4, low front view, ` +
    `eye-level driveway photo, rolling shot, showroom floor perspective, diagonal corner view, ` +
    `convertible glamour pose, rear-three-quarter, or any camera that shows the full side profile. ` +
    `If the subject photo is a 3/4, side, low, or rear-biased angle, IGNORE that camera completely — rebuild as overhead nose-UP. ` +
    // —— Camera ——
    `CAMERA (mandatory): high bird's-eye product shot from directly above the FRONT of the car. ` +
    `Lens nearly straight down with a tiny pitch so HOOD and ROOF dominate; grille secondary within the front mass near the TOP of the frame. ` +
    `Symmetric left-right. Clear view of hood top, both front fenders from above, windshield top edge, and roof. ` +
    // —— Crop + breathing room ——
    `FRAMING: front half only — front bumper (near top of frame) through mid-roof / just past the windshield base (toward bottom). Rear half cropped out. ` +
    `Body axis vertical (nose UP). Perfectly centered. ` +
    `SCALE / MARGINS: full silhouette fits inside the square with even white breathing room on all four sides. ` +
    `Car height about 65–75% of the frame. ~10–15% pure white above the front bumper and below the roof cut. ` +
    `Never clip bumper, mirrors, or roof. Never zoom edge-to-edge. Never leave a tiny floating car. ` +
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
    `ORIENTATION: front bumper/headlights/grille point to the TOP of the frame; rear wing/spoiler never at the top (crop or place at bottom). ` +
    `Never upside down. HARD BAN: no front 3/4, no side 3/4, no eye-level hero. ` +
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
    `Output MUST match Image 0 for: camera height, pitch, NOSE-UP orientation (front at TOP of frame), front-half crop, ` +
    `balanced scale with white margins on all sides (never edge-cropped), soft under-car shadow, and pure white background. ` +
    `Output MUST match Image 1 for: make/model body shape, paint color, badges, wheels, and unique details. ` +
    `Completely discard Image 1's camera angle, pose, crop, rotation, and empty space — never copy a 3/4, side, or upside-down pose from Image 1. ` +
    `If Image 1 shows a rear wing at the top of its photo, flip the mental model: rear wing goes to the BOTTOM or is cropped; front nose goes to the TOP. ` +
    `Think: put the car from Image 1 into the exact overhead studio template of Image 0, nose pointing UP, with breathing room so nothing is clipped.`
  );
}
