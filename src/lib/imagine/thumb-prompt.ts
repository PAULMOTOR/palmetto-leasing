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
    `CAMERA (mandatory): copy the TEMPLATE camera. Elevated FRONT-TOP — camera sits above AND in front of the windshield, looking down the hood. ` +
    `The FRONT FACE of the car (grille, headlights, bumper) must fill much of the BOTTOM third of the square, as large and readable as the roof. ` +
    `The windshield is a wide trapezoid, not a thin slit. You are looking slightly down the nose, not straight down at the roof. ` +
    `FORBIDDEN — drone / satellite / nadir / plan view (roof-only, headlights tiny or hidden). Classic cars like Testarossa are often listed as top-down photos — NEVER copy that angle. ` +
    `FORBIDDEN — eye-level 3/4 hero, side profile, rear 3/4, low front shot. ` +
    `Tilt ~40–50° from vertical, same as the template. Body axis vertical in the frame. ` +
    // —— Wheels straight; hidden in arches from this camera ——
    `WHEELS (mandatory): steering is locked STRAIGHT at 0°. Front wheels point exactly toward the bottom of the frame, parallel to the car's centerline. ` +
    `Do NOT turn, steer, or angle the wheels left or right. No opposite lock. No toe-out. Both fronts match. ` +
    `From this camera the tires sit in the arches — do not render visible turned tire sidewalls or wheel faces kicking out to the sides. ` +
    // —— Scale + fill the square ——
    `CANVAS: output a SQUARE (width in pixels == height). The photo fills that square EDGE TO EDGE. ` +
    `Background is pure #FFFFFF (RGB 255,255,255) to every pixel — never gray, never off-white, never a gray studio plate floating inside a white tile. ` +
    `No inset picture, no letterbox bars, no portrait crop, no landscape crop, no border, no frame. ` +
    `SCALE: whole car ~70% of frame height with even white margin (~8–12%) on all four sides. Nothing clipped. ` +
    // —— Studio ——
    `BACKGROUND: pure seamless #FFFFFF only. ` +
    `SHADOW: soft short contact shadow under the car, centered with the car. ` +
    `LIGHTING: soft-box studio, even, realistic paint and glass. Photoreal — not CGI plastic. ` +
    `PAINT (mandatory): high-gloss OEM clearcoat with crisp, hard-edged specular highlights and sharp reflections in body panels and glass — like a freshly waxed show car. ` +
    `Copy the GLOSS of the template. Highlights are tight streaks and bright studio-light kicks, not soft clouds. ` +
    `FORBIDDEN: matte, satin, suede, rubberized, or vinyl-wrap dullness. ` +
    `FORBIDDEN: feathered, airbrushed, or soft-gradient highlights that flatten the paint and make it look fake. ` +
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
    `Pure #FFFFFF fills the square edge to edge. Soft under-car shadow. High-gloss paint with crisp specular highlights — not matte, not airbrushed. No text, no gray inset, no 3/4 hero.`
  );
}

/** Style lock = lighting / overhead full-car template. Subject = identity only. */
export function buildStyleLockAddendum(): string {
  return (
    ` DUAL-IMAGE RULES: Image 0 is the studio TEMPLATE (full car, elevated FRONT-TOP, nose DOWN / front at bottom, dead-centered, straight wheels, white to the edges). ` +
    `Image 1 is the SUBJECT car identity only (paint, body, badges). Discard every overlay, caption, and watermark on Image 1. ` +
    `Output MUST match Image 0 for CAMERA HEIGHT and ANGLE (headlights large at the bottom — not a roof-only drone shot), ` +
    `nose-DOWN orientation, straight unturned wheels, perfect centering, #FFFFFF filling the square with equal width and height, soft shadow, ` +
    `and GLOSSY paint with crisp hard highlights (never copy a matte or dull lot photo's finish). ` +
    `PAINT COLOR comes only from Image 1 and the stated exterior color — NEVER copy Image 0's color (the template may be a different car in a different color). ` +
    `NEVER copy Image 1's camera, crop, gray backdrop, paint dullness, or portrait framing — dealer photos of older Ferraris are often nadir and must be discarded. ` +
    `Final check: car dead-center; headlights and grille readable near the BOTTOM; roof visible; rear at TOP; wheels straight; high-gloss paint in the SUBJECT color; no text; white to all four edges.`
  );
}
