/**
 * Locked Palmetto studio tile template.
 *
 * Approved composition (every tile) — match public/vehicles/palmetto-style-lock.jpg:
 *   - FULL car visible (nose to tail)
 *   - Nose / front bumper points DOWN (toward bottom of square)
 *   - Rear / wing points UP (toward top of square)
 *   - Front fascia AND roof both readable (elevated front-top, NOT nadir)
 *   - Front wheels STRAIGHT (no steered tires)
 *   - Car perfectly centered (longitudinal axis = vertical midline)
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
    // —— Camera: elevated FRONT-TOP, not nadir ——
    `CAMERA (mandatory): elevated FRONT-TOP product shot — the camera is above AND slightly in front of the car, looking down the hood toward the roof. ` +
    `You MUST clearly see the FRONT of the car (grille, headlights, bumper) AND the hood AND the roof. The windshield is a visible trapezoid. ` +
    `FORBIDDEN — true overhead / nadir / plan view looking straight down so only the roof is visible and the front fascia disappears. That angle is rejected. ` +
    `FORBIDDEN — eye-level 3/4 hero, side profile, rear 3/4, low front shot. ` +
    `Tilt is about 40–50 degrees from vertical (dealership catalog, same as the template). Body axis perfectly vertical in the frame. ` +
    // —— Wheels straight; hidden in arches from this camera ——
    `WHEELS (mandatory): steering is locked STRAIGHT at 0°. Front wheels point exactly toward the bottom of the frame, parallel to the car's centerline. ` +
    `Do NOT turn, steer, or angle the wheels left or right. No opposite lock. No toe-out. Both fronts match. ` +
    `From this camera the tires sit in the arches — do not render visible turned tire sidewalls or wheel faces kicking out to the sides. ` +
    // —— Scale + fill the square ——
    `CANVAS: the photograph fills the entire 1:1 square EDGE TO EDGE. Pure #FFFFFF to every pixel. ` +
    `No inset picture, no gray studio plate, no letterbox, no border, no frame, no polaroid margin. ` +
    `SCALE: whole car fits comfortably (~70% of frame height) with even white margin on all four sides (~8–12%). Nothing clipped. ` +
    // —— Studio ——
    `BACKGROUND: pure seamless #FFFFFF only. ` +
    `SHADOW: soft short contact shadow under the car, centered with the car. ` +
    `LIGHTING: soft-box studio, even, realistic paint and glass. Photoreal — not CGI plastic. ` +
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
    `CAMERA: elevated front-top (grille AND roof both visible). NOT a straight-down overhead. ` +
    `Wheels steered STRAIGHT, hidden in the arches. ` +
    `Pure #FFFFFF fills the square edge to edge. Soft under-car shadow. No text, no gray inset, no 3/4 hero.`
  );
}

/** Style lock = lighting / overhead full-car template. Subject = identity only. */
export function buildStyleLockAddendum(): string {
  return (
    ` DUAL-IMAGE RULES: Image 0 is the studio TEMPLATE (full car, elevated FRONT-TOP, nose DOWN / front at bottom, dead-centered, straight wheels, white to the edges). ` +
    `Image 1 is the SUBJECT car identity only (paint, body, badges). Discard every overlay, caption, and watermark on Image 1. ` +
    `Output MUST match Image 0 for: elevated front-top camera (front fascia visible, not nadir), nose-DOWN orientation, ` +
    `straight unturned wheels, perfect centering, white background filling the square edge-to-edge, soft shadow, equal margins. ` +
    `Output MUST match Image 1 for car identity only. ` +
    `Discard Image 1's angle, rotation, steered wheels, text, and off-center framing completely. ` +
    `Final check: car dead-center; headlights and grille readable near the BOTTOM; roof visible; rear at TOP; wheels straight; no text; white to all four edges.`
  );
}
