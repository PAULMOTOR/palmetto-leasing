/**
 * AAN WordPress Ferrari sites (Ferrari Québec).
 * Inventory lives at GET /api/cars?pageID=… — some edges 403 this IP.
 */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";
import { dollarsToCents, fetchDealerPage } from "./http";
import { parseVehiclesFromHtml, rawToSeedVehicles, type RawListing } from "./parse-vehicles";

type AanCar = {
  id?: string | number;
  year?: string | number;
  make?: string;
  model?: string;
  mileage?: string | number;
  lower_price?: string | number;
  price?: string | number;
  image_link?: string[] | string;
  url_link?: string;
  sold?: string;
  pending_sale?: string;
  stock?: string;
  stockno?: string;
};

function parseAanHtml(html: string, origin: string): RawListing[] {
  const fromLd = parseVehiclesFromHtml(html, `${origin}/pre-owned-ferrari/`);
  if (fromLd.length) return fromLd;
  const out: RawListing[] = [];
  const cards = html.split(/(?=<article\b|<div[^>]+class="[^"]*(?:car|vehicle|inventory)[^"]*")/i);
  for (const card of cards) {
    const titleM = card.match(/(20\d{2})\s+(Ferrari)\s+([A-Za-z0-9][^<$]{1,40})/i);
    const priceM = card.match(/\$[\d,]+/);
    if (!titleM || !priceM) continue;
    const hrefM = card.match(/href="([^"]+)"/i);
    const imgM = card.match(/src="(https?:\/\/[^"]+)"/i);
    const stockM = card.match(/Stock[^A-Za-z0-9]*([A-Za-z0-9-]+)/i);
    const path = hrefM?.[1] || "";
    const url = path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
    out.push({
      year: Number(titleM[1]),
      make: "Ferrari",
      model: titleM[3]!.trim(),
      trim: "",
      priceCents: dollarsToCents(priceM[0]),
      stock: stockM?.[1] || "",
      url,
      images: imgM ? [imgM[1]!] : [],
      description: `${titleM[1]} Ferrari ${titleM[3]!.trim()}`,
    });
  }
  return out;
}

export async function fetchAanInventory(
  dealerId: string,
  siteOrigin: string,
  pageId: string,
): Promise<{ items: SeedVehicle[]; notes: string[] }> {
  const notes: string[] = [];
  const origin = siteOrigin.replace(/\/$/, "").replace(/^https:\/\/www\./i, "https://");
  const origins = [origin, origin.replace("https://", "https://www.")];
  let pageID = pageId;
  let htmlText = "";

  for (const o of origins) {
    const htmlUrl = `${o}/pre-owned-ferrari/`;
    try {
      const html = await fetchDealerPage(htmlUrl, { referer: o + "/" });
      notes.push(`AAN HTML ${o} HTTP ${html.status} (${html.text.length}b)`);
      if (html.status < 400 && html.text.length > 800) {
        htmlText = html.text;
        const m = html.text.match(/pageID\s*=\s*['"](\d+)['"]/);
        if (m) pageID = m[1]!;
        break;
      }
    } catch (err) {
      notes.push(`AAN HTML ${o}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const o of origins) {
    try {
      const api = await fetchDealerPage(`${o}/api/cars?pageID=${pageID}`, {
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${o}/pre-owned-ferrari/`,
      });
      notes.push(`AAN /api/cars ${o} HTTP ${api.status}`);
      if (api.status >= 400) continue;
      let cars: AanCar[] = [];
      try {
        const json = JSON.parse(api.text) as AanCar[] | { vehicles?: AanCar[] };
        cars = Array.isArray(json) ? json : Array.isArray(json.vehicles) ? json.vehicles : [];
      } catch (err) {
        notes.push(`AAN JSON: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      const raw: RawListing[] = [];
      for (const c of cars) {
        if (String(c.sold || "").toLowerCase() === "sold") continue;
        const priceCents = dollarsToCents(c.lower_price ?? c.price);
        if (priceCents < PREMIUM_MIN_CENTS) continue;
        const images = Array.isArray(c.image_link)
          ? c.image_link.filter((u) => /^https?:\/\//i.test(u))
          : c.image_link
            ? [c.image_link]
            : [];
        const path = String(c.url_link || "");
        const url = path.startsWith("http") ? path : `${o}${path.startsWith("/") ? "" : "/"}${path}`;
        raw.push({
          year: Number(c.year) || new Date().getFullYear(),
          make: String(c.make || "Ferrari").trim(),
          model: String(c.model || "Model").trim(),
          trim: "",
          priceCents,
          mileage: Number(String(c.mileage || "0").replace(/[^0-9]/g, "")) || 0,
          stock: String(c.stock || c.stockno || c.id || ""),
          url,
          images,
          description: `${c.year} ${c.make} ${c.model}`,
        });
      }
      const items = rawToSeedVehicles(dealerId, raw).map((v) => ({
        ...v,
        specs: { ...v.specs, source: "aan-api" },
      }));
      notes.push(`AAN ≥$150k: ${items.length} of ${cars.length}`);
      if (items.length) return { items, notes };
    } catch (err) {
      notes.push(`AAN API ${o}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (htmlText) {
    const raw = parseAanHtml(htmlText, origin);
    const items = rawToSeedVehicles(dealerId, raw).map((v) => ({
      ...v,
      specs: { ...v.specs, source: "aan-html" },
    }));
    notes.push(`AAN HTML fallback ≥$150k: ${items.length}`);
    return { items, notes };
  }

  return { items: [], notes };
}
