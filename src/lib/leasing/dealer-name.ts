/** "ferrari-of-ontario" → "Ferrari of Ontario". Names that already have spaces stay. */
const SMALL = new Set(["of", "and", "the", "de", "du", "la", "le"]);

export function displayDealerName(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/\s/.test(s)) return s;
  if (!s.includes("-") && !s.includes("_")) return s;
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
