/**
 * Canonical prompt template for Palmetto studio thumbnails.
 * Accuracy: use dealer photo as reference via image edit whenever possible.
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
 * Party-trick tile: pure white studio, bird's-eye top-down of THIS car.
 * Always pair with image_edit + 1–2 real dealer photos for color/shape fidelity.
 */
export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim()
    ? `Match the exact exterior paint color from the reference photo (${car.exteriorColor}).`
    : `Match the exact exterior paint color, wheel design, and body lines from the reference photo.`;

  return (
    `Product photography of this exact ${label} automobile, photographed straight down from directly above ` +
    `(true orthographic bird's-eye / top-down view as if from a ladder 20 feet above the car). ` +
    `Show the full roof, hood, windshield, rear deck, side mirrors, and wheels in correct proportion. ` +
    `${color} ` +
    `Preserve the real car's silhouette, badge placement, roof shape, and distinctive features from the reference — do not invent a different model. ` +
    `Pure seamless white studio background (#FFFFFF), soft even lighting, no people, no props, no text, no logos, no reflections of a showroom. ` +
    `Ultra-clean luxury e-commerce catalog style, high detail, centered composition, square crop friendly.`
  );
}

/** Fallback when no reference photo is available (less accurate — avoid when possible). */
export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim() || "factory color";
  return (
    `Ultra-realistic product photo of a ${label} in ${color}, pure top-down bird's-eye view from directly above, ` +
    `full car visible including hood, roof and rear, pure white background, studio lighting, luxury catalog style, no text.`
  );
}
