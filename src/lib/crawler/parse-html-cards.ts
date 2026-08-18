/**
 * Generic dealer SRP cards: title + CAD/$ price + listing href.
 * Covers GCL (gclcars.ca) and similar server-rendered inventories.
 */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";
import { rawToSeedVehicles, type RawListing } from "./parse-vehicles";

const MAKES = [
  "Mercedes-Benz",
  "Mercedes",
  "Land Rover",
  "Range Rover",
  "Aston Martin",
  "Rolls-Royce",
  "Rolls Royce",
  "Alfa Romeo",
  "Lamborghini",
  "Maserati",
  "McLaren",
  "Bentley",
  "Porsche",
  "Ferrari",
  "Cadillac",
  "Chevrolet",
  "Corvette",
  "BMW",
  "Audi",
  "Lexus",
  "Jaguar",
  "Tesla",
  "Ford",
  "GMC",
  "Jeep",
  "Dodge",
  "Toyota",
  "Honda",
  "Nissan",
  "Volkswagen",
  "Volvo",
  "Mini",
  "Genesis",
  "Infiniti",
  "Acura",
];

function absUrl(href: string, pageUrl: string): string {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return href;
  }
}

function parseTitle(title: string): { year: number; make: string; model: string; trim: string } {
  const clean = title.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const ym = clean.match(/^(\d{4})\s+(.+)$/);
  const year = ym ? Number(ym[1]) : new Date().getFullYear();
  const rest = ym ? ym[2]! : clean;
  const make =
    MAKES.find((mk) => rest.toLowerCase().startsWith(mk.toLowerCase())) ||
    rest.split(/\s+/)[0] ||
    "Unknown";
  const after = rest.slice(make.length).trim();
  const bits = after.split(/\s+/).filter(Boolean);
  return { year, make: make === "Mercedes" ? "Mercedes-Benz" : make, model: bits[0] || "Model", trim: bits.slice(1).join(" ") };
}

function priceToCents(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 1000) return 0;
  return Math.round(n * 100);
}

export function parseHtmlInventoryCards(html: string, pageUrl: string): RawListing[] {
  const out: RawListing[] = [];

  const blocks = html.split(
    /(?=<div[^>]+(?:car-grid-layout-box|product-summary|inventory-listing|vehicle-card|srp-item|listing-item))/i,
  );
  const chunks = blocks.length > 2 ? blocks : [html];

  for (const chunk of chunks) {
    const priceM =
      chunk.match(/CAD\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d{2})?)/i) ||
      chunk.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d{2})?)/);
    if (!priceM) continue;
    const priceCents = priceToCents(priceM[1]!);
    if (priceCents < PREMIUM_MIN_CENTS) continue;

    const hrefM = chunk.match(
      /href=["']([^"']*(?:product-details|inventory|vehicles?|listing|vdp)[^"']+)["']/i,
    ) || chunk.match(/href=["']([^"']+\/20\d{2}-[^"']+)["']/i);
    if (!hrefM) continue;

    const titleM =
      chunk.match(/<(?:h[1-5]|a)[^>]*>([^<]*20\d{2}\s+[A-Z][^<]{4,80})<\/(?:h[1-5]|a)>/i) ||
      chunk.match(/alt=["']([^"']*20\d{2}[^"']+)["']/i);
    const title = (titleM?.[1] || "").replace(/\s+/g, " ").trim();
    if (!title) continue;

    const parsed = parseTitle(title);
    const kmM = chunk.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,6})(?:&nbsp;|\s)+(?:km|kms|kilometers)/i);
    const stockM = chunk.match(/stock\s*#?\s*:?\s*([A-Za-z0-9-]+)/i);
    const imgM = chunk.match(/<(?:img[^>]+src|div[^>]+background-image:\s*url\()['"]?(https?:\/\/[^'")\s]+)/i);

    out.push({
      year: parsed.year,
      make: parsed.make,
      model: parsed.model,
      trim: parsed.trim,
      priceCents,
      mileage: kmM ? Number(kmM[1]!.replace(/,/g, "")) : 0,
      stock: stockM?.[1],
      url: absUrl(hrefM[1]!, pageUrl),
      images: imgM ? [imgM[1]!.replace(/-medium(\.\w+)$/i, "-large$1")] : [],
      description: title,
    });
  }

  return out;
}

export function htmlCardsToVehicles(dealerId: string, html: string, pageUrl: string): SeedVehicle[] {
  return rawToSeedVehicles(dealerId, parseHtmlInventoryCards(html, pageUrl)).map((v) => ({
    ...v,
    specs: { ...v.specs, source: "html-cards" },
  }));
}

export async function fetchGclInventory(dealerId: string): Promise<{ items: SeedVehicle[]; notes: string[] }> {
  const notes: string[] = [];
  const items: SeedVehicle[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < 8; page++) {
    const url =
      page === 0
        ? "https://gclcars.ca/inventory"
        : `https://gclcars.ca/fragment/inventory/search/${page}`;
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          accept: "text/html",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        notes.push(`GCL page ${page} HTTP ${res.status}`);
        break;
      }
      const html = await res.text();
      const batch = htmlCardsToVehicles(dealerId, html, "https://gclcars.ca/inventory");
      let added = 0;
      for (const v of batch) {
        const key = v.external_id;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(v);
        added += 1;
      }
      notes.push(`GCL page ${page}: ${batch.length} ≥$150k`);
      if (page > 0 && added === 0 && !/CAD\s*[0-9]/.test(html)) break;
    } catch (err) {
      notes.push(`GCL page ${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  notes.push(`GCL ≥$150k live: ${items.length}`);
  return { items, notes };
}
