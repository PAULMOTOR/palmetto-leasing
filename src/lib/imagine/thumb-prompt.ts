/**
 * Locked Palmetto studio tile template — admin-defined product photography contract.
 * Only car identity (year/make/model/color from references) may change.
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
 * in the reference images. Style requirements must be followed exactly.
 */
export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const colorBit = car.exteriorColor?.trim()
    ? `Match the exact paint color from the references (${car.exteriorColor}).`
    : `Match the exact paint color, body lines, badges, and wheels from the reference images.`;

  return (
    `Create a clean, high-end product photography thumbnail of the exact car shown in the reference images ` +
    `(this real ${label} only). ${colorBit} ` +
    `Style requirements (must be followed exactly): ` +
    `Pure seamless white background (#FFFFFF), no gradients, no floor, no shadows cast on the background. ` +
    `Soft-box studio lighting only — even, diffused, soft reflections on the paint, no harsh specular highlights or dramatic lighting. ` +
    `Camera angle: strict overhead top-down view looking straight down at the front half of the car. ` +
    `Framing: only the front 55-65% of the car is visible (front bumper to roughly the middle of the roof / just past the windshield). Crop out the rear half completely. ` +
    `Orientation: front of the car pointing toward the top of the frame, perfectly centered horizontally. ` +
    `The car must sit alone in the frame with generous white space around it. ` +
    `Photorealistic, ultra-clean dealership inventory style, matching the exact body lines, badges, wheels, and paint color from the references. ` +
    `No text, no logos, no watermarks, no people, no extra objects, no environment. ` +
    `Output a single, tightly composed, professional thumbnail-ready image.`
  );
}

/** Text-only fallback — same locked geometry when no reference photo is available. */
export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim() || "accurate factory color from the model";
  return (
    `Create a clean, high-end product photography thumbnail of a ${label} in ${color}. ` +
    `Pure seamless white background (#FFFFFF), no gradients, no floor, no shadows on the background. ` +
    `Soft-box studio lighting only — even, diffused. ` +
    `Strict overhead top-down view of the front half of the car only (front 55-65%, bumper to mid-roof / past windshield); crop out the rear. ` +
    `Front of the car pointing toward the top of the frame, perfectly centered, generous white space. ` +
    `Photorealistic dealership inventory style. No text, logos, people, or environment.`
  );
}

/** When a style-lock reference is also attached. */
export function buildStyleLockAddendum(): string {
  return (
    ` If a composition/style reference is provided, match its overhead front-half crop, nose-up orientation, ` +
    `pure #FFFFFF background, soft-box lighting, and white margins exactly — only the car identity and color come from the subject reference photos.`
  );
}
