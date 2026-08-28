/** Winding Road Motorcars — server-rendered inventory cards. */
import { type SeedVehicle } from "@/lib/leasing/seed";
import { dollarsToCents, fetchDealerPage } from "./http";
import { rawToSeedVehicles, type RawListing } from "./parse-vehicles";

const MAKES = [
  "Mercedes-Benz",
  "Mercedes",
  "Aston Martin",
  "Rolls-Royce",
  "Lamborghini",
  "McLaren",
  "Bentley",
  "Porsche",
  "Ferrari",
  "Chevrolet",
  "Corvette",
  "BMW",
  "Audi",
  "Pontiac",
];

function parseTitle(title: string): { year: number; make: string; model: string; trim: string } {
  const clean = title.replace(/\s+/g, " ").trim();
  const ym = clean.match(/^(\d{4})\s+(.+)$/);
  const year = ym ? Number(ym[1]) : new Date().getFullYear();
  const rest = ym ? ym[2]! : clean;
  const make =
    MAKES.find((mk) => rest.toLowerCase().startsWith(mk.toLowerCase())) ||
    rest.split(/\s+/)[0] ||
    "Unknown";
  const after = rest.slice(make.length).trim();
  const bits = after.split(/\s+/).filter(Boolean);
  return {
    year,
    make: make === "Mercedes" ? "Mercedes-Benz" : make,
    model: bits[0] || "Model",
    trim: bits.slice(1).join(" "),
  };
}

export function parseWindingRoadHtml(html: string, pageUrl: string): RawListing[] {
  const out: RawListing[] = [];
  const cards = html.split(/(?=<a[^>]*href="\/inventory\/)/i);
  for (const card of cards) {
    const hrefM = card.match(/href="(\/inventory\/[^"]+)"/i);
    if (!hrefM) continue;
    const titleM =
      card.match(/alt="([^"]+)"/i) ||
      card.match(/<h4[^>]*>([^<]+)<\/h4>/i);
    if (!titleM) continue;
    const title = titleM[1]!.replace(/\s+/g, " ").trim();
    const imgM = card.match(/src="(https:\/\/[^"]+)"/i);
    const priceM = card.match(/\$[\d,]+/);
    if (!priceM) continue;
    const priceCents = dollarsToCents(priceM[0]);
    const stockM = card.match(/Stock #([^<]+)/i);
    const stockKm = stockM?.[1] || "";
    const parsed = parseTitle(title);
    const stock = stockKm.split("·")[0]?.replace(/[^\w-]/g, "") || "";
    const kmM = stockKm.match(/([\d,]+)\s*km/i);
    const url = new URL(hrefM[1]!, pageUrl).toString();
    const img = imgM?.[1] || "";
    out.push({
      year: parsed.year,
      make: parsed.make,
      model: parsed.model,
      trim: parsed.trim,
      priceCents,
      mileage: kmM ? Number(kmM[1]!.replace(/,/g, "")) : 0,
      stock,
      description: title,
      url,
      images: img ? [img] : [],
    });
  }
  return out;
}

export async function fetchWindingRoadInventory(
  dealerId: string,
): Promise<{ items: SeedVehicle[]; notes: string[] }> {
  const notes: string[] = [];
  const page = await fetchDealerPage("https://windingroad.ca/inventory");
  notes.push(`Winding Road HTTP ${page.status}`);
  const raw = parseWindingRoadHtml(page.text, page.url || "https://windingroad.ca/inventory");
  const items = rawToSeedVehicles(dealerId, raw).map((v) => ({
    ...v,
    specs: { ...v.specs, source: "winding-road" },
  }));
  notes.push(`Winding Road ≥$150k: ${items.length}`);
  return { items, notes };
}
