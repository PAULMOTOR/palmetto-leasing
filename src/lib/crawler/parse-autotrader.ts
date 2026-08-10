/**
 * Parse AutoTrader.ca dealer pages via embedded __NEXT_DATA__ listings.
 * Used when a partner's own site is Cloudflare-blocked (e.g. Paul Motor).
 */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";

type AtListing = {
  id?: string;
  identifier?: string;
  url?: string;
  description?: string;
  images?: string[];
  price?: { priceRaw?: number; priceFormatted?: string };
  vehicle?: {
    make?: string;
    model?: string;
    modelYear?: number;
    modelVersionInput?: string;
    transmission?: string;
    fuel?: string;
    mileageInKm?: string;
    articleType?: string;
  };
};

export function isAutoTraderUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /autotrader\.ca$/i.test(u.hostname.replace(/^www\./, ""));
  } catch {
    return /autotrader\.ca/i.test(url);
  }
}

export function parseAutoTraderHtml(html: string, pageUrl: string, dealerId: string): SeedVehicle[] {
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nd?.[1]) return [];

  let listings: AtListing[] = [];
  try {
    const json = JSON.parse(nd[1]) as {
      props?: { pageProps?: { listings?: AtListing[]; numberOfResults?: number } };
    };
    listings = json.props?.pageProps?.listings || [];
  } catch {
    return [];
  }

  const out: SeedVehicle[] = [];
  for (const l of listings) {
    const v = l.vehicle || {};
    const priceCad = Number(l.price?.priceRaw || 0);
    if (!Number.isFinite(priceCad) || priceCad <= 0) continue;
    const priceCents = Math.round(priceCad * 100);
    if (priceCents < PREMIUM_MIN_CENTS) continue;

    const year = Number(v.modelYear) || new Date().getFullYear();
    const make = (v.make || "Unknown").trim();
    const model = (v.model || "Model").trim();
    const trim = (v.modelVersionInput || "").trim();
    const mileage = Number(String(v.mileageInKm || "").replace(/[^0-9]/g, "")) || 0;
    const external_id = String(l.id || l.identifier || `${year}-${make}-${model}-${priceCents}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 64);

    const photos = (l.images || [])
      .map((img) => {
        if (typeof img !== "string") return "";
        // Prefer larger crop than the 250x188 list thumb
        return img.replace(/\/\d+x\d+\.webp(\?.*)?$/i, "/800x600.webp$1");
      })
      .filter((u) => /^https?:\/\//i.test(u));

    let listingUrl = l.url || pageUrl;
    if (listingUrl.startsWith("/")) listingUrl = `https://www.autotrader.ca${listingUrl}`;

    out.push({
      external_id: `at-${external_id}`,
      dealership_id: dealerId,
      year,
      make,
      model,
      trim,
      body_style: guessBody(model, trim),
      exterior_color: "",
      interior_color: "",
      mileage,
      price_cents: priceCents,
      vin: "",
      stock_number: external_id,
      description:
        (typeof l.description === "string" ? l.description.slice(0, 800) : "") ||
        `${year} ${make} ${model} ${trim} · Paul Motor via AutoTrader · CAD`.trim(),
      specs: {
        engine: "—",
        transmission: v.transmission || "—",
        drivetrain: "—",
        horsepower: "—",
        fuel: v.fuel || "—",
        seats: "—",
        doors: "—",
        source: "autotrader",
      },
      thumbnail: photos[0] || "/vehicles/top-porsche-911.jpg",
      photos,
      listing_path: listingUrl,
    });
  }

  // Deduplicate by external_id
  const seen = new Set<string>();
  return out.filter((v) => {
    if (seen.has(v.external_id)) return false;
    seen.add(v.external_id);
    return true;
  });
}

function guessBody(model: string, trim: string): string {
  const m = `${model} ${trim}`.toLowerCase();
  if (/urus|cayenne|macan|bentayga|cullinan|range|defender|g.?class|g.?63|gle|x[567]|q[578]|purosangue|escalade/.test(m))
    return "SUV";
  if (/spider|spyder|volante|roadster|convertible|cabrio|z8/.test(m)) return "Convertible";
  if (/van|metris|sprinter/.test(m)) return "Van";
  return "Coupe";
}
