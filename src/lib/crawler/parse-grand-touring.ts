/** Grand Touring Automobiles — POST /api/vehicleinventory/listinventory/ */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";
import { dollarsToCents, fetchDealerPage } from "./http";
import { rawToSeedVehicles, type RawListing } from "./parse-vehicles";

type GtaRow = {
  stock_number?: string;
  model_year?: string | number;
  make_name?: string;
  model_name?: string;
  model_edition?: string;
  total_sales_price_formatted?: string;
  current_kms_formatted?: string;
  get_first_picture?: string;
  get_full_name?: string;
};

export type GtaVdp = {
  photos: string[];
  exterior: string;
  interior: string;
};

function decodeHtml(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** This VIN's shoot lives in `.freshImages` / `#lightboxCarousel`. Cut before Similar Vehicles. */
function gtaGalleryHtml(html: string): string {
  const similar = html.search(/similar vehicles/i);
  const hardEnd = similar > 0 ? similar : html.length;
  const start = html.search(/id=["']lightboxCarousel["']|class=["'][^"']*freshImages/i);
  const from = start >= 0 ? start : 0;
  return html.slice(from, Math.min(hardEnd, from + 80_000));
}

function carimageUrls(html: string): string[] {
  const photos: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const u = raw.replace(/&amp;/g, "&").split("?")[0]!;
    if (!u || seen.has(u)) return;
    seen.add(u);
    photos.push(u);
  };
  // Prefer GTA's own walkaround copies when they exist.
  for (const m of html.matchAll(
    /https?:\/\/files\.dlsaccelerator\.com\/webasp\/uploads\/carimages\/[^"'?\s]+/gi,
  )) {
    push(m[0]!);
  }
  if (photos.length) return photos;
  // Some consignment VDPs only host the shoot on AutoScout (no carimages/).
  for (const m of html.matchAll(
    /https?:\/\/prod\.pictures\.autoscout24\.net\/listing-images\/[0-9a-f-]+_[0-9a-f-]+\.(?:jpe?g|webp)/gi,
  )) {
    push(m[0]!);
  }
  return photos;
}

/**
 * GTA VDPs put brand logos (gta-prod S3) in the first <img> slots, then the
 * real shoot in `.freshImages` / `#lightboxCarousel` — dlsaccelerator carimages
 * when GTA copied the files, AutoScout listing-images when they did not.
 */
export function parseGrandTouringVdp(html: string): GtaVdp {
  const exterior = decodeHtml(
    html.match(/<div class="key">EXTERIOR<\/div>\s*<div class="value">([^<]+)/i)?.[1] || "",
  );
  const interior = decodeHtml(
    html.match(/<div class="key">INTERIOR<\/div>\s*<div class="value">([^<]+)/i)?.[1] || "",
  );
  return { photos: carimageUrls(gtaGalleryHtml(html)), exterior, interior };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(Math.max(1, limit), items.length || 1);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function fetchGrandTouringInventory(
  dealerId: string,
): Promise<{ items: SeedVehicle[]; notes: string[] }> {
  const notes: string[] = [];
  const landing = await fetchDealerPage("https://www.grandtouringautos.com/vehicles/pre-owned/", {
    referer: "https://www.grandtouringautos.com/",
  });
  notes.push(`GTA HTML HTTP ${landing.status}`);
  const csrfFromHtml = landing.text.match(
    /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)/i,
  )?.[1];
  const csrfFromCookie = landing.cookies.match(/csrftoken=([^;]+)/i)?.[1];
  const csrf = csrfFromCookie || csrfFromHtml || "";
  const page = await fetchDealerPage(
    "https://www.grandtouringautos.com/api/vehicleinventory/listinventory/",
    {
      method: "POST",
      accept: "application/json",
      body: JSON.stringify({ inventoryType: "pre-owned" }),
      referer: "https://www.grandtouringautos.com/vehicles/pre-owned/",
      origin: "https://www.grandtouringautos.com",
      cookie: landing.cookies,
      headers: csrf ? { "x-csrftoken": csrf } : undefined,
    },
  );
  if (page.status >= 400) {
    notes.push(`GTA API HTTP ${page.status}`);
    return { items: [], notes };
  }
  let rows: GtaRow[] = [];
  try {
    const json = JSON.parse(page.text) as { data?: GtaRow[] };
    rows = Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    notes.push(`GTA API JSON: ${err instanceof Error ? err.message : String(err)}`);
    return { items: [], notes };
  }

  const raw: RawListing[] = [];
  for (const r of rows) {
    const priceCents = dollarsToCents(r.total_sales_price_formatted);
    if (priceCents < PREMIUM_MIN_CENTS) continue;
    const year = Number(r.model_year) || new Date().getFullYear();
    const make = String(r.make_name || "Unknown").trim();
    const model = String(r.model_name || "Model").trim();
    const trim = String(r.model_edition || "").trim();
    const stock = String(r.stock_number || "").trim();
    const km = Number(String(r.current_kms_formatted || "0").replace(/[^0-9]/g, "")) || 0;
    const img = String(r.get_first_picture || "");
    const images = img && !/gta-prod\.s3/i.test(img) ? [img] : [];
    raw.push({
      year,
      make,
      model,
      trim,
      priceCents,
      mileage: km,
      stock,
      description: String(r.get_full_name || `${year} ${make} ${model}`),
      url: stock
        ? `https://www.grandtouringautos.com/vehicle/${encodeURIComponent(stock)}/`
        : "https://www.grandtouringautos.com/vehicles/pre-owned/",
      images,
    });
  }

  let colored = 0;
  let withShoot = 0;
  await mapLimit(raw, 5, async (item) => {
    if (!item.url || !item.stock) return;
    try {
      const vdp = await fetchDealerPage(item.url, {
        referer: "https://www.grandtouringautos.com/vehicles/pre-owned/",
      });
      if (vdp.status >= 400) return;
      const parsed = parseGrandTouringVdp(vdp.text);
      if (parsed.exterior) {
        item.exterior = parsed.exterior;
        colored += 1;
      }
      if (parsed.interior) item.interior = parsed.interior;
      if (parsed.photos.length) {
        const lead = item.images[0];
        const rest = parsed.photos.filter((p) => p !== lead);
        item.images = (lead ? [lead, ...rest] : parsed.photos).slice(0, 16);
        withShoot += 1;
      }
    } catch {
      /* keep list-api photo */
    }
  });

  const items = rawToSeedVehicles(dealerId, raw).map((v) => ({
    ...v,
    specs: { ...v.specs, source: "grand-touring-api" },
  }));
  notes.push(
    `GTA API ${rows.length} rows → ${items.length} ≥$150k · ${withShoot} galleries · ${colored} paint codes`,
  );
  return { items, notes };
}
