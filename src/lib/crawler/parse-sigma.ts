/**
 * Sigma Automotive public inventory API.
 * Listing pages: https://www.sigmaautomotive.ca/inventory/{slug}
 * (not /autos/{slug} — that 404s)
 */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";

type SigmaVehicle = {
  id: string;
  slug: string;
  make: string;
  model: string;
  year: number;
  trim?: string;
  price?: number;
  status?: string;
  mileage?: number;
  exteriorColor?: string;
  interiorColor?: string;
  engine?: string;
  horsepower?: number | string;
  transmission?: string;
  drivetrain?: string;
  fuelType?: string;
  description?: string;
  vin?: string;
  images?: { url: string; sortOrder?: number; isCover?: boolean }[];
};

const SIGMA_ORIGIN = "https://www.sigmaautomotive.ca";

export function sigmaListingUrl(slug: string): string {
  const s = (slug || "").replace(/^\/+/, "");
  return `${SIGMA_ORIGIN}/inventory/${s}`;
}

export async function fetchSigmaVehicles(dealerId: string): Promise<{
  items: SeedVehicle[];
  notes: string[];
}> {
  const notes: string[] = [];
  const res = await fetch(`${SIGMA_ORIGIN}/api/vehicles`, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (compatible; PalmettoLeasingBot/2.0; +https://palmettoleasing.com)",
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    notes.push(`Sigma API HTTP ${res.status}`);
    return { items: [], notes };
  }
  const data = (await res.json()) as SigmaVehicle[] | { vehicles?: SigmaVehicle[] };
  const arr = Array.isArray(data) ? data : data.vehicles || [];
  notes.push(`Sigma API returned ${arr.length} rows`);

  const items: SeedVehicle[] = [];
  for (const v of arr) {
    const status = (v.status || "").toLowerCase();
    if (status && !/active|available|new|listed|live/i.test(status) && status !== "") {
      // skip sold/draft unless they have a real price and look active
      if (/sold|draft|archived|hidden/i.test(status)) continue;
    }
    const priceCad = Number(v.price || 0);
    if (!Number.isFinite(priceCad) || priceCad < 150_000) continue;
    const priceCents = Math.round(priceCad * 100);
    if (priceCents < PREMIUM_MIN_CENTS) continue;
    if (!v.slug) continue;

    const photos = (v.images || [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((i) => i.url)
      .filter((u) => /^https?:\/\//i.test(u));

    items.push({
      external_id: `sigma-${v.id || v.slug}`.slice(0, 64),
      dealership_id: dealerId,
      year: Number(v.year) || new Date().getFullYear(),
      make: v.make || "Unknown",
      model: v.model || "Model",
      trim: v.trim || "",
      body_style: "Coupe",
      exterior_color: v.exteriorColor || "",
      interior_color: v.interiorColor || "",
      mileage: Number(v.mileage) || 0,
      price_cents: priceCents,
      vin: v.vin || "",
      stock_number: v.slug || v.id,
      description: (v.description || "").slice(0, 800),
      specs: {
        engine: v.engine || "—",
        transmission: v.transmission || "—",
        drivetrain: v.drivetrain || "—",
        horsepower: v.horsepower != null ? String(v.horsepower) : "—",
        fuel: v.fuelType || "—",
        seats: "—",
        doors: "—",
        source: "sigma-api",
      },
      thumbnail: photos[0] || "",
      photos,
      listing_path: sigmaListingUrl(v.slug),
    });
  }

  notes.push(`Sigma ≥ $150k active: ${items.length}`);
  return { items, notes };
}
