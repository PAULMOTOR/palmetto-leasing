/**
 * Paul Motor lease quote. Same engine as the CRM.
 * Dollars, each money step rounded to $0.01. Ordinary Excel PMT (end of period).
 * "BC" is British Columbia, not Business Central.
 */
import { bcPstRate, money, normalizeProvince, taxOnAmount } from "@/lib/leasing/tax";

export { bcPstRate };

export type TradeKind = "none" | "clear" | "financed" | "leased";
export type LesseeKind = "individual" | "business";

export type CrmQuoteInput = {
  cost: number;
  extra?: number;
  pad?: number;
  cashDown: number;
  residual: number;
  annualRate: number;
  term: number;
  handling?: number;
  tradeAllowance?: number;
  tradeKind?: TradeKind;
  lien?: number;
  lessee?: LesseeKind;
  province: string;
  /** British Columbia PST locked at inception (0.07–0.20). Omit to derive from TRV. */
  lockedBcPst?: number | null;
  securityDeposit?: number;
  admin?: number;
  antiTheft?: number;
  ppsa?: number;
  licence?: number;
  tireTax?: number;
  /** YYYY-MM-DD. Ignored when firstPaymentOnInvoice is set. */
  delivery?: string | null;
  firstPaymentOnInvoice?: boolean;
};

export type DueLine = { label: string; amount: number; tax: number };

export type CrmQuote = {
  salePrice: number;
  vehicle: number;
  trv: number;
  province: string;
  combinedRate: number;
  taxLabel: string;
  bcPst: number | null;
  lien: number;
  payoutFunded: number;
  netEquity: number;
  paymentCap: number;
  financed: number;
  taxCap: number;
  residual: number;
  basePayment: number;
  handling: number;
  monthlyBeforeTax: number;
  taxCredit: boolean;
  monthlyTax: number;
  monthlyTaxLines: { name: string; amount: number }[];
  totalMonthly: number;
  cashDown: number;
  stub: number;
  stubDays: number;
  firstPaymentInstead: boolean;
  securityDeposit: number;
  dueLines: DueLine[];
  dueOnDelivery: number;
};

/** Excel PMT(annual/12, nper, pv, fv) — type 0, end of period. */
export function excelPmt(annualRate: number, nper: number, present: number, future: number): number {
  const n = Math.round(nper);
  if (n <= 0) return 0;
  const r = annualRate / 12;
  if (!Number.isFinite(r) || Math.abs(r) < 1e-12) return money(-(present + future) / n);
  const pow = (1 + r) ** n;
  return money((-(present * pow + future) * r) / (pow - 1));
}

export function daysLeftInDeliveryMonth(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return 0;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return 0;
  if (day === 1) return 0;
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > dim) return 0;
  return dim - day + 1;
}

export function quoteCrm(input: CrmQuoteInput): CrmQuote {
  const province = normalizeProvince(input.province || "");
  const salePrice = money(Math.max(0, input.cost || 0) + Math.max(0, input.extra || 0));
  const pad = money(Math.max(0, input.pad || 0));
  const vehicle = money(salePrice + pad);
  const trv = vehicle;
  const locked =
    province === "BC" && typeof input.lockedBcPst === "number" && Number.isFinite(input.lockedBcPst)
      ? input.lockedBcPst
      : null;
  const bcPst = province === "BC" ? (locked ?? bcPstRate(trv)) : null;
  const taxOpts = { trv, lockedBcPst: bcPst };
  const rateSample = taxOnAmount(1, province, taxOpts);
  const combined = rateSample.combined;

  const allowance = money(Math.max(0, input.tradeAllowance || 0));
  const kind: TradeKind = input.tradeKind || "none";
  const lessee: LesseeKind = input.lessee || "individual";
  const typedLien = kind === "clear" || kind === "none" ? 0 : money(Math.max(0, input.lien || 0));
  let payoutFunded = 0;
  if (kind === "financed") payoutFunded = typedLien;
  else if (kind === "leased" && lessee === "individual") payoutFunded = money(typedLien * (1 + combined));
  else if (kind === "leased") payoutFunded = typedLien;

  const cashDown = money(Math.max(0, input.cashDown || 0));
  const residual = money(Math.max(0, input.residual || 0));
  const handling = money(Math.max(0, input.handling || 0));
  const netEquity = money(allowance - typedLien);
  const paymentCap = money(vehicle - allowance + payoutFunded - cashDown);
  const financed = money(Math.max(0, paymentCap));
  const taxCap = money(vehicle - allowance - cashDown);

  const annual = Math.max(0, input.annualRate || 0);
  const term = Math.max(0, Math.round(input.term || 0));
  const basePayment = excelPmt(annual, term, -financed, residual);
  const monthlyBeforeTax = money(basePayment + handling);

  const taxCredit = lessee === "individual" && allowance > 0;
  const taxBase = taxCredit
    ? money(excelPmt(annual, term, -taxCap, residual) + handling)
    : monthlyBeforeTax;
  const taxed = taxOnAmount(taxBase, province, taxOpts);
  const totalMonthly = money(monthlyBeforeTax + taxed.total);

  const securityDeposit = money(Math.max(0, input.securityDeposit || 0));
  const firstPaymentInstead = Boolean(input.firstPaymentOnInvoice);
  let stub = 0;
  let stubDays = 0;
  if (!firstPaymentInstead && input.delivery) {
    stubDays = daysLeftInDeliveryMonth(input.delivery);
    if (stubDays === 30) stub = monthlyBeforeTax;
    else if (stubDays > 0) {
      const daily = money(monthlyBeforeTax / 30);
      stub = money(daily * stubDays);
    }
  }

  const line = (label: string, amount: number): DueLine => ({
    label,
    amount,
    tax: taxOnAmount(amount, province, taxOpts).total,
  });

  const dueLines: DueLine[] = [line("Cash down", cashDown)];
  if (firstPaymentInstead) {
    dueLines.push({
      label: "First payment",
      amount: monthlyBeforeTax,
      tax: taxed.total,
    });
  } else {
    dueLines.push(line("Pro-rata", stub));
  }
  for (const [label, amount] of [
    ["Admin", input.admin],
    ["Anti-theft", input.antiTheft],
    ["PPSA", input.ppsa],
    ["Licence", input.licence],
    ["Tire tax", input.tireTax],
  ] as const) {
    const value = money(Math.max(0, amount || 0));
    if (value > 0) dueLines.push(line(label, value));
  }

  const taxedDue = money(dueLines.reduce((sum, row) => sum + row.amount + row.tax, 0));
  const dueOnDelivery = money(taxedDue + securityDeposit);

  return {
    salePrice,
    vehicle,
    trv,
    province,
    combinedRate: combined,
    taxLabel: rateSample.label,
    bcPst,
    lien: typedLien,
    payoutFunded,
    netEquity,
    paymentCap,
    financed,
    taxCap,
    residual,
    basePayment,
    handling,
    monthlyBeforeTax,
    taxCredit,
    monthlyTax: taxed.total,
    monthlyTaxLines: taxed.lines,
    totalMonthly,
    cashDown,
    stub,
    stubDays,
    firstPaymentInstead,
    securityDeposit,
    dueLines,
    dueOnDelivery,
  };
}
