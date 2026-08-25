/**
 * Extract real vehicle listings from dealer HTML (JSON-LD Vehicle + embedded).
 * Strong dedupe so the same unit never appears twice.
 */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";

export type RawListing = {
  year: number;
  make: string;
  model: string;
  trim: string;
  priceCents: number;
  mileage?: number;
  vin?: string;
  stock?: string;
  exterior?: string;
  body?: string;
  description?: string;
  url?: string;
  images: string[];
};

export function parseVehiclesFromHtml(html: string, pageUrl: string): RawListing[] {
  const out: RawListing[] = [];

  for (const block of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walkJsonLd(JSON.parse(block[1]!), out, pageUrl);
    } catch {
      /* ignore */
    }
  }

  let idx = 0;
  while ((idx = html.indexOf('"@type":"Vehicle"', idx)) !== -1) {
    const start = html.lastIndexOf("{", idx);
    if (start < 0) {
      idx += 10;
      continue;
    }
    const obj = extractBalancedJson(html, start);
    if (obj) {
      try {
        walkJsonLd(JSON.parse(obj), out, pageUrl);
      } catch {
        /* ignore */
      }
    }
    idx += 10;
  }

  return dedupeRawListings(out);
}

/** Fingerprint for one physical unit at one dealer. */
export function listingFingerprint(r: {
  vin?: string;
  stock?: string;
  url?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  priceCents: number;
  mileage?: number;
}): string {
  if (r.vin && r.vin.length >= 8) return `VIN:${r.vin.toUpperCase()}`;
  if (r.stock && r.stock.length >= 2) return `STK:${r.stock.toUpperCase()}`;
  const fromUrl = extractIdFromUrl(r.url || "");
  if (fromUrl) return `URL:${fromUrl}`;
  return [
    r.year,
    r.make,
    r.model,
    r.trim || "",
    r.priceCents,
    r.mileage ?? 0,
  ]
    .join("|")
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function dedupeRawListings(out: RawListing[]): RawListing[] {
  const seen = new Set<string>();
  const unique: RawListing[] = [];
  for (const r of out) {
    if (r.priceCents < PREMIUM_MIN_CENTS) continue;
    const key = listingFingerprint(r);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  return unique;
}

function extractIdFromUrl(url: string): string | null {
  if (!url) return null;
  // dealer.com style: ...-id13356253.html
  const m1 = url.match(/-id(\d+)\.html/i);
  if (m1) return m1[1]!;
  // magnetis: /pre-owned/2024/make/model/2124
  const m2 = url.match(/\/(\d{3,})\/?$/);
  if (m2) return m2[1]!;
  // query id=
  try {
    const u = new URL(url, "https://example.com");
    const q = u.searchParams.get("id") || u.searchParams.get("vehicleId");
    if (q) return q;
  } catch {
    /* ignore */
  }
  return null;
}

function extractBalancedJson(html: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < Math.min(html.length, start + 12000); i++) {
    const ch = html[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function walkJsonLd(node: unknown, out: RawListing[], pageUrl: string, depth = 0): void {
  if (depth > 14 || node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, out, pageUrl, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const type = o["@type"] || o.type;
  const types = Array.isArray(type) ? type.map(String) : [String(type || "")];
  // Only Vehicle/Car — skip bare Offer/Product to reduce duplicate nodes
  const isVehicle = types.some((t) => /^(Vehicle|Car)$/i.test(t));

  if (isVehicle || o.vehicleIdentificationNumber) {
    const listing = toListing(o, pageUrl);
    if (listing) out.push(listing);
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") walkJsonLd(v, out, pageUrl, depth + 1);
  }
}

function toListing(o: Record<string, unknown>, pageUrl: string): RawListing | null {
  const price = extractPrice(o);
  if (price == null || price < PREMIUM_MIN_CENTS) return null;

  const name = String(o.name || o.mpn || "");
  const brand =
    typeof o.brand === "object" && o.brand
      ? String((o.brand as { name?: string }).name || "")
      : String(o.brand || o.manufacturer || "");

  const parsed = parseName(name, brand);
  const year = Number(o.modelYear || o.vehicleModelDate || parsed.year) || new Date().getFullYear();
  const make = (parsed.make || brand || "Unknown").trim();
  const model = (parsed.model || "Model").trim();
  const trim = parsed.trim;

  const images = collectImages(o);
  const url = extractUrl(o, pageUrl);
  const vin = o.vehicleIdentificationNumber ? String(o.vehicleIdentificationNumber) : undefined;
  const stock = o.sku ? String(o.sku) : o.productID != null ? String(o.productID) : undefined;
  const mileage = extractMileage(o);

  return {
    year,
    make,
    model,
    trim,
    priceCents: price,
    mileage,
    vin,
    stock,
    exterior: typeof o.color === "string" ? o.color : parsed.color,
    body: typeof o.bodyType === "string" ? o.bodyType : undefined,
    description: typeof o.description === "string" ? o.description.slice(0, 800) : undefined,
    url,
    images,
  };
}

function extractPrice(o: Record<string, unknown>): number | null {
  const offers = o.offers;
  if (offers && typeof offers === "object") {
    const list = Array.isArray(offers) ? offers : [offers];
    for (const off of list) {
      if (!off || typeof off !== "object") continue;
      const p = (off as Record<string, unknown>).price;
      const n = coerceMoney(p);
      if (n != null) return n;
    }
  }
  return coerceMoney(o.price ?? o.askingPrice ?? o.internetPrice);
}

function coerceMoney(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v > 1_000_000 ? Math.round(v) : Math.round(v * 100);
  }
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return n > 1_000_000 ? Math.round(n) : Math.round(n * 100);
  }
  return null;
}

function extractMileage(o: Record<string, unknown>): number | undefined {
  const m = o.mileageFromOdometer ?? o.mileage ?? o.odometer;
  if (typeof m === "number") return Math.round(m);
  if (typeof m === "object" && m && "value" in (m as object)) {
    const v = Number((m as { value: unknown }).value);
    if (Number.isFinite(v)) return Math.round(v);
  }
  if (typeof m === "string") {
    const v = Number(m.replace(/[^0-9]/g, ""));
    if (Number.isFinite(v)) return v;
  }
  return undefined;
}

function collectImages(o: Record<string, unknown>): string[] {
  const imgs: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === "string" && /^https?:\/\//i.test(u)) imgs.push(u);
    if (typeof u === "object" && u && "url" in (u as object)) push((u as { url: unknown }).url);
  };
  push(o.image);
  if (Array.isArray(o.image)) o.image.forEach(push);
  if (Array.isArray(o.photos)) o.photos.forEach(push);
  return [...new Set(imgs)];
}

function extractUrl(o: Record<string, unknown>, pageUrl: string): string | undefined {
  const offers = o.offers;
  if (offers && typeof offers === "object" && !Array.isArray(offers)) {
    const u = (offers as Record<string, unknown>).url;
    if (typeof u === "string") {
      try {
        return new URL(u, pageUrl).toString();
      } catch {
        return u;
      }
    }
  }
  if (typeof o.url === "string") {
    try {
      return new URL(o.url, pageUrl).toString();
    } catch {
      return o.url;
    }
  }
  return undefined;
}

function parseName(name: string, brand: string): {
  year?: number;
  make?: string;
  model?: string;
  trim: string;
  color?: string;
} {
  const clean = name
    .replace(/\|\s*\*?Pre-?owned\*?.*/i, "")
    .replace(/[_-]/g, " ")
    .trim();
  const ym = clean.match(/^(20[12]\d)\s+(.+)$/i);
  let year: number | undefined;
  let rest = clean;
  if (ym) {
    year = Number(ym[1]);
    rest = ym[2]!.trim();
  }
  let make = brand;
  let modelPart = rest;
  if (brand && rest.toLowerCase().startsWith(brand.toLowerCase())) {
    modelPart = rest.slice(brand.length).trim();
  } else if (!make) {
    const parts = rest.split(/\s+/);
    if (/^(aston|land|rolls|alfa|mercedes)/i.test(parts[0] || "")) {
      make = parts.slice(0, 2).join(" ");
      modelPart = parts.slice(2).join(" ");
    } else {
      make = parts[0];
      modelPart = parts.slice(1).join(" ");
    }
  }
  const mp = modelPart.split(/\s+/).filter(Boolean);
  const model = mp[0] || "Model";
  const trim = mp.slice(1).join(" ");
  return { year, make: make || undefined, model, trim };
}

export function rawToSeedVehicles(dealerId: string, raw: RawListing[]): SeedVehicle[] {
  const deduped = dedupeRawListings(raw);
  return deduped.map((r) => {
    const fp = listingFingerprint(r);
    const external_id = fp
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);

    const photos = r.images.length ? r.images : [];
    const thumbnail = photos[0] || "";

    let listing_path = r.url || "/";
    try {
      if (listing_path.startsWith("http")) {
        /* keep full URL for absolute listings */
      }
    } catch {
      listing_path = "/";
    }

    return {
      external_id,
      dealership_id: dealerId,
      year: r.year,
      make: r.make,
      model: r.model,
      trim: r.trim,
      body_style: r.body || guessBody(r.model),
      exterior_color: r.exterior || "",
      interior_color: "",
      mileage: r.mileage ?? 0,
      price_cents: r.priceCents,
      vin: r.vin || "",
      stock_number: r.stock || external_id,
      description:
        r.description ||
        `${r.year} ${r.make} ${r.model} ${r.trim} · live partner inventory · CAD`.trim(),
      specs: {
        engine: "—",
        transmission: "—",
        drivetrain: "—",
        horsepower: "—",
        fuel: "—",
        seats: "—",
        doors: "—",
        source: "live",
      },
      thumbnail,
      photos,
      listing_path: r.url?.startsWith("http") ? r.url : listing_path,
    };
  });
}

function guessBody(model: string): string {
  const m = model.toLowerCase();
  if (/urus|dbx|cayenne|macan|bentayga|cullinan|range|defender|g.?63|gle|x[567]|q[578]|xm|purosangue/.test(m))
    return "SUV";
  if (/spider|spyder|volante|roadster|convertible|cabrio|targa/.test(m)) return "Convertible";
  if (/avant|wagon/.test(m)) return "Wagon";
  return "Coupe";
}
