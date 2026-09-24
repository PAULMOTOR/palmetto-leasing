/**
 * Provincial sales tax for a lease payment. One model, shared with the CRM quote.
 * Quebec is GST 5% + QST 9.975% on the same base (combined 14.975%), not compounded.
 * Split taxes are rounded to the cent each, then added. HST and GST-only are one rate.
 * "BC" is British Columbia.
 */

export type TaxLine = { name: string; amount: number };

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

export function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + 1e-8) * 100)) / 100;
}

export function normalizeProvince(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s === "QUÉBEC" || s === "QUEBEC") return "QC";
  if (s === "ONTARIO") return "ON";
  if (s === "BRITISH COLUMBIA" || s === "B.C.") return "BC";
  if (LEASE_PROVINCES.some((p) => p.code === s)) return s;
  return s.slice(0, 2);
}

/** British Columbia PST from the tax-rate value at inception. */
export function bcPstRate(trv: number): number {
  const n = Math.max(0, trv);
  if (n < 55_000) return 0.07;
  if (n < 56_000) return 0.08;
  if (n < 57_000) return 0.09;
  if (n < 125_000) return 0.1;
  if (n < 150_000) return 0.15;
  return 0.2;
}

type Part = { name: string; rate: number };

export function provinceParts(
  province: string,
  opts?: { trv?: number; lockedBcPst?: number | null },
): { parts: Part[]; single: boolean; combined: number } {
  const code = normalizeProvince(province);
  let parts: Part[];
  let single = false;
  if (code === "QC") parts = [
    { name: "GST", rate: 0.05 },
    { name: "QST", rate: 0.09975 },
  ];
  else if (code === "ON") {
    parts = [{ name: "HST", rate: 0.13 }];
    single = true;
  } else if (code === "NS" || code === "NB" || code === "NL" || code === "PE") {
    parts = [{ name: "HST", rate: 0.15 }];
    single = true;
  } else if (code === "MB") parts = [
    { name: "GST", rate: 0.05 },
    { name: "RST", rate: 0.07 },
  ];
  else if (code === "SK") parts = [
    { name: "GST", rate: 0.05 },
    { name: "PST", rate: 0.06 },
  ];
  else if (code === "BC") {
    const pst =
      typeof opts?.lockedBcPst === "number" && Number.isFinite(opts.lockedBcPst)
        ? opts.lockedBcPst
        : bcPstRate(opts?.trv || 0);
    parts = [
      { name: "GST", rate: 0.05 },
      { name: "PST", rate: pst },
    ];
  } else {
    parts = [{ name: "GST", rate: 0.05 }];
    single = true;
  }
  const combined = parts.reduce((sum, p) => sum + p.rate, 0);
  return { parts, single, combined };
}

/** Statutory tax on one dollar amount. Negative amounts produce a negative tax (credit). */
export function taxOnAmount(
  amount: number,
  province: string,
  opts?: { trv?: number; lockedBcPst?: number | null },
): { lines: TaxLine[]; total: number; combined: number; label: string } {
  const spec = provinceParts(province, opts);
  if (spec.single) {
    const total = money(amount * spec.combined);
    const label = `${spec.parts[0].name} ${(spec.combined * 100).toFixed(spec.combined === 0.09975 ? 3 : 0)}%`;
    return { lines: [{ name: spec.parts[0].name, amount: total }], total, combined: spec.combined, label };
  }
  const lines = spec.parts.map((p) => ({ name: p.name, amount: money(amount * p.rate) }));
  const total = money(lines.reduce((sum, line) => sum + line.amount, 0));
  const label = spec.parts
    .map((p) => `${p.name} ${(p.rate * 100).toFixed(p.rate === 0.09975 ? 3 : 0)}%`)
    .join(" + ");
  return { lines, total, combined: spec.combined, label };
}
