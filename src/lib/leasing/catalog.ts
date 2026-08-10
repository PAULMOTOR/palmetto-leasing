/**
 * Static inventory catalog for the public marketing site.
 * No database — curated partner inventory ships with the deploy.
 */
import {
  BASE_INVENTORY,
  DEALERS,
  ROTATING_ARRIVALS,
  dealerListingUrl,
  slugifyVehicle,
  type SeedDealer,
  type SeedVehicle,
} from "./seed";
import { calculateLease, type QuoteSettings } from "./calc";
import type { VehicleCard } from "./types";
import { loadQuoteSettings } from "./quote-config";

const PREMIUM_THRESHOLD_CENTS = 150_000_00;

export function activeDealers(): SeedDealer[] {
  return DEALERS.filter((d) => d.active);
}

export function allSeedVehicles(): SeedVehicle[] {
  return [...BASE_INVENTORY, ...ROTATING_ARRIVALS];
}

function toVehicleCard(item: SeedVehicle, dealer: SeedDealer, settings: QuoteSettings): VehicleCard {
  const id = `${item.dealership_id}_${item.external_id}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const slug = slugifyVehicle(item);
  const quote = calculateLease(item.price_cents, settings);
  const photos = item.photos.length ? item.photos : [item.thumbnail];
  return {
    id,
    dealership_id: item.dealership_id,
    external_id: item.external_id,
    slug,
    year: item.year,
    make: item.make,
    model: item.model,
    trim: item.trim,
    body_style: item.body_style,
    exterior_color: item.exterior_color,
    interior_color: item.interior_color,
    mileage: item.mileage,
    price_cents: item.price_cents,
    currency: "CAD",
    vin: item.vin,
    stock_number: item.stock_number,
    description: item.description,
    specs_json: JSON.stringify(item.specs),
    thumbnail_url: item.thumbnail,
    photo_urls: JSON.stringify(photos),
    dealer_listing_url: dealerListingUrl(item.dealership_id, item.listing_path),
    status: "active",
    is_premium: item.price_cents >= PREMIUM_THRESHOLD_CENTS,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    removed_at: null,
    dealer_name: dealer.name,
    dealer_city: dealer.city,
    dealer_province: dealer.province,
    monthly_payment_cents: quote.monthlyPaymentCents,
    specs: item.specs,
    photos,
  };
}

export function listCatalogVehicles(settings?: QuoteSettings): VehicleCard[] {
  const qs = settings ?? loadQuoteSettings();
  const dealers = new Map(DEALERS.map((d) => [d.id, d]));
  const activeIds = new Set(activeDealers().map((d) => d.id));
  return allSeedVehicles()
    .filter((v) => activeIds.has(v.dealership_id))
    .map((v) => {
      const d = dealers.get(v.dealership_id)!;
      return toVehicleCard(v, d, qs);
    })
    .sort((a, b) => b.price_cents - a.price_cents);
}

export function getCatalogVehicleBySlug(slug: string, settings?: QuoteSettings): VehicleCard | null {
  return listCatalogVehicles(settings).find((v) => v.slug === slug) ?? null;
}

export function getCatalogVehicleById(id: string, settings?: QuoteSettings): VehicleCard | null {
  return listCatalogVehicles(settings).find((v) => v.id === id) ?? null;
}

export function listCatalogDealerSummaries() {
  return activeDealers().map((d) => ({
    id: d.id,
    name: d.name,
    city: d.city,
    province: d.province,
    brands: d.brands,
    website_url: d.website_url,
    inventory_url: d.inventory_url,
    count: allSeedVehicles().filter((v) => v.dealership_id === d.id).length,
  }));
}
