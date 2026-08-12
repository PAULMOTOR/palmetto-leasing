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
    `Professional luxury-car inventory thumbnail of the exact vehicle in the reference photos ` +
    `(this real ${label} only — faithful to its body lines, badges, wheels, and paint). ${colorBit} ` +
    // —— Camera / perspective (THE key consistency lock) ——
    `CAMERA (mandatory, identical every time): high bird's-eye product shot from above and slightly in front of the car. ` +
    `The lens looks almost straight down, but pitched just enough that the hood and roof dominate the frame and the grille is secondary. ` +
    `Think: photographer on a tall ladder above the front bumper, not eye-level front-on. ` +
    `Do NOT use a low front 3/4 hero angle. Do NOT use a pure vertical nadir (no flat 2D roof plan). ` +
    `You must clearly see: top of the hood, top of the fenders, windshield top edge, and the roof/A-pillars — more "top of car" than "front of car". ` +
    // —— Crop / framing ——
    `FRAMING (mandatory): front half of the car only — front bumper through roughly mid-roof / just past the base of the windshield. ` +
    `Crop the rear half completely. Nose points straight toward the TOP of the frame, body axis perfectly vertical, car centered left-right. ` +
    `SCALE: the car must fill the frame tightly. Target about 75–85% of the image height and 70–80% of the width. ` +
    `Keep only a thin even white margin around the car (roughly 6–12% on each side). ` +
    `Do NOT float a small car in a huge empty white field. Do NOT leave large empty white bands above the bumper or beside the mirrors. ` +
    // —— Background / shadow ——
    `BACKGROUND: pure seamless #FFFFFF studio white — no gradient, no floor line, no props, no environment. ` +
    `SHADOW: one soft, realistic contact / drop shadow under the car body only — subtle, diffused, light grey, never harsh or long. ` +
    `The shadow must sit on the white plane so the car feels grounded, not floating and not cut-out. ` +
    // —— Light / realism ——
    `LIGHTING: soft-box studio lighting, even and diffused, gentle reflections on paint and glass. ` +
    `No hard specular blowouts, no dramatic cinematic rims, no HDR glow. ` +
    `RENDER: photorealistic high-end dealership photography — real metal, real glass, real rubber. ` +
    `Not plastic, not toy-like, not over-smoothed CGI, not illustration. ` +
    `No text, logos, watermarks, people, or extra objects. Single image, ready for a white inventory tile.`
  );
}

/** Text-only fallback — same locked geometry when no reference photo is available. */
export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim() || "accurate factory color from the model";
  return (
    `Professional luxury-car inventory thumbnail of a ${label} in ${color}. ` +
    `High bird's-eye product shot from above and slightly in front: hood and roof dominate, grille is secondary — not a low front hero angle, not a flat 2D plan view. ` +
    `Front half only (bumper to mid-roof / past windshield base); rear cropped out. Nose points straight UP, body centered. ` +
    `Car fills 75–85% of frame height with only thin even white margins — no large empty white negative space. ` +
    `Pure #FFFFFF background. Soft realistic contact/drop shadow under the car. Soft-box lighting. ` +
    `Photoreal dealership photography (not toy, not CGI plastic). No text, logos, people, or environment.`
  );
}

/** When a style-lock reference is also attached. */
export function buildStyleLockAddendum(): string {
  return (
    ` CRITICAL: match the composition style reference EXACTLY for camera height, pitch, crop, scale, and shadow. ` +
    `Copy its high bird's-eye front-half framing (more hood/roof, less pure front fascia), ` +
    `its tight fill of the square (large car, thin white margins), its soft under-car drop shadow, ` +
    `and its pure #FFFFFF background. Only the specific car identity, body shape, and paint color come from the subject reference photos — ` +
    `never copy the subject photo's camera angle or empty white space.`
  );
}
