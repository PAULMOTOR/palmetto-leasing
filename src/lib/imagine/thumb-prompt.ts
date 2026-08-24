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
    `Subject photos are this VIN only — copy its REAL body. ` +
    `Image 2 (when present) is a REAR or 3/4 of this exact car: engine cover, rear window OR no window, louvers, spoiler, and tail lights MUST match Image 2. ` +
    `If Image 2 shows a louvered deck / no rear glass (e.g. 812 Competizione), do NOT paint a rear window. ` +
    `Do not invent a rear spoiler, wing, ducktail, body kit, or extra vents unless they are visible on the subject photos (G-Wagons often have NO wing). ` +
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
    `CANVAS (mandatory): the photograph BLEEDS to all four edges of the square. ` +
    `Pixel (0,0) and every edge pixel are the same seamless floor as under the car. ` +
    `FORBIDDEN: a white picture-frame, letterbox, gray plate inset inside a white tile, polaroid border, or any margin of a different color. ` +
    `FLOOR (identical on every tile): pure #FFFFFF (RGB 255,255,255) cyclorama — not gray, not #EEE, not #F5F5F5, not a paper sweep. ` +
    `Do NOT copy the gray studio floor from dealer photos. ` +
    `SHADOW (identical on every tile): one soft short contact shadow hugging the tires, light gray (~12% opacity), same as the template. No hard oval drop-shadow. ` +
    `Car ~70% of frame height with even 8–12% WHITE margin that IS the floor, not a second frame. ` +
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
    `Copy Image 0 for camera height, long proportions, studio lighting, windshield/cabin lighting, WHITE floor, and the contact shadow. ` +
    `Copy Images 1–2 for identity: exact body, rear window or NO rear window, wing or NO wing, exact paint, exact wheels, exact interior. ` +
    `Image 2 is the rear/3/4 when present — trust it over a generic model memory (rare 812s have louvers instead of glass). ` +
    `NEVER copy Image 1–2's gray floor, outdoor light, cutout, or wide-angle lens. NEVER copy Image 0's paint color or brand. ` +
    `Final check: floor #FFFFFF to every edge (no white frame around a gray plate); long not spherical; headlights off; seats lit; rear matches Image 2; no invented glass or wing.`
  );
}
