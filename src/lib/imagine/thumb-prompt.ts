/**
 * Dual-image recipe (rev 16): dealer photo = this VIN; greyscale plate = camera.
 * Rev 15 leaked yellow cabins and copied Image 2's tight crop.
 * Interior is not sent. Scale is modest floor on all four sides — not a close crop.
 */
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";

/** Bump when the recipe changes so dealer batches can skip already-good tiles. */
export const STUDIO_PROMPT_REV = "16";

export type ThumbSubject = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  exteriorColor?: string;
  interiorColor?: string;
  bodyStyle?: string;
};

function paintInstruction(car: ThumbSubject): string {
  const raw = car.exteriorColor?.trim() || "";
  const named =
    raw && !/^(grey|gray|silver|n\/a|na|-)$/i.test(raw) ? raw : "";
  const hint = named ? ` Listing text says ${named}, but Image 1 wins if they disagree.` : "";
  return (
    `PAINT: copy Image 1 exactly — body silhouette, greenhouse height, roof, wheels, calipers, stripes.${hint} ` +
    `If Image 1 is a low coupe, output a low coupe. If Image 1 is one color, output one color. ` +
    `Never Image 2's grey body, never Image 2's proportions, never a two-tone or livery that is not in Image 1.`
  );
}

function cabinInstruction(car: ThumbSubject): string {
  const raw = car.interiorColor?.trim() || "";
  if (raw && /yellow|giallo|crema|tan|beige|saddle|cognac/i.test(raw)) {
    return ` Windshield may hint the listed ${raw} cabin.`;
  }
  return ` Dark greenhouse glass — never invent yellow, cream, or tan seats. Cabin is not a color source.`;
}

function bodyInstruction(car: ThumbSubject): string {
  const blob = `${car.make} ${car.model} ${car.trim || ""} ${car.bodyStyle || ""}`.toLowerCase();
  if (/porsche/.test(blob) && /911|718|cayman|boxster|gt3|gt2|carrera|targa|turbo/.test(blob)) {
    return ` LOW Porsche sports car — short greenhouse, round four-point headlights, engine in the REAR — NEVER a Lamborghini Urus, NEVER an SUV or crossover. Copy Image 1's silhouette.`;
  }
  if (/revuelto|aventador|huracan|temerario|gallardo|murcielago|countach|sian/.test(blob)) {
    return ` LOW mid-engine supercar — Y headlights, hexagonal engine cover — never a Urus SUV.`;
  }
  if (/coupe|convertible|spyder|spider|roadster/.test(blob)) {
    return ` Low sports-car greenhouse — never an SUV, never a Urus, never a crossover.`;
  }
  return "";
}

function eraInstruction(car: ThumbSubject): string {
  const y = Number(car.year);
  if (Number.isFinite(y) && y > 1900 && y < 1990) {
    return ` Period-correct ${y} body and proportions — a classic of that decade, not a current ${car.make} 296/Roma/SF90/911.`;
  }
  return "";
}

export function buildThumbEditPrompt(
  car: ThumbSubject,
  opts?: { fromUploads?: boolean; hasRear?: boolean },
): string {
  const label = vehicleDisplayTitle(car);
  const source = opts?.fromUploads
    ? "Image 1 is an operator photo of this VIN."
    : "Image 1 is the dealer's main photo of this VIN.";
  const rear = opts?.hasRear
    ? " Image 3 is this car's rear — copy wing, slats, and lamps onto the SAME car, never as a second vehicle."
    : "";

  return (
    `Overhead catalog still of this exact ${label}. ${paintInstruction(car)}${cabinInstruction(car)}${eraInstruction(car)}${bodyInstruction(car)} ` +
    `${source} Image 2 is a greyscale camera plate — copy its camera (high boom, long telephoto, square seamless studio), never its grey paint and never a tighter crop. ` +
    `ONE car, right-side up: wheels on the floor, roof toward the camera, nose pointing to the BOTTOM edge of the square, matching Image 2. Never invert, never a 3/4 hero, never a collage. ` +
    `Car centered. Fill about two-thirds of the square — even floor on all four sides, bumpers/mirrors/spoiler fully visible with air around them. Not a tiny toy, not clipped, not a close crop. Wheels straight, headlights off. Square, no text.` +
    rear
  );
}

export function buildThumbTextPrompt(car: ThumbSubject): string {
  return buildThumbEditPrompt(car);
}

export function buildStyleLockAddendum(): string {
  return "";
}

export function buildDealerRefsAddendum(): string {
  return "";
}