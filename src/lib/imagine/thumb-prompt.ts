/**
 * Dual-image recipe (rev 14): dealer photo = this VIN; greyscale plate = camera + scale.
 * Rev 13 shrank cars to half-frame and they looked like toys.
 * Interior is not sent. Scale target is ~three-quarters of the square.
 */
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";

/** Bump when the recipe changes so dealer batches can skip already-good tiles. */
export const STUDIO_PROMPT_REV = "14";

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
    `PAINT: copy Image 1 exactly — body, roof, wheels, calipers, stripes.${hint} ` +
    `If Image 1 is one color, output one color. Never Image 2's grey body, never a two-tone or livery that is not in Image 1.`
  );
}

function bodyInstruction(car: ThumbSubject): string {
  const blob = `${car.make} ${car.model} ${car.trim || ""}`.toLowerCase();
  if (/revuelto|aventador|huracan|temerario|gallardo|murcielago|countach|sian/.test(blob)) {
    return ` LOW mid-engine supercar — Y headlights, hexagonal engine cover — never a Urus SUV.`;
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
    `Overhead catalog still of this exact ${label}. ${paintInstruction(car)}${eraInstruction(car)}${bodyInstruction(car)} ` +
    `${source} Image 2 is a greyscale camera plate — copy its camera (high boom, long telephoto, square seamless studio) AND how large the car sits in the frame, never its grey paint. ` +
    `ONE car, right-side up: wheels on the floor, roof toward the camera, nose pointing to the BOTTOM edge of the square, matching Image 2. Never invert, never a 3/4 hero, never a collage. ` +
    `Fill about three-quarters of the square — modest floor on all four sides, bumpers/mirrors/spoiler fully visible. Not a tiny toy in the middle, not clipped at the edges. Wheels straight, headlights off. Square, no text.` +
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
