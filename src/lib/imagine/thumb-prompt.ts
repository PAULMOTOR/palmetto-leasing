/**
 * Locked Palmetto studio tile template.
 *
 * Approved look — match public/vehicles/palmetto-style-lock.jpg (yellow Urus):
 *   - TELEPHOTO compression (even nose-to-tail, no wide-angle fat-nose)
 *   - FULL car visible, nose DOWN / rear UP, dead-centered
 *   - Elevated front-top (grille + roof both readable), NOT nadir, NOT 3/4
 *   - Headlights OFF
 *   - Soft-box wrap + a few crisp body speculars; clean windshield (no glare streaks)
 *   - Pure white fills the square edge-to-edge
 */
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";

export type ThumbSubject = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  exteriorColor?: string;
  bodyStyle?: string;
};

function subjectLine(car: ThumbSubject): string {
  return vehicleDisplayTitle(car);
}

export function buildThumbEditPrompt(car: ThumbSubject): string {
  const label = subjectLine(car);
  const colorBit = car.exteriorColor?.trim()
    ? `Exact paint from references: ${car.exteriorColor}.`
    : `Exact paint, body lines, and badges from the subject references.`;
  const darkBit =
    /black|nero|nero daytona|panther|obsidian|carbon|midnight|dark/i.test(
      `${car.exteriorColor || ""} ${label}`,
    )
      ? `This is a DARK car — you MUST invent studio highlights so it does not read as a flat silhouette. `
      : `If the subject photo is dark or low-contrast, still invent the same studio highlights so the paint does not go flat. `;

  return (
    `Create a photorealistic luxury dealership inventory thumbnail of this exact car: ${label}. ${colorBit} ` +
    `Use the references only for the car's identity (shape, paint, badges). Ignore any text, banners, prices, watermarks, or photo overlays in the references. ` +
    // —— Full car ——
    `SHOW THE ENTIRE CAR — nose to tail, complete silhouette. Do not crop to front half only. ` +
    `Mirrors, roof, rear bumper, and any rear wing must all be inside the frame. ` +
    // —— Dead-center placement ——
    `CENTERING (mandatory): the car is perfectly dead-centered in the square on both axes. ` +
    `The car's longitudinal centerline is the exact vertical midline of the image — equal white space left and right, pixel-perfect. ` +
    `The hood badge / front emblem sits on that vertical centerline. ` +
    `Do not shift the car left, right, up, or down. ` +
    // —— Orientation ——
    `ORIENTATION LOCK: the nose of the car points DOWN. ` +
    `Front bumper, headlights, and grille are at the BOTTOM of the image. ` +
    `The rear of the car (tail lights, rear bumper, rear wing/spoiler) is at the TOP of the image. ` +
    `Think: the car is driving toward the bottom edge of the square. ` +
    `NEVER put the nose at the top. NEVER put the rear wing at the bottom. That is upside down and rejected. ` +
    // —— Telephoto camera (the Urus_before look) ——
    `LENS (mandatory): TELEPHOTO / long-lens compression, as if shot with an 85–200mm from far away and above. ` +
    `The car has EVEN PROPORTIONS — front track and rear track look the same width. Roof, hood, and rear haunches share similar scale. ` +
    `FORBIDDEN: wide-angle, 24mm, 35mm, fisheye, GoPro, or a camera parked close to the nose. ` +
    `FORBIDDEN: fat oversized nose / grille / headlights with a tiny tapered rear ("big head, skinny butt"). That is wide-angle distortion and rejected. ` +
    `CAMERA HEIGHT: elevated FRONT-TOP — high and somewhat in front of the windshield, looking down the hood. ` +
    `Grille AND roof both readable. The windshield is a modest trapezoid, not a huge billboard. ` +
    `The front fascia is visible at the bottom but NOT enlarged. Rear wing/haunches stay substantial at the top. ` +
    `FORBIDDEN — drone / satellite / nadir / plan view (roof-only). ` +
    `FORBIDDEN — eye-level 3/4 hero, side profile, rear 3/4, low front shot. ` +
    `Tilt ~35–45° from vertical, same as the template. Body axis vertical in the frame. ` +
    // —— Wheels ——
    `WHEELS (mandatory): steering is locked STRAIGHT at 0°. Front wheels point exactly toward the bottom of the frame, parallel to the car's centerline. ` +
    `Do NOT turn, steer, or angle the wheels left or right. No opposite lock. No toe-out. Both fronts match. ` +
    `From this camera the tires sit in the arches — do not render visible turned tire sidewalls or wheel faces kicking out to the sides. ` +
    // —— Scale + fill the square ——
    `CANVAS: output a SQUARE (width in pixels == height). The photo fills that square EDGE TO EDGE. ` +
    `Background is pure #FFFFFF (RGB 255,255,255) to every pixel — never gray, never off-white, never a gray studio plate floating inside a white tile. ` +
    `No inset picture, no letterbox bars, no portrait crop, no landscape crop, no border, no frame. ` +
    `SCALE: whole car ~70% of frame height with even white margin (~8–12%) on all four sides. Nothing clipped. ` +
    // —— Lights ——
    `HEADLIGHTS OFF. DRLs off. Fog lamps off. Interior ambient lighting off. No glowing lamps. Lenses are dark glass, not lit. ` +
    // —— Windshield ——
    `WINDSHIELD: a clean, even dark-to-light studio gradient. You may faintly see seats. ` +
    `FORBIDDEN: bright white glare streaks, light-bar reflections, window blowouts, rainbow, or a strip of studio lights across the glass. ` +
    // —— Studio light: soft-box wrap + sparse crisp speculars ——
    `BACKGROUND: pure seamless #FFFFFF only. ` +
    `SHADOW: soft short contact shadow under the car, centered with the car. ` +
    `LIGHTING: large soft-box studio wrap — even, flattering, luxury catalog. Photoreal, not CGI plastic. ` +
    `PAINT: high-gloss OEM clearcoat. Wrap light reveals body planes; ADD a few tight, hard-edged specular kicks on hood creases, fenders, and shoulders (freshly waxed). ` +
    `${darkBit}` +
    `Place invented highlights along character lines and the hood center so black/dark paint still looks glossy and dimensional. ` +
    `FORBIDDEN: matte, satin, suede, rubberized, vinyl-wrap dullness, or a flat unlit black blob. ` +
    `FORBIDDEN: feathered/airbrushed highlight clouds that make the paint look fake. ` +
    `FORBIDDEN: chaotic hotspots, multiple random glare blobs, or ugly windshield reflections. ` +
    `NO TEXT of any kind — no letters, numbers, prices, slogans, "Warranty", "PPF", license-plate words, watermarks, logos, people, or props. ` +
    `Output one 1:1 square image that bleeds to the edges.`
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  const label = subjectLine(car);
  const color = car.exteriorColor?.trim() || "factory-accurate color";
  return (
    `Photoreal luxury inventory thumbnail of a complete ${label} in ${color}. ` +
    `ENTIRE car nose-to-tail. Perfectly dead-centered. ` +
    `ORIENTATION: nose DOWN — front bumper at BOTTOM, rear at TOP. ` +
    `LENS: telephoto 85–200mm from far away — EVEN proportions, no wide-angle fat nose / skinny rear. ` +
    `CAMERA: elevated front-top (grille AND roof both visible). NOT nadir, NOT close wide-angle. ` +
    `Headlights OFF. Clean windshield gradient — no glare streaks. ` +
    `Wheels steered STRAIGHT, hidden in the arches. ` +
    `Soft-box wrap plus a few crisp body speculars (invent them if the car is dark so it is not flat). ` +
    `Pure #FFFFFF fills the square edge to edge. Soft under-car shadow. No text, no gray inset, no 3/4 hero.`
  );
}

/** Style lock = telephoto camera + lighting. Subject = identity only. */
export function buildStyleLockAddendum(): string {
  return (
    ` DUAL-IMAGE RULES: Image 0 is the studio TEMPLATE (telephoto even proportions, elevated FRONT-TOP, nose DOWN, headlights OFF, clean windshield, soft-box + crisp body highlights, dead-centered, white to the edges). ` +
    `Image 1 is the SUBJECT car identity only (shape, paint color, badges). Discard overlays, captions, watermarks, and Image 1's camera. ` +
    `Copy Image 0 for LENS (telephoto, NOT wide-angle), camera height, nose-DOWN orientation, headlights OFF, windshield cleanliness, even centering, #FFFFFF square, soft contact shadow. ` +
    `Do NOT copy Image 0's paint color or body shape. ` +
    `Do NOT copy Image 1's lens (dealer phones are often wide-angle and will fatten the nose). ` +
    `PAINT COLOR from Image 1 / stated color only. If Image 1 is dark or flat, INVENT Image-0-style speculars so the car still looks glossy. ` +
    `Final check: even nose and tail width; no fisheye; headlights off; windshield free of glare streaks; glossy dimensional paint; wheels straight; no text; white to all four edges.`
  );
}
