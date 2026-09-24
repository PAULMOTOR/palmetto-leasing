/** Provincial tax added to a before-tax lease amount. Quebec QST compounds on GST. */

export type TaxLine = { name: string; rate: number; cents: number };

export const LEASE_PROVINCES: { code: string; label: string }[] = [
  { code: "AB", label: "Alberta" },
  { code: "BC", label: "British Columbia" },
  { code: "MB", label: "Manitoba" },
  { code: "NB", label: "New Brunswick" },
  { code: "NL", label: "Newfoundland and Labrador" },
  { code: "NS", label: "Nova Scotia" },
  { code: "NT", label: "Northwest Territories" },
  { code: "NU", label: "Nunavut" },
  { code: "ON", label: "Ontario" },
  { code: "PE", label: "Prince Edward Island" },
  { code: "QC", label: "Quebec" },
  { code: "SK", label: "Saskatchewan" },
  { code: "YT", label: "Yukon" },
];

export function normalizeProvince(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s === "QUÉBEC" || s === "QUEBEC") return "QC";
  if (s === "ONTARIO") return "ON";
  if (LEASE_PROVINCES.some((p) => p.code === s)) return s;
  return s.slice(0, 2);
}

export function taxesOn(
  province: string,
  pretaxCents: number,
): { lines: TaxLine[]; taxCents: number; withTaxCents: number; label: string } {
  const base = Math.max(0, Math.round(pretaxCents));
  const code = normalizeProvince(province);
  const gst = (rate: number) => Math.round(base * rate);
  let lines: TaxLine[] = [];
  if (code === "QC") {
    const gstCents = gst(0.05);
    const qstCents = Math.round((base + gstCents) * 0.09975);
    lines = [
      { name: "GST", rate: 0.05, cents: gstCents },
      { name: "QST", rate: 0.09975, cents: qstCents },
    ];
  } else if (code === "ON") {
    lines = [{ name: "HST", rate: 0.13, cents: gst(0.13) }];
  } else if (code === "NS") {
    lines = [{ name: "HST", rate: 0.14, cents: gst(0.14) }];
  } else if (code === "NB" || code === "NL" || code === "PE") {
    lines = [{ name: "HST", rate: 0.15, cents: gst(0.15) }];
  } else if (code === "BC") {
    lines = [
      { name: "GST", rate: 0.05, cents: gst(0.05) },
      { name: "PST", rate: 0.07, cents: gst(0.07) },
    ];
  } else if (code === "SK") {
    lines = [
      { name: "GST", rate: 0.05, cents: gst(0.05) },
      { name: "PST", rate: 0.06, cents: gst(0.06) },
    ];
  } else if (code === "MB") {
    lines = [
      { name: "GST", rate: 0.05, cents: gst(0.05) },
      { name: "RST", rate: 0.07, cents: gst(0.07) },
    ];
  } else {
    lines = [{ name: "GST", rate: 0.05, cents: gst(0.05) }];
  }
  const taxCents = lines.reduce((sum, line) => sum + line.cents, 0);
  const label = lines.map((line) => `${line.name} ${(line.rate * 100).toFixed(line.rate === 0.09975 ? 3 : 0)}%`).join(" + ");
  return { lines, taxCents, withTaxCents: base + taxCents, label: label || code };
}
