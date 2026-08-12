/**
 * Locked Palmetto studio tile template — product photography contract.
 * Only car identity (year/make/model/color from references) may change.
 * Target: high bird's-eye front-half crop, large fill, soft shadow, photoreal.
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
    // —— Hard ban on wrong angles (common failure mode) ——
    `HARD BAN — never produce any of these: front 3/4 hero shot, side 3/4, low front view, ` +
    `eye-level driveway photo, rolling shot, showroom floor perspective, diagonal corner view, ` +
    `or any camera that shows the full side of the car or the wheels as ellipses from the side. ` +
    `If the subject photo is a 3/4 or side angle, IGNORE that camera completely — rebuild the shot from scratch. ` +
    // —— Camera / perspective ——
    `CAMERA (mandatory, identical every time): high bird's-eye product shot from directly above the front of the car. ` +
    `Lens looks nearly straight down with a tiny pitch so the HOOD and ROOF fill most of the frame; the grille is secondary and small at the bottom of the car mass. ` +
    `Photographer on a tall ladder over the front bumper. Nose of the car points straight to the TOP of the square frame. ` +
    `You must clearly see the top of the hood, both front fenders from above, windshield top edge, and roof — like a plan view with slight depth. ` +
    // —— Crop / framing ——
    `FRAMING: front half only — bumper through mid-roof / just past the windshield base. Rear half cropped out. ` +
    `Body axis perfectly vertical (nose up, tail down off-frame). Perfectly centered left-right. ` +
    `SCALE: car fills 75–85% of frame height and 70–80% of width. Thin even white margin only (6–12%). No tiny floating car. ` +
    // —— Background / shadow ——
    `BACKGROUND: pure seamless #FFFFFF. No gradient, floor line, props, or environment. ` +
    `SHADOW: one soft realistic contact/drop shadow under the car only — light grey, diffused, short. Car grounded, not floating cut-out. ` +
    // —— Light / realism ——
    `LIGHTING: soft-box studio, even, gentle paint reflections. No hard specular blowouts, no cinematic HDR. ` +
    `RENDER: photoreal dealership photography — real metal, glass, rubber. Not plastic, toy, or over-smoothed CGI. ` +
    `No text, logos, watermarks, people, or extra objects. Single square thumbnail-ready image.`
  );
}

/** Text-only fallback — same locked geometry when no reference photo is available. */
export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim() || "accurate factory color from the model";
  return (
    `Professional luxury-car inventory thumbnail of a ${label} in ${color}. ` +
    `HARD BAN: no front 3/4, no side 3/4, no eye-level hero, no diagonal driveway shot. ` +
    `High bird's-eye from above the front: hood and roof dominate, nose points straight UP, front half only. ` +
    `Car fills 75–85% of the square with thin white margins. Pure #FFFFFF, soft under-car drop shadow. ` +
    `Photoreal dealership studio photo. No text or logos.`
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
    `Output MUST match Image 0 for: camera height, pitch, nose-up orientation, front-half crop, scale/fill of the square, soft under-car shadow, and pure white background. ` +
    `Output MUST match Image 1 for: make/model body shape, paint color, badges, wheels, and unique details. ` +
    `Completely discard Image 1's camera angle, pose, crop, and empty space — never copy a 3/4 or side shot from Image 1. ` +
    `Think: put the car from Image 1 into the exact overhead studio template of Image 0.`
  );
}
