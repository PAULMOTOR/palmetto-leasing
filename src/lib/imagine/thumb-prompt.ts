/**
 * Locked Palmetto studio tile template.
 * Only car identity (year/make/model/color/body) may change.
 * Camera, crop, lighting, pure white bg, orientation = fixed forever.
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
 * Fixed composition contract (matches original Palmetto comp):
 * - Elevated top-down, front of car ALWAYS toward top of frame
 * - Centered, consistent scale, pure #FFFFFF (no grey)
 * - Soft even light, no drop shadow floor
 * - Identity from dealer reference only
 */
export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const colorBit = car.exteriorColor?.trim()
    ? `Paint must match the reference exactly (${car.exteriorColor}).`
    : `Paint, wheels, and body details must match the subject reference photo exactly.`;

  return (
    `LOCKED CATALOG TEMPLATE — identical framing for every vehicle. ` +
    `Subject: this exact real ${label} only. ${colorBit} ` +
    `CAMERA (never vary): pure bird's-eye orthographic top-down, camera directly above the roof, ` +
    `front of the car ALWAYS points straight to the TOP edge of the frame (nose up), never rotated left/right/diagonal/upside-down. ` +
    `FRAMING (never vary): car perfectly centered; full vehicle visible (hood, roof, rear, mirrors, wheels); ` +
    `car width fills ~70% of the frame; equal white margin on all sides; square 1:1 crop. ` +
    `BACKGROUND (critical): seamless solid pure white #FFFFFF only — not light grey, not off-white, not gradient, not studio seamless paper grey. ` +
    `No floor plane, no drop shadow under the car, no vignette, no reflections, no props, no people, no text, no logos, no watermarks. ` +
    `LIGHTING (never vary): soft even overhead studio light, minimal soft shading on body only, no hard shadows on the background. ` +
    `Preserve real silhouette, roof shape, and badges from the subject reference — do not invent a different model. ` +
    `Ultra-clean luxury e-commerce product tile, photoreal, high detail.`
  );
}

/** Text-only fallback — same locked geometry. */
export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const color = car.exteriorColor?.trim() || "accurate factory color";
  return (
    `LOCKED CATALOG TEMPLATE. Photoreal ${label} in ${color}, pure bird's-eye top-down, ` +
    `nose pointing straight to top of frame, car centered filling 70% width, ` +
    `solid pure white background #FFFFFF only (no grey, no shadow, no floor), ` +
    `soft even light, square 1:1, no text no logos.`
  );
}

/** Style lock instructions when a composition reference image is also provided. */
export function buildStyleLockAddendum(): string {
  return (
    ` If a style/composition reference is provided, match its camera height, nose-up orientation, scale, margins, ` +
    `pure #FFFFFF background, and lighting exactly — only the car's identity and color come from the subject photo.`
  );
}
