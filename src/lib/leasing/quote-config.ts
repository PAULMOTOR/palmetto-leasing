/**
 * Quote defaults: Neon quote_settings row (admin-editable), then env, then code defaults.
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

function numOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Sync env/code defaults (no DB). */
export function loadQuoteSettings(): QuoteSettings {
  return {
    baseInterestRate: numEnv("QUOTE_BASE_INTEREST_RATE", DEFAULT_QUOTE_SETTINGS.baseInterestRate),
    termMonths: Math.round(numEnv("QUOTE_TERM_MONTHS", DEFAULT_QUOTE_SETTINGS.termMonths)),
    residualRate: numEnv("QUOTE_RESIDUAL_RATE", DEFAULT_QUOTE_SETTINGS.residualRate),
    downPaymentRate: numEnv("QUOTE_DOWN_PAYMENT_RATE", DEFAULT_QUOTE_SETTINGS.downPaymentRate),
  };
}

let cache: { at: number; value: QuoteSettings } | null = null;
const CACHE_MS = 5_000;

export function invalidateQuoteSettingsCache() {
  cache = null;
}

/** Prefer Neon quote_settings (admin saves), else env defaults. */
export async function loadQuoteSettingsAsync(): Promise<QuoteSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const envDefaults = loadQuoteSettings();
  try {
    const { getSql } = await import("@/lib/db");
    const { ensurePortalSchema } = await import("@/lib/db/ensure-portal-schema");
    await ensurePortalSchema();
    const sql = await getSql();
    const rows = await sql<{
      base_interest_rate: string | number;
      term_months: number;
      residual_rate: string | number;
      down_payment_rate: string | number;
    }>`
      select base_interest_rate, term_months, residual_rate, down_payment_rate
      from quote_settings where id = 1 limit 1
    `;
    if (rows[0]) {
      const r = rows[0];
      const value: QuoteSettings = {
        // Do NOT use `||` — 0 is valid; empty string → NaN → fallback
        baseInterestRate: numOr(r.base_interest_rate, envDefaults.baseInterestRate),
        termMonths: Math.round(numOr(r.term_months, envDefaults.termMonths)),
        residualRate: numOr(r.residual_rate, envDefaults.residualRate),
        downPaymentRate: numOr(r.down_payment_rate, envDefaults.downPaymentRate),
      };
      cache = { at: Date.now(), value };
      return value;
    }
  } catch (err) {
    console.warn("[quote-config] load from DB failed, using env/defaults:", err);
  }
  cache = { at: Date.now(), value: envDefaults };
  return envDefaults;
}

export async function saveQuoteSettings(s: QuoteSettings): Promise<QuoteSettings> {
  const { getSql } = await import("@/lib/db");
  const { ensurePortalSchema } = await import("@/lib/db/ensure-portal-schema");
  await ensurePortalSchema();
  const sql = await getSql();
  await sql`
    insert into quote_settings (id, base_interest_rate, term_months, residual_rate, down_payment_rate, updated_at)
    values (
      1,
      ${s.baseInterestRate},
      ${s.termMonths},
      ${s.residualRate},
      ${s.downPaymentRate},
      now()
    )
    on conflict (id) do update set
      base_interest_rate = excluded.base_interest_rate,
      term_months = excluded.term_months,
      residual_rate = excluded.residual_rate,
      down_payment_rate = excluded.down_payment_rate,
      updated_at = now()
  `;
  invalidateQuoteSettingsCache();
  cache = { at: Date.now(), value: s };
  return s;
}
