/** Canonical make names so inventory filters don't split the same brand. */

export function canonicalMake(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return s;
  const compact = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact === "rollsroyce") return "Rolls-Royce";
  if (compact === "mercedes" || compact === "mercedesbenz") return "Mercedes-Benz";
  return s;
}

export function uniqueCanonicalMakes(raw: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of raw) {
    const label = canonicalMake(m);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
