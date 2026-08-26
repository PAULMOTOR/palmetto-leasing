import { getSql } from "@/lib/db";

let ensured: Promise<void> | null = null;

/** Idempotent schema patches for portal features (works even if migration lag). */
export function ensurePortalSchema(): Promise<void> {
  ensured ??= (async () => {
    const sql = await getSql();
    const stmts = [
      `create table if not exists quote_settings (
        id integer primary key default 1 check (id = 1),
        base_interest_rate numeric(8, 6) not null default 0.059000,
        term_months integer not null default 36,
        residual_rate numeric(6, 4) not null default 0.5000,
        down_payment_rate numeric(6, 4) not null default 0.2000,
        updated_at timestamptz not null default now()
      )`,
      `insert into quote_settings (id) values (1) on conflict (id) do nothing`,
      `alter table dealerships add column if not exists referral_fee_bps integer not null default 150`,
      `alter table dealerships add column if not exists quote_rate_offset_bps integer not null default 0`,
      `alter table dealerships add column if not exists portal_pin text`,
      `alter table crm_leads add column if not exists missing_docs text not null default '[]'`,
      `alter table crm_leads add column if not exists contract_status text not null default 'none'`,
      `alter table crm_leads add column if not exists buyout_cents bigint`,
      `alter table vehicles add column if not exists thumbnail_source text not null default ''`,
      `create table if not exists image_fix_requests (
        id bigserial primary key,
        dealership_id text not null,
        vehicle_id text not null,
        note text not null default '',
        emailed_to text not null default '',
        email_ok boolean not null default false,
        email_error text not null default '',
        created_at timestamptz not null default now()
      )`,
      `insert into app_meta (key, value, updated_at)
        values ('image_support_email', 'Jeremyp@paulmotorcompany.com', now())
        on conflict (key) do nothing`,
    ];
    for (const text of stmts) {
      try {
        await sql.query(text);
      } catch (err) {
        // Column already exists / older pglite without IF NOT EXISTS
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists|duplicate/i.test(msg)) {
          // try without IF NOT EXISTS
          try {
            await sql.query(text.replace(/ if not exists/gi, ""));
          } catch {
            /* ignore */
          }
        }
      }
    }
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}
