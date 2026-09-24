import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = new URL("..", import.meta.url);
function compile(rel) {
  const src = readFileSync(new URL(rel, root), "utf8").replaceAll(
    'from "@/lib/leasing/tax"',
    'from "./tax.mjs"',
  );
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  return out.outputText;
}
const dir = mkdtempSync(join(tmpdir(), "crm-quote-"));
writeFileSync(join(dir, "tax.mjs"), compile("src/lib/leasing/tax.ts"));
writeFileSync(join(dir, "crm-quote.mjs"), compile("src/lib/leasing/crm-quote.ts"));
const { excelPmt, quoteCrm, daysLeftInDeliveryMonth, bcPstRate } = await import(
  pathToFileURL(join(dir, "crm-quote.mjs")).href
);

test("excel PMT matches a known ordinary payment", () => {
  assert.equal(excelPmt(0.12, 12, -10000, 0), 888.49);
  assert.equal(excelPmt(0, 10, -10000, 0), 1000);
});

test("quebec tax is split and not compounded", () => {
  const q = quoteCrm({
    cost: 100000,
    cashDown: 20000,
    residual: 53000,
    annualRate: 0.0799,
    term: 37,
    province: "QC",
  });
  assert.equal(q.combinedRate, 0.14975);
  const gst = Math.round(q.monthlyBeforeTax * 0.05 * 100) / 100;
  const qst = Math.round(q.monthlyBeforeTax * 0.09975 * 100) / 100;
  assert.equal(q.monthlyTax, Math.round((gst + qst) * 100) / 100);
  assert.equal(q.taxCredit, false);
});

test("individual trade taxes the tax cap, not the payout", () => {
  const plain = quoteCrm({
    cost: 80000,
    cashDown: 8000,
    residual: 40000,
    annualRate: 0.0799,
    term: 36,
    province: "ON",
    tradeKind: "financed",
    tradeAllowance: 20000,
    lien: 15000,
    lessee: "individual",
  });
  assert.equal(plain.taxCredit, true);
  assert.equal(plain.payoutFunded, 15000);
  assert.equal(plain.paymentCap, 80000 - 20000 + 15000 - 8000);
  assert.equal(plain.taxCap, 80000 - 20000 - 8000);
  assert.ok(plain.monthlyTax !== Math.round(plain.monthlyBeforeTax * 0.13 * 100) / 100);
});

test("leased buyout is grossed up only for an individual", () => {
  const person = quoteCrm({
    cost: 50000,
    cashDown: 5000,
    residual: 25000,
    annualRate: 0.0799,
    term: 36,
    province: "QC",
    tradeKind: "leased",
    tradeAllowance: 10000,
    lien: 10000,
    lessee: "individual",
  });
  assert.equal(person.payoutFunded, Math.round(10000 * 1.14975 * 100) / 100);
  const business = quoteCrm({
    cost: 50000,
    cashDown: 5000,
    residual: 25000,
    annualRate: 0.0799,
    term: 36,
    province: "QC",
    tradeKind: "leased",
    tradeAllowance: 10000,
    lien: 10000,
    lessee: "business",
  });
  assert.equal(business.payoutFunded, 10000);
  assert.equal(business.taxCredit, false);
});

test("british columbia pst locks to the bracket and is not a flat 7%", () => {
  assert.equal(bcPstRate(54999.99), 0.07);
  assert.equal(bcPstRate(55000), 0.08);
  assert.equal(bcPstRate(125000), 0.15);
  assert.equal(bcPstRate(150000), 0.2);
  const locked = quoteCrm({
    cost: 160000,
    cashDown: 16000,
    residual: 80000,
    annualRate: 0.0799,
    term: 36,
    province: "BC",
    lockedBcPst: 0.07,
  });
  assert.equal(locked.bcPst, 0.07);
  assert.ok(Math.abs(locked.combinedRate - 0.12) < 1e-9);
});

test("delivery on the first is no stub; day 2 of a 31-day month is a full payment", () => {
  assert.equal(daysLeftInDeliveryMonth("2026-03-01"), 0);
  assert.equal(daysLeftInDeliveryMonth("2026-03-02"), 30);
  const quote = quoteCrm({
    cost: 60000,
    cashDown: 6000,
    residual: 30000,
    annualRate: 0.0799,
    term: 36,
    province: "AB",
    delivery: "2026-03-02",
    securityDeposit: 500,
  });
  assert.equal(quote.stub, quote.monthlyBeforeTax);
  const downTax = Math.round(6000 * 0.05 * 100) / 100;
  const stubTax = Math.round(quote.monthlyBeforeTax * 0.05 * 100) / 100;
  assert.equal(quote.dueOnDelivery, Math.round((6000 + downTax + quote.stub + stubTax + 500) * 100) / 100);
});

test("first payment on the invoice replaces the stub", () => {
  const quote = quoteCrm({
    cost: 60000,
    cashDown: 6000,
    residual: 30000,
    annualRate: 0.0799,
    term: 36,
    province: "ON",
    delivery: "2026-03-15",
    firstPaymentOnInvoice: true,
  });
  assert.equal(quote.stub, 0);
  assert.equal(quote.firstPaymentInstead, true);
  const first = quote.dueLines.find((row) => row.label === "First payment");
  assert.equal(first.amount, quote.monthlyBeforeTax);
  assert.equal(first.tax, quote.monthlyTax);
});
