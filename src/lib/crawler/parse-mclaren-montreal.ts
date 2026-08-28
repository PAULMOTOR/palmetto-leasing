/** McLaren Montreal — Squarespace pre-owned rows (text col + image col). */
import { type SeedVehicle } from "@/lib/leasing/seed";
import { dollarsToCents, fetchDealerPage } from "./http";
import { rawToSeedVehicles, type RawListing } from "./parse-vehicles";

const MAKES = [
  "Lamborghini",
  "McLaren",
  "Ferrari",
  "Porsche",
  "Bentley",
  "Aston Martin",
  "Mercedes-Benz",
  "Mercedes",
  "BMW",
  "Audi",
];

function parseTitle(title: string): { year: number; make: string; model: string; trim: string } {
  const clean = title.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const ym = clean.match(/^(\d{4})\s+(.+)$/);
  const year = ym ? Number(ym[1]) : new Date().getFullYear();
  const rest = ym ? ym[2]! : clean;
  const make =
    MAKES.find((mk) => rest.toLowerCase().startsWith(mk.toLowerCase())) ||
    rest.split(/\s+/)[0] ||
    "McLaren";
  const after = rest.slice(make.length).trim();
  const bits = after.split(/\s+/).filter(Boolean);
  return { year, make, model: bits[0] || "Model", trim: bits.slice(1).join(" ") };
}

function firstCarImage(chunk: string): string {
  const urls = [
    ...chunk.matchAll(
      /(?:data-src|src)="(https:\/\/images\.squarespace-cdn\.com\/[^"]+)"/gi,
    ),
  ]
    .map((m) => m[1]!)
    .filter((u) => !/logo|favicon|icon|certified/i.test(u));
  return urls[0] || "";
}

export function parseMclarenMontrealHtml(html: string): RawListing[] {
  const out: RawListing[] = [];
  const rows = html.split(/class="row sqs-row"/i);
  for (const row of rows) {
    const titleM = row.match(
      /<(?:h3|strong)[^>]*>\s*(?:<strong>)?(20\d{2}\s+[A-Z][^<]{4,80})/i,
    );
    if (!titleM) continue;
    const priceM = row.match(/\$[\d,]+/);
    if (!priceM) continue;
    const priceCents = dollarsToCents(priceM[0]);
    const parsed = parseTitle(titleM[1]!);
    const kmM = row.match(/Mileage:\s*([\d,]+)\s*KM/i);
    const stockM = row.match(/Stock\s*#:\s*([A-Za-z0-9-]+)/i);
    const colorM = row.match(/Exterior Color:\s*([^<]+)/i);
    const interiorM = row.match(/Interior Color:\s*([^<]+)/i);
    const stock = stockM?.[1] || "";
    const vdpM = row.match(/href="(\/en\/[a-z0-9-]+)"/i);
    const img = firstCarImage(row);
    out.push({
      year: parsed.year,
      make: parsed.make,
      model: parsed.model,
      trim: parsed.trim,
      priceCents,
      mileage: kmM ? Number(kmM[1]!.replace(/,/g, "")) : 0,
      stock,
      exterior: colorM?.[1]?.replace(/&/g, "&").trim(),
      description: titleM[1]!.trim(),
      url: vdpM
        ? `https://www.mclarenmontreal.com${vdpM[1]}`
        : stock
          ? `https://www.mclarenmontreal.com/en/${stock.toLowerCase()}-en`
          : "https://www.mclarenmontreal.com/en/preowned-vehicles",
      images: img ? [img] : [],
    });
    if (interiorM?.[1]) {
      out[out.length - 1]!.description = `${titleM[1]!.trim()} · ${interiorM[1]!.trim()}`;
    }
  }
  return out;
}

export async function fetchMclarenMontrealInventory(
  dealerId: string,
): Promise<{ items: SeedVehicle[]; notes: string[] }> {
  const notes: string[] = [];
  const page = await fetchDealerPage("https://www.mclarenmontreal.com/en/preowned-vehicles");
  notes.push(`McLaren Montreal HTTP ${page.status}`);
  const raw = parseMclarenMontrealHtml(page.text);
  const items = rawToSeedVehicles(dealerId, raw).map((v) => ({
    ...v,
    specs: { ...v.specs, source: "mclaren-montreal" },
  }));
  notes.push(`McLaren Montreal ≥$150k: ${items.length}`);
  return { items, notes };
}
