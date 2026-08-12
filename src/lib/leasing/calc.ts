/** Live lease quote — term-linked residual schedule + admin APR/down defaults. */

/** Standard Palmetto term chips (months). */
export const LEASE_TERM_OPTIONS = [25, 37, 49, 61] as const;
export type LeaseTermMonths = (typeof LEASE_TERM_OPTIONS)[number];

/**
 * Residual % of MSRP/price by term (program schedule).
 * 25 → 63% · 37 → 52% · 49 → 41% · 61 → 32%
 */
export const RESIDUAL_BY_TERM: Record<LeaseTermMonths, number> = {
  25: 0.63,
  37: 0.52,
  49: 0.41,
  61: 0.32,
};

export function residualForTerm(termMonths: number): number {
  if ((LEASE_TERM_OPTIONS as readonly number[]).includes(termMonths)) {
    return RESIDUAL_BY_TERM[termMonths as LeaseTermMonths];
  }
  // Nearest known term for odd admin values
  let best: LeaseTermMonths = 37;
  let bestDist = Math.abs(termMonths - best);
  for (const t of LEASE_TERM_OPTIONS) {
    const d = Math.abs(termMonths - t);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return RESIDUAL_BY_TERM[best];
}

export const DEFAULT_TERM_MONTHS = 37;
export const DEFAULT_DOWN_PAYMENT_RATE = 0.2;
export const DEFAULT_RESIDUAL_RATE = RESIDUAL_BY_TERM[37];
/** Annual APR used for money-factor interest portion of payment. */
export const DEFAULT_BASE_INTEREST_RATE = 0.059;

export type QuoteSettings = {
  baseInterestRate: number;
  termMonths: number;
  residualRate: number;
  downPaymentRate: number;
};

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  baseInterestRate: DEFAULT_BASE_INTEREST_RATE,
  termMonths: DEFAULT_TERM_MONTHS,
  residualRate: DEFAULT_RESIDUAL_RATE,
  downPaymentRate: DEFAULT_DOWN_PAYMENT_RATE,
};

export type LeaseQuote = {
  priceCents: number;
  downPaymentCents: number;
  residualCents: number;
  capCostCents: number;
  depreciationCents: number;
  /** Monthly finance charge from money factor. */
  financeChargeCents: number;
  monthlyPaymentCents: number;
  termMonths: number;
  downRate: number;
  residualRate: number;
  baseInterestRate: number;
  moneyFactor: number;
};

/**
 * monthly = depreciation/term + (cap + residual) * moneyFactor
 * moneyFactor ≈ APR / 2400
 *
 * Residual always follows the program schedule for the chosen term
 * (25→63%, 37→52%, 49→41%, 61→32%).
 */
export function calculateLease(
  priceCents: number,
  settings: Partial<QuoteSettings> = {},
): LeaseQuote {
  const base: QuoteSettings = { ...DEFAULT_QUOTE_SETTINGS, ...settings };
  const termMonths = base.termMonths;
  const residualRate = residualForTerm(termMonths);

  const price = Math.max(0, Math.round(priceCents));
  const downPaymentCents = Math.round(price * base.downPaymentRate);
  const residualCents = Math.round(price * residualRate);
  const capCostCents = price - downPaymentCents;
  const depreciationCents = Math.max(0, capCostCents - residualCents);
  const moneyFactor = base.baseInterestRate / 2400;
  const financeChargeCents = Math.round((capCostCents + residualCents) * moneyFactor);
  const baseMonthly = Math.round(depreciationCents / Math.max(1, termMonths));
  const monthlyPaymentCents = baseMonthly + financeChargeCents;

  return {
    priceCents: price,
    downPaymentCents,
    residualCents,
    capCostCents,
    depreciationCents,
    financeChargeCents,
    monthlyPaymentCents,
    termMonths,
    downRate: base.downPaymentRate,
    residualRate,
    baseInterestRate: base.baseInterestRate,
    moneyFactor,
  };
}

/** Approximate remaining buyout after `monthsElapsed` payments. */
export function estimateBuyout(
  priceCents: number,
  monthsElapsed: number,
  settings: Partial<QuoteSettings> = {},
): number {
  const q = calculateLease(priceCents, settings);
  const remaining = Math.max(0, q.termMonths - Math.max(0, monthsElapsed));
  const paidDep = Math.round(
    (q.depreciationCents * Math.min(monthsElapsed, q.termMonths)) / q.termMonths,
  );
  const remainingDep = Math.max(0, q.depreciationCents - paidDep);
  return Math.round(q.residualCents + remainingDep * (remaining / q.termMonths));
}

/** Monthly payment filter buckets (cents). */
export type MonthlyRangeId =
  | "1000-1999"
  | "2000-2999"
  | "3000-3999"
  | "4000-4999"
  | "5000+";

export const MONTHLY_RANGES: {
  id: MonthlyRangeId;
  label: string;
  minCents: number;
  maxCents: number | null;
}[] = [
  { id: "1000-1999", label: "$ 1,000–1,999", minCents: 100_000, maxCents: 199_999 },
  { id: "2000-2999", label: "$ 2,000–2,999", minCents: 200_000, maxCents: 299_999 },
  { id: "3000-3999", label: "$ 3,000–3,999", minCents: 300_000, maxCents: 399_999 },
  { id: "4000-4999", label: "$ 4,000–4,999", minCents: 400_000, maxCents: 499_999 },
  { id: "5000+", label: "$ 5,000+", minCents: 500_000, maxCents: null },
];

export function inMonthlyRange(monthlyPaymentCents: number, id: MonthlyRangeId): boolean {
  const r = MONTHLY_RANGES.find((x) => x.id === id);
  if (!r) return true;
  if (monthlyPaymentCents < r.minCents) {
    return id === "1000-1999" && monthlyPaymentCents > 0;
  }
  if (r.maxCents == null) return monthlyPaymentCents >= r.minCents;
  return monthlyPaymentCents <= r.maxCents;
}

/** @deprecated use DEFAULT_TERM_MONTHS */
export const LEASE_TERM_MONTHS = DEFAULT_TERM_MONTHS;
export const DOWN_PAYMENT_RATE = DEFAULT_DOWN_PAYMENT_RATE;
export const RESIDUAL_RATE = DEFAULT_RESIDUAL_RATE;
