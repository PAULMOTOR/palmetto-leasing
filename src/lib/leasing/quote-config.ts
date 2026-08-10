/**
 * Quote defaults from environment (Vercel project settings).
 * No database — change via env vars and redeploy / restart.
 */
import {
  DEFAULT_QUOTE_SETTINGS,
  type QuoteSettings,
} from "./calc";

function numEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadQuoteSettings(): QuoteSettings {
  return {
    baseInterestRate: numEnv("QUOTE_BASE_INTEREST_RATE", DEFAULT_QUOTE_SETTINGS.baseInterestRate),
    termMonths: Math.round(numEnv("QUOTE_TERM_MONTHS", DEFAULT_QUOTE_SETTINGS.termMonths)),
    residualRate: numEnv("QUOTE_RESIDUAL_RATE", DEFAULT_QUOTE_SETTINGS.residualRate),
    downPaymentRate: numEnv("QUOTE_DOWN_PAYMENT_RATE", DEFAULT_QUOTE_SETTINGS.downPaymentRate),
  };
}
