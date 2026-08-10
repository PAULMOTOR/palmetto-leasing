-- Paul Motor Leasing / Palmetto Leasing — inventory, crawler, CRM

create table if not exists dealerships (
  id text primary key,
  name text not null,
  city text not null,
  province text not null,
  brands text not null default '',
  website_url text not null,
  inventory_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id text primary key,
  dealership_id text not null references dealerships(id),
  external_id text not null,
  slug text not null unique,
  year integer not null,
  make text not null,
  model text not null,
  trim text not null default '',
  body_style text not null default 'Coupe',
  exterior_color text not null default '',
  interior_color text not null default '',
  mileage integer not null default 0,
  price_cents bigint not null,
  currency text not null default 'CAD',
  vin text,
  stock_number text,
  description text not null default '',
  specs_json text not null default '{}',
  thumbnail_url text not null default '',
  photo_urls text not null default '[]',
  dealer_listing_url text not null,
  status text not null default 'active',
  is_premium boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_status_idx on vehicles (status);
create index if not exists vehicles_price_idx on vehicles (price_cents);
create index if not exists vehicles_make_idx on vehicles (make);
create index if not exists vehicles_dealer_idx on vehicles (dealership_id);
create index if not exists vehicles_external_idx on vehicles (dealership_id, external_id);

create table if not exists crawl_runs (
  id serial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  dealers_scanned integer not null default 0,
  listings_found integer not null default 0,
  added integer not null default 0,
  updated integer not null default 0,
  removed integer not null default 0,
  error_message text
);

create table if not exists crawl_events (
  id serial primary key,
  crawl_run_id integer references crawl_runs(id),
  dealership_id text,
  vehicle_id text,
  event_type text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists crawl_events_run_idx on crawl_events (crawl_run_id);

-- CRM leads: every live lease quote is ingested here
create table if not exists crm_leads (
  id serial primary key,
  vehicle_id text references vehicles(id),
  vehicle_label text not null,
  dealer_name text not null default '',
  price_cents bigint not null,
  down_payment_cents bigint not null,
  residual_cents bigint not null,
  term_months integer not null default 36,
  monthly_payment_cents bigint not null,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  notes text not null default '',
  source text not null default 'lease_quote',
  status text not null default 'new',
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_leads_status_idx on crm_leads (status);
create index if not exists crm_leads_created_idx on crm_leads (created_at desc);

create table if not exists app_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
