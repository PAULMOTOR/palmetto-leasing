/**
 * Strip dealer marketing from year/make/model/trim so Imagine and tiles
 * show the car, not "Warranty! Full PPF!".
 */
import { canonicalMake } from "./makes";

const MARKETING_RE =
  /\b(warranty|ppf|ceramic|optioned|novitec|lowering|must\s*see|no accidents|clean carfax|loaded|rare find|price drop|make an offer|highly optioned|full ppf|ferrari warranty)\b/i;

export function cleanNamePart(raw: string | null | undefined): string {
  let s = String(raw || "")
    .replace(/!+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const chunks = s.split(/\s*[|•]\s*|\s+-\s+/);
  const kept: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!.trim();
    if (!c) continue;
    if (i > 0 && MARKETING_RE.test(c)) continue;
    kept.push(c);
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

export function vehicleDisplayTitle(v: {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
}): string {
  const year = v.year != null && String(v.year).trim() ? String(v.year).trim() : "";
  const make = canonicalMake(v.make || "");
  const model = cleanNamePart(v.model);
  const trim = cleanNamePart(v.trim);
  const bits = [year, make, model];
  if (trim && !model.toLowerCase().includes(trim.toLowerCase())) bits.push(trim);
  return bits.filter(Boolean).join(" ");
}
