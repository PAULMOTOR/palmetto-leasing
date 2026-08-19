/**
 * Spec for Palmetto km allowance → residual + excess-km penalty.
 * Keep in sync with src/lib/leasing/calc.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const BASE_KM = 6000;
const STEP = 1000;
const RV = { 25: 0.63, 37: 0.52, 49: 0.41, 61: 0.32 };
const DEDUCT = { 1: 0.01, 2: 0.015, 3: 0.018, 4: 0.02, 5: 0.0225, 6: 0.025 };

function years(months) {
  return Math.max(1, Math.min(6, Math.round(months / 12)));
}
function clicks(km) {
  return Math.max(0, Math.round((km - BASE_KM) / STEP));
}
function adjustedRv(months, km) {
  return Math.max(0, RV[months] - clicks(km) * DEDUCT[years(months)]);
}
function penaltyPerKm(priceCents) {
  return Math.round((((priceCents / 100) * 0.01) / 1000) * 100) / 100;
}

test("term months map to lease years for RV deduction", () => {
  assert.equal(years(25), 2);
  assert.equal(years(37), 3);
  assert.equal(years(49), 4);
  assert.equal(years(61), 5);
});

test("6,000 km/yr does not change base RV", () => {
  assert.equal(clicks(6000), 0);
  assert.equal(adjustedRv(37, 6000), 0.52);
});

test("each extra 1,000 km/yr is one slider click", () => {
  assert.equal(clicks(7000), 1);
  assert.equal(clicks(8000), 2);
});

test("3-year (37 mo) deducts 1.80% RV per click", () => {
  // 8,000 km = 2 clicks × 1.80% → 52% − 3.60% = 48.4%
  assert.equal(adjustedRv(37, 8000), 0.52 - 2 * 0.018);
});

test("2-year (25 mo) deducts 1.50% RV per click", () => {
  assert.equal(adjustedRv(25, 7000), 0.63 - 0.015);
});

test("4-year (49 mo) deducts 2.00% RV per click", () => {
  assert.equal(adjustedRv(49, 9000), 0.41 - 3 * 0.02);
});

test("$200,000 car excess km penalty is $2.00 per km", () => {
  assert.equal(penaltyPerKm(20_000_000), 2);
});

test("canonical make grouping", () => {
  function canonicalMake(raw) {
    const s = (raw || "").trim();
    if (!s) return s;
    const compact = s.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (compact === "rollsroyce") return "Rolls-Royce";
    if (compact === "mercedes" || compact === "mercedesbenz") return "Mercedes-Benz";
    return s;
  }
  assert.equal(canonicalMake("ROLLS ROYCE"), "Rolls-Royce");
  assert.equal(canonicalMake("Rolls-Royce"), "Rolls-Royce");
  assert.equal(canonicalMake("Mercedes"), "Mercedes-Benz");
  assert.equal(canonicalMake("Mercedes Benz"), "Mercedes-Benz");
  assert.equal(canonicalMake("Mercedes-Benz"), "Mercedes-Benz");
});

test("marketing suffixes stripped from vehicle titles", () => {
  const MARKETING_RE =
    /\b(warranty|ppf|ceramic|optioned|novitec|lowering|must\s*see|no accidents|clean carfax|loaded|rare find|price drop|make an offer|highly optioned|full ppf|ferrari warranty)\b/i;
  function cleanNamePart(raw) {
    let s = String(raw || "")
      .replace(/!+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const chunks = s.split(/\s*[|•]\s*|\s+-\s+/);
    const kept = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i].trim();
      if (!c) continue;
      if (i > 0 && MARKETING_RE.test(c)) continue;
      kept.push(c);
    }
    return kept.join(" ").replace(/\s+/g, " ").trim();
  }
  assert.equal(cleanNamePart("296 GTB - Ferrari Warranty! Full PPF!"), "296 GTB");
  assert.equal(
    cleanNamePart("488 - Ferrari Warranty 2028! Highly Optioned! Full PPF"),
    "488",
  );
});