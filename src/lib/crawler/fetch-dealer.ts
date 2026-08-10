/**
 * Live dealer inventory fetchers.
 * Tries real HTTP pulls (JSON-LD, embedded JSON, HTML heuristics).
 * Falls back to curated seed for that dealer when scrape is thin/blocked.
 */
import {
  BASE_INVENTORY,
  PREMIUM_MIN_CENTS,
  type SeedVehicle,
} from "@/lib/leasing/seed";

const MIN_PRICE = PREMIUM_MIN_CENTS;
const USER_AGENT =
  "PalmettoLeasingBot/1.0 (+https://palmettoleasing.com; inventory aggregator; contact: hello@palmettoleasing.com)";

export type FetchResult = {
  dealerId: string;
  source: "live" | "seed" | "mixed";
  items: SeedVehicle[];
  httpStatus?: number;
  notes: string[];
};

type ParsedListing = {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  priceCents?: number;
  mileage?: number;
  vin?: string;
  stock?: string;
  exterior?: string;
  url?: string;
  image?: string;
  body?: string;
};

export async function fetchDealerInventory(
  dealerId: string,
  inventoryUrl: string,
): Promise<FetchResult> {
  const notes: string[] = [];
  const seed = BASE_INVENTORY.filter((v) => v.dealership_id === dealerId);

  let live: SeedVehicle[] = [];
  let httpStatus: number | undefined;

  try {
    const res = await fetch(inventoryUrl, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/json,*/*",
        "accept-language": "en-CA,en;q=0.9",
      },
      signal: AbortSignal.timeout(18_000),
      redirect: "follow",
    });
    httpStatus = res.status;
    const ctype = res.headers.get("content-type") || "";
    const text = await res.text();

    if (!res.ok) {
      notes.push(`HTTP ${res.status} from inventory URL`);
    } else {
      const parsed: ParsedListing[] = [];
      if (ctype.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
        parsed.push(...parseJsonBlob(text));
      }
      parsed.push(...parseJsonLd(text));
      parsed.push(...parseEmbeddedJson(text));
      parsed.push(...parseHtmlHeuristics(text));

      live = normalizeListings(dealerId, inventoryUrl, parsed, seed);
      notes.push(`Parsed ${parsed.length} raw · ${live.length} ≥ $150k after normalize`);
    }
  } catch (err) {
    notes.push(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Always keep seed baseline so partner pages that block bots don't empty the site.
  // Prefer live when we have a solid haul; otherwise merge unique seed rows.
  if (live.length >= 3) {
    const byKey = new Map<string, SeedVehicle>();
    for (const v of seed) byKey.set(v.external_id, v);
    for (const v of live) byKey.set(v.external_id, v);
    return {
      dealerId,
      source: "mixed",
      items: [...byKey.values()].filter((v) => v.price_cents >= MIN_PRICE),
      httpStatus,
      notes: [...notes, `Merged live+seed → ${byKey.size} units`],
    };
  }

  return {
    dealerId,
    source: "seed",
    items: seed.filter((v) => v.price_cents >= MIN_PRICE),
    httpStatus,
    notes: [...notes, `Using curated seed (${seed.length} units) until live parse improves`],
  };
}

function parseJsonLd(html: string): ParsedListing[] {
  const out: ParsedListing[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]!);
      walkJson(data, out);
    } catch {
      /* ignore bad blocks */
    }
  }
  return out;
}

function parseEmbeddedJson(html: string): ParsedListing[] {
  const out: ParsedListing[] = [];
  // Common inventory SPA payloads
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*</,
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*</,
    /"vehicles"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
    /"inventory"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
    /"listings"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    try {
      const data = JSON.parse(m[1]);
      walkJson(data, out);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function parseJsonBlob(text: string): ParsedListing[] {
  const out: ParsedListing[] = [];
  try {
    walkJson(JSON.parse(text), out);
  } catch {
    /* ignore */
  }
  return out;
}

function walkJson(node: unknown, out: ParsedListing[], depth = 0): void {
  if (depth > 12 || node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) walkJson(n, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;

  const price = pickPrice(o);
  const year = pickYear(o);
  const make = pickStr(o, ["make", "brand", "manufacturer", "Make", "Brand"]);
  const model = pickStr(o, ["model", "Model", "modelName"]);

  if (price && price >= MIN_PRICE && (year || make || model)) {
    out.push({
      year: year || undefined,
      make: make || undefined,
      model: model || undefined,
      trim: pickStr(o, ["trim", "Trim", "series", "package"]) || undefined,
      priceCents: price,
      mileage: pickMileage(o),
      vin: pickStr(o, ["vin", "VIN", "Vin"]) || undefined,
      stock: pickStr(o, ["stock", "stockNumber", "stock_number", "sku"]) || undefined,
      exterior: pickStr(o, ["exteriorColor", "exterior_color", "color", "Colour"]) || undefined,
      url: pickStr(o, ["url", "link", "detailUrl", "vdpUrl", "href"]) || undefined,
      image:
        pickStr(o, ["image", "imageUrl", "photo", "thumbnail"]) ||
        (Array.isArray(o.images) && typeof o.images[0] === "string" ? o.images[0] : undefined),
      body: pickStr(o, ["bodyStyle", "body_style", "bodyType", "type"]) || undefined,
    });
  }

  for (const v of Object.values(o)) {
    if (v && typeof v === "object") walkJson(v, out, depth + 1);
  }
}

function parseHtmlHeuristics(html: string): ParsedListing[] {
  const out: ParsedListing[] = [];
  // e.g. 2024 Porsche 911 … $328,900 or CAD 328900
  const re =
    /(20[12]\d)\s+([A-Z][A-Za-z\-]+(?:\s[A-Z][A-Za-z\-]+)?)\s+([A-Za-z0-9][A-Za-z0-9\-\s]{1,40}?)(?:\s+([A-Za-z0-9][A-Za-z0-9\-\s]{0,30}?))?\s*[|·\-]?\s*(?:CAD\s*)?\$?\s*([1-9]\d{2,3}(?:,\d{3})+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const price = Number(m[5]!.replace(/,/g, "")) * 100;
    if (price < MIN_PRICE) continue;
    out.push({
      year: Number(m[1]),
      make: m[2]!.trim(),
      model: m[3]!.trim(),
      trim: m[4]?.trim(),
      priceCents: price,
    });
  }
  return out;
}

function pickPrice(o: Record<string, unknown>): number | null {
  const keys = [
    "price",
    "Price",
    "askingPrice",
    "salePrice",
    "internetPrice",
    "listPrice",
    "priceCents",
    "price_cents",
  ];
  for (const k of keys) {
    if (!(k in o)) continue;
    const n = coerceMoney(o[k]);
    if (n != null) return n;
  }
  if (o.offers && typeof o.offers === "object") {
    const off = o.offers as Record<string, unknown>;
    const n = coerceMoney(off.price ?? off.lowPrice);
    if (n != null) return n;
  }
  return null;
}

function coerceMoney(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // already cents if huge
    if (v > 1_000_000) return Math.round(v);
    return Math.round(v * 100);
  }
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    if (n > 1_000_000) return Math.round(n);
    return Math.round(n * 100);
  }
  return null;
}

function pickYear(o: Record<string, unknown>): number | null {
  for (const k of ["year", "Year", "modelYear", "model_year"]) {
    const v = o[k];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (n >= 1990 && n <= 2030) return n;
  }
  return null;
}

function pickMileage(o: Record<string, unknown>): number | undefined {
  for (const k of ["mileage", "odometer", "km", "kilometers", "Miles"]) {
    const v = o[k];
    const n =
      typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^0-9]/g, "")) : NaN;
    if (Number.isFinite(n) && n >= 0 && n < 2_000_000) return Math.round(n);
  }
  return undefined;
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function brandThumb(make: string, model: string): string {
  const m = make.toLowerCase();
  const md = model.toLowerCase();
  if (m.includes("porsche") && md.includes("taycan")) return "/vehicles/top-porsche-taycan.jpg";
  if (m.includes("porsche")) return "/vehicles/top-porsche-911.jpg";
  if (m.includes("ferrari") && md.includes("puro")) return "/vehicles/top-ferrari-purosangue.jpg";
  if (m.includes("ferrari")) return "/vehicles/top-ferrari-458.jpg";
  if (m.includes("lamborghini") || md.includes("urus")) return "/vehicles/top-urus.jpg";
  if (m.includes("mclaren")) return "/vehicles/top-mclaren.jpg";
  if (m.includes("rolls")) return "/vehicles/top-rolls-spectre.jpg";
  if (m.includes("bentley") || m.includes("aston")) return "/vehicles/top-bentley.jpg";
  if (m.includes("land rover") || m.includes("range")) return "/vehicles/top-urus.jpg";
  return "/vehicles/top-porsche-911.jpg";
}

function normalizeListings(
  dealerId: string,
  inventoryUrl: string,
  raw: ParsedListing[],
  seed: SeedVehicle[],
): SeedVehicle[] {
  const seedByVin = new Map(seed.filter((s) => s.vin).map((s) => [s.vin!.toUpperCase(), s]));
  const out: SeedVehicle[] = [];
  const seen = new Set<string>();

  for (const r of raw) {
    if (!r.priceCents || r.priceCents < MIN_PRICE) continue;
    const year = r.year || new Date().getFullYear();
    const make = r.make || "Unknown";
    const model = r.model || "Model";
    const trim = r.trim || "";
    const external_id =
      (r.vin && r.vin.replace(/[^A-Za-z0-9]/g, "").slice(-12)) ||
      (r.stock && `STK-${r.stock}`) ||
      `WEB-${year}-${make}-${model}-${r.priceCents}`.replace(/[^A-Za-z0-9\-]/g, "").slice(0, 40);

    if (seen.has(external_id)) continue;
    seen.add(external_id);

    const matched = r.vin ? seedByVin.get(r.vin.toUpperCase()) : undefined;
    const thumb =
      r.image && r.image.startsWith("http")
        ? r.image
        : matched?.thumbnail || brandThumb(make, model);

    let listing_path = r.url || matched?.listing_path || "/";
    try {
      if (listing_path.startsWith("http")) {
        listing_path = new URL(listing_path).pathname + new URL(listing_path).search;
      }
    } catch {
      listing_path = "/";
    }

    out.push({
      external_id,
      dealership_id: dealerId,
      year,
      make,
      model,
      trim,
      body_style: r.body || matched?.body_style || "Coupe",
      exterior_color: r.exterior || matched?.exterior_color || "",
      interior_color: matched?.interior_color || "",
      mileage: r.mileage ?? matched?.mileage ?? 0,
      price_cents: r.priceCents,
      vin: r.vin || matched?.vin || "",
      stock_number: r.stock || matched?.stock_number || external_id,
      description:
        matched?.description ||
        `${year} ${make} ${model} ${trim} · sourced from partner inventory · ≥ $150k CAD`.trim(),
      specs: matched?.specs || {
        engine: "—",
        transmission: "—",
        drivetrain: "—",
        horsepower: "—",
        fuel: "—",
        seats: "—",
        doors: "—",
      },
      thumbnail: thumb,
      photos: matched?.photos || [thumb],
      listing_path,
    });
  }

  void inventoryUrl;
  return out;
}
