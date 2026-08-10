-- Quote defaults + dealer portal economics + client document checklist

create table if not exists quote_settings (
  id integer primary key default 1 check (id = 1),
  base_interest_rate numeric(8, 6) not null default 0.059000,
  term_months integer not null default 36,
  residual_rate numeric(6, 4) not null default 0.5000,
  down_payment_rate numeric(6, 4) not null default 0.2000,
  updated_at timestamptz not null default now()
);

insert into quote_settings (id) values (1)
on conflict (id) do nothing;

alter table dealerships add column if not exists referral_fee_bps integer not null default 150;
alter table dealerships add column if not exists quote_rate_offset_bps integer not null default 0;
alter table dealerships add column if not exists portal_pin text;

-- Client application extras (documents / contract / buyout)
alter table crm_leads add column if not exists missing_docs text not null default '[]';
alter table crm_leads add column if not exists contract_status text not null default 'none';
alter table crm_leads add column if not exists buyout_cents bigint;
