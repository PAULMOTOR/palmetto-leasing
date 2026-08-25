/**
 * Parse AutoTrader.ca dealer pages via embedded __NEXT_DATA__ listings.
 * Used when a partner's own site is Cloudflare-blocked (e.g. Paul Motor).
 * Dealer pages are 20 listings each — follow ?page=2..numberOfPages.
 */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const MAX_AT_PAGES = 8;

type AtListing = {
  id?: string;
  identifier?: string;
  url?: string;
  description?: string;
  images?: string[];
  isCoverImagePlaceholder?: boolean;
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
    bodyColor?: string;
    bodyColorRaw?: string;
    bodyColorOriginal?: string;
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

export function autotraderPageUrl(dealerUrl: string, page: number): string {
  try {
    const u = new URL(dealerUrl);
    if (page <= 1) u.searchParams.delete("page");
    else u.searchParams.set("page", String(page));
    return u.toString();
  } catch {
    return dealerUrl;
  }
}

export function parseAutoTraderMeta(html: string): { numberOfPages: number; numberOfResults: number } {
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nd?.[1]) return { numberOfPages: 1, numberOfResults: 0 };
  try {
    const json = JSON.parse(nd[1]) as {
      props?: { pageProps?: { numberOfPages?: number; numberOfResults?: number } };
    };
    const pages = Number(json.props?.pageProps?.numberOfPages || 1);
    const results = Number(json.props?.pageProps?.numberOfResults || 0);
    return {
      numberOfPages: Number.isFinite(pages) && pages > 0 ? pages : 1,
      numberOfResults: Number.isFinite(results) ? results : 0,
    };
  } catch {
    return { numberOfPages: 1, numberOfResults: 0 };
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

    const exterior =
      (v.bodyColorOriginal || v.bodyColorRaw || v.bodyColor || "").trim() || colorFromSlug(listingUrl);
    const uniqueShots = new Set(
      photos.map((u) => u.replace(/\/\d{2,4}x\d{2,4}\.(?:jpe?g|webp)(\?.*)?$/i, "")),
    ).size;
    const placeholder =
      Boolean(l.isCoverImagePlaceholder) || photos.length === 0 || uniqueShots <= 1;

    out.push({
      external_id: `at-${external_id}`,
      dealership_id: dealerId,
      year,
      make,
      model,
      trim,
      body_style: guessBody(model, trim),
      exterior_color: exterior,
      interior_color: "",
      mileage,
      price_cents: priceCents,
      vin: "",
      stock_number: external_id,
      description:
        (typeof l.description === "string" ? l.description.slice(0, 800) : "") ||
        `${year} ${make} ${model} ${trim} · via AutoTrader · CAD`.trim(),
      specs: {
        engine: "—",
        transmission: v.transmission || "—",
        drivetrain: "—",
        horsepower: "—",
        fuel: v.fuel || "—",
        seats: "—",
        doors: "—",
        source: "autotrader",
        photosPlaceholder: placeholder ? "1" : "0",
      },
      thumbnail: photos[0] || "",
      photos,
      listing_path: listingUrl,
    });
  }

  const seen = new Set<string>();
  return out.filter((v) => {
    if (seen.has(v.external_id)) return false;
    seen.add(v.external_id);
    return true;
  });
}

export async function fetchAutoTraderPaginated(
  dealerUrl: string,
  dealerId: string,
  opts?: { maxPages?: number },
): Promise<{ items: SeedVehicle[]; notes: string[]; pages: number; results: number }> {
  const notes: string[] = [];
  const maxPages = opts?.maxPages ?? MAX_AT_PAGES;
  const firstUrl = autotraderPageUrl(dealerUrl, 1);
  const items: SeedVehicle[] = [];
  const seen = new Set<string>();

  const first = await fetchAtPage(firstUrl);
  if (!first.ok) {
    notes.push(`AutoTrader HTTP ${first.status} ${firstUrl}`);
    return { items, notes, pages: 0, results: 0 };
  }
  const meta = parseAutoTraderMeta(first.html);
  const totalPages = Math.min(Math.max(1, meta.numberOfPages), maxPages);
  const page1 = parseAutoTraderHtml(first.html, firstUrl, dealerId);
  for (const v of page1) {
    if (seen.has(v.external_id)) continue;
    seen.add(v.external_id);
    items.push(v);
  }
  notes.push(`AutoTrader p1: ${page1.length} ≥$150k (${meta.numberOfResults} listed, ${meta.numberOfPages} pages)`);

  for (let page = 2; page <= totalPages; page++) {
    const url = autotraderPageUrl(dealerUrl, page);
    try {
      const res = await fetchAtPage(url);
      if (!res.ok) {
        notes.push(`AutoTrader p${page} HTTP ${res.status}`);
        break;
      }
      const batch = parseAutoTraderHtml(res.html, url, dealerId);
      let added = 0;
      for (const v of batch) {
        if (seen.has(v.external_id)) continue;
        seen.add(v.external_id);
        items.push(v);
        added += 1;
      }
      notes.push(`AutoTrader p${page}: ${batch.length} ≥$150k`);
      if (batch.length === 0 && added === 0 && page > 2) {
        /* keep scanning — premium cars often sit on later pages */
      }
    } catch (err) {
      notes.push(`AutoTrader p${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  notes.push(`AutoTrader ≥$150k live: ${items.length}`);
  return { items, notes, pages: totalPages, results: meta.numberOfResults };
}

async function fetchAtPage(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-CA,en;q=0.9",
    },
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
  });
  const html = await res.text();
  return { ok: res.ok, status: res.status, html };
}

function guessBody(model: string, trim: string): string {
  const m = `${model} ${trim}`.toLowerCase();
  if (/urus|cayenne|macan|bentayga|cullinan|range|defender|g.?class|g.?63|gle|x[567]|q[578]|purosangue|escalade/.test(m))
    return "SUV";
  if (/spider|spyder|volante|roadster|convertible|cabrio|z8/.test(m)) return "Convertible";
  if (/van|metris|sprinter/.test(m)) return "Van";
  return "Coupe";
}

/** AutoTrader slugs often include `gasoline-grey-cat_…`. */
function colorFromSlug(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const m = path.match(/gasoline-([a-z]+(?:-[a-z]+)*)-cat_/i);
    if (!m?.[1] || m[1] === "other") return "";
    return m[1]
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}
