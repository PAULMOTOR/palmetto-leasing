/**
 * Locked Palmetto studio tile template.
 *
 * Approved look — public/vehicles/palmetto-style-lock.jpg (blue California, long/skinny):
 *   - HIGH overhead, slightly toward the front — car looks LONG and SLENDER, never ball-like
 *   - Telephoto from far above (no close wide-angle)
 *   - Nose DOWN / rear UP, full car, dead-centered
 *   - Headlights OFF
 *   - True in-studio soft-box cyclorama (not an outdoor cutout)
 *   - Interior leather readable through glass, lit from above
 */
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";

export type ThumbSubject = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  exteriorColor?: string;
  interiorColor?: string;
  bodyStyle?: string;
};

function subjectLine(car: ThumbSubject): string {
  return vehicleDisplayTitle(car);
}

export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = subjectLine(car);
  const colorBit = car.exteriorColor?.trim()
    ? `Exact exterior paint: ${car.exteriorColor}.`
    : `Exact paint, body lines, and badges from the subject photos.`;
  const interiorBit = car.interiorColor?.trim()
    ? `Interior leather/color: ${car.interiorColor} — must be clearly visible and lit.`
    : `Show the real interior color from the subject photos, clearly lit.`;
  const darkBit =
    /black|nero|nero daytona|panther|obsidian|carbon|midnight|dark/i.test(
      `${car.exteriorColor || ""} ${label}`,
    )
      ? `DARK exterior — invent studio speculars on hood/shoulders so it is glossy, not a flat blob. `
      : `If subject photos are dark or flat, still invent studio speculars so paint has dimension. `;

  return (
    `Photoreal luxury inventory thumbnail of this exact car: ${label}. ${colorBit} ${interiorBit} ` +
    `Subject photos are this VIN only — copy its REAL body. Do not invent a rear spoiler, wing, ducktail, body kit, or extra vents unless they are visible on the subject photos (G-Wagons and many Mercedes have NO wing). ` +
    `Ignore text, banners, prices, watermarks, and overlays. ` +
    // —— Shape: long and skinny, not a ball ——
    `SHOW THE ENTIRE CAR nose to tail. The car must look LONG and SLENDER in the frame, like a scale model shot from a high boom. ` +
    `Hood, cabin, and rear deck each get similar visual length. You see a lot of roof AND the rear haunches/boot. ` +
    `FORBIDDEN: a short, wide, ball-like car. FORBIDDEN: fat nose / huge grille with a stubby tail. That is a close wide-angle and rejected. ` +
    // —— Center ——
    `CENTERING: dead-centered. Longitudinal axis = vertical midline. Equal white left and right. Hood badge on the centerline. ` +
    // —— Orientation ——
    `ORIENTATION: nose DOWN (front at BOTTOM), rear UP (tail lights / boot at TOP). Driving toward the bottom edge. Never upside down. ` +
    // —— Camera: high overhead telephoto (the skinny California) ——
    `CAMERA (mandatory): HIGH OVERHEAD, slightly toward the front — a boom/telephoto 100–200mm from FAR AWAY and ABOVE. ` +
    `You are looking down onto the roof, hood, and rear in one glance. The car is elongated top-to-bottom in the square. ` +
    `Front fascia is visible at the bottom as a modest strip — NOT a hero close-up of the grille. ` +
    `FORBIDDEN: camera parked close in front of the bumper. FORBIDDEN: wide-angle, 24mm, fisheye, phone selfie of the nose. ` +
    `FORBIDDEN: pure nadir (headlights hidden). FORBIDDEN: eye-level 3/4, side profile, rear 3/4. ` +
    `Tilt ~25–35° from vertical — more top-down than front-on. Same as the template. ` +
    // —— Wheels ——
    `WHEELS: steering straight 0°. From this height tires sit in the arches; do not paint turned sidewalls. Copy real wheels from subject photos. ` +
    // —— Canvas ——
    `SQUARE output, #FFFFFF to every edge. No letterbox, no cutout halo, no gray studio plate. Car ~70% of frame height, even 8–12% white margin. ` +
    // —— True studio, not a Photoshop extract ——
    `The car was PHOTOGRAPHED in a seamless white cyclorama. It is NOT an outdoor photo with the background deleted. ` +
    `FORBIDDEN: cut-out edges, fringe, fake floating sticker, hard drop-shadow, ground that looks like a white oval under a pasted car. ` +
    `SHADOW: one soft, short contact shadow hugging the tires/rockers — the car sits in the white, it is not stuck on. ` +
    `HEADLIGHTS OFF. DRLs off. No glowing lamps. ` +
    // —— Interior through glass ——
    `INTERIOR (mandatory): look through the windshield (or open cabin on convertibles). Leather seats, dash, and steering wheel are READABLE. ` +
    `A large SOFTBOX from ABOVE lights the cabin — same catalog lighting as the exterior. Seats must not sit in a dark cave. ` +
    `Windshield is clean glass with a gentle gradient; no white glare streaks or outdoor tree reflections. ` +
    // —— Paint ——
    `LIGHTING: large overhead soft-boxes wrapping the body, luxury catalog. ${darkBit}` +
    `A few tight specular kicks on hood creases and shoulders. Not feathered airbrush, not chaotic hotspots. ` +
    `NO TEXT, plates, people, or props. Output one 1:1 square that bleeds to the edges.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = subjectLine(car);
  const color = car.exteriorColor?.trim() || "factory-accurate color";
  return (
    `Photoreal studio thumbnail of a complete ${label} in ${color}, photographed in a white cyclorama. ` +
    `LONG slender car, HIGH overhead telephoto — not a ball, not a close wide-angle of the nose. ` +
    `Nose DOWN, rear UP, full roof + rear deck visible. Headlights OFF. ` +
    `Interior leather clearly lit from above through the glass. ` +
    `Soft contact shadow, not a cutout. Pure #FFFFFF to the edges. No text. No invented rear wing.`
  );
}

export function buildStyleLockAddendum(): string {
  return (
    ` MULTI-IMAGE RULES: Image 0 is the TEMPLATE (long slender car, high overhead telephoto, nose DOWN, headlights OFF, lit interior, true white cyclorama). ` +
    `Images 1 and 2 (if present) are THIS listing's dealer photos — different angles of the same VIN. ` +
    `Copy Image 0 for camera height, long proportions, studio lighting, windshield/cabin lighting, and white ground. ` +
    `Copy Images 1–2 for identity: exact body (wing or NO wing), exact paint, exact wheels, exact interior color. ` +
    `NEVER add a spoiler/wing/kit that is not in Images 1–2. NEVER copy Image 1's outdoor lighting, cutout, or wide-angle lens. ` +
    `NEVER copy Image 0's paint color or brand. ` +
    `Final check: car looks long not spherical; headlights off; seats lit; no fake wing; no cutout shadow; white to all four edges.`
  );
}
