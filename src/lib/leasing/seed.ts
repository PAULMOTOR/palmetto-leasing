/** Partner inventory catalog — live crawl only; no synthetic seed stock. */

export type SeedDealer = {
  id: string;
  name: string;
  city: string;
  province: string;
  brands: string;
  website_url: string;
  inventory_url: string;
  active: boolean;
};

export type SeedVehicle = {
  external_id: string;
  dealership_id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  exterior_color: string;
  interior_color: string;
  mileage: number;
  price_cents: number;
  vin: string;
  stock_number: string;
  description: string;
  specs: Record<string, string>;
  thumbnail: string;
  photos: string[];
  listing_path: string;
};

export const PREMIUM_MIN_CENTS = 150_000_00;

/** Original 12 built-in demo dealers — permanently retired (deleted on crawl). */
export const RETIRED_DEALER_IDS = [
  "pfaff-porsche",
  "mark-motors-ottawa",
  "bmw-toronto",
  "mb-vancouver",
  "audi-stefoy",
  "jlr-toronto",
  "ferrari-ontario",
  "lambo-montreal",
  "mclaren-toronto",
  "rr-vancouver",
  "aston-montreal",
  "bentley-toronto",
] as const;

/** Active partner dealers (seeded into Neon; inventory comes from live crawl). */
export const DEALERS: SeedDealer[] = [
  {
    id: "paul-motor",
    name: "Paul Motor Leasing",
    city: "Montréal",
    province: "QC",
    brands: "Multi-marque · High performance",
    website_url: "https://www.paulmotorleasing.com",
    inventory_url: "https://www.autotrader.ca/dealers/47941991?cid=47941991",
    active: true,
  },
  {
    id: "sigma-auto",
    name: "Sigma Auto",
    city: "Edmonton",
    province: "AB",
    brands: "Exotic · Luxury",
    website_url: "https://www.sigmaautomotive.ca",
    inventory_url: "https://www.sigmaautomotive.ca/inventory",
    active: true,
  },
];

/** No synthetic fallback stock — empty unless live crawl fails completely. */
export const BASE_INVENTORY: SeedVehicle[] = [];

export function dealerById(id: string): SeedDealer | undefined {
  return DEALERS.find((d) => d.id === id);
}

export function dealerListingUrl(dealershipId: string, listingPath: string): string {
  if (listingPath.startsWith("http")) return normalizeDealerListingUrl(listingPath);
  const d = dealerById(dealershipId);
  if (!d) return listingPath;
  try {
    return normalizeDealerListingUrl(new URL(listingPath, d.website_url).toString());
  } catch {
    return normalizeDealerListingUrl(
      `${d.website_url.replace(/\/$/, "")}/${listingPath.replace(/^\//, "")}`,
    );
  }
}

/** Sigma listing pages live at /inventory/:slug — older crawls stored /autos/:slug (404). */
export function normalizeDealerListingUrl(url: string): string {
  if (!url) return url;
  return url.replace(
    /^(https?:\/\/(?:www\.)?sigmaautomotive\.ca)\/autos(\/|$)/i,
    "$1/inventory$2",
  );
}

export function slugifyVehicle(v: Pick<SeedVehicle, "year" | "make" | "model" | "trim" | "external_id" | "dealership_id">): string {
  const base = [v.year, v.make, v.model, v.trim, v.external_id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${v.dealership_id}-${base}`.replace(/-+/g, "-");
}
