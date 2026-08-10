export type Dealership = {
  id: string;
  name: string;
  city: string;
  province: string;
  brands: string;
  website_url: string;
  inventory_url: string;
  active: boolean;
};

export type VehicleSpecs = {
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  horsepower?: string;
  fuel?: string;
  seats?: string;
  doors?: string;
  [key: string]: string | undefined;
};

export type Vehicle = {
  id: string;
  dealership_id: string;
  external_id: string;
  slug: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  exterior_color: string;
  interior_color: string;
  mileage: number;
  price_cents: number;
  currency: string;
  vin: string | null;
  stock_number: string | null;
  description: string;
  specs_json: string;
  thumbnail_url: string;
  photo_urls: string;
  dealer_listing_url: string;
  status: string;
  is_premium: boolean;
  first_seen_at: string;
  last_seen_at: string;
  removed_at: string | null;
  dealer_name?: string;
  dealer_city?: string;
  dealer_province?: string;
};

export type VehicleCard = Vehicle & {
  monthly_payment_cents: number;
  specs: VehicleSpecs;
  photos: string[];
};

export type CrmLead = {
  id: number;
  vehicle_id: string | null;
  vehicle_label: string;
  dealer_name: string;
  price_cents: number;
  down_payment_cents: number;
  residual_cents: number;
  term_months: number;
  monthly_payment_cents: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  source: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type CrawlRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  dealers_scanned: number;
  listings_found: number;
  added: number;
  updated: number;
  removed: number;
  error_message: string | null;
};

export function parseSpecs(json: string): VehicleSpecs {
  try {
    return JSON.parse(json || "{}") as VehicleSpecs;
  } catch {
    return {};
  }
}

export function parsePhotos(json: string): string[] {
  try {
    const v = JSON.parse(json || "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function vehicleLabel(v: Pick<Vehicle, "year" | "make" | "model" | "trim">): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}
