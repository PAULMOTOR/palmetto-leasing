/**
 * Lease Sniper (leasesniper.ca) — WordPress inventory, no JSON-LD vehicles.
 * List pages: /our-inventory/ and /our-inventory/page/N/
 * Detail pages: /leaselisting/{slug}/
 */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const MAKES = [
  "Mercedes-Benz",
  "Land Rover",
  "Range Rover",
  "Aston Martin",
  "Rolls-Royce",
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
];

export function isLeaseSniperUrl(url: string): boolean {
  try {
    return /leasesniper\.ca$/i.test(new URL(url).hostname.replace(/^www\./, ""));
  } catch {
    return /leasesniper\.ca/i.test(url);
  }
}

function inventoryIndexUrl(): string {
  return "https://leasesniper.ca/our-inventory/";
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-CA,en;q=0.9",
    },
    signal: AbortSignal.timeout(25_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Lease Sniper HTTP ${res.status} for ${url}`);
  return res.text();
}

function parsePriceCents(block: string): number {
  const m = block.match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/);
  if (!m) return 0;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseTitle(title: string): { year: number; make: string; model: string; trim: string } {
  const clean = title.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const ym = clean.match(/^(\d{4})\s+(.+)$/);
  const year = ym ? Number(ym[1]) : new Date().getFullYear();
  const rest = ym ? ym[2]! : clean;
  const make = MAKES.find((mk) => rest.toLowerCase().startsWith(mk.toLowerCase())) || rest.split(/\s+/)[0] || "Unknown";
  const after = rest.slice(make.length).trim();
  const bits = after.split(/\s+/).filter(Boolean);
  return {
    year,
    make,
    model: bits[0] || "Model",
    trim: bits.slice(1).join(" "),
  };
}

function parseCards(html: string): {
  slug: string;
  url: string;
  title: string;
  priceCents: number;
  mileage: number;
  body: string;
  engine: string;
  thumb: string;
}[] {
  const chunks = html.split(/class="p5also-one"/).slice(1);
  const out: {
    slug: string;
    url: string;
    title: string;
    priceCents: number;
    mileage: number;
    body: string;
    engine: string;
    thumb: string;
  }[] = [];

  for (const chunk of chunks) {
    if (/overlay-listing/i.test(chunk) || />\s*Sold\s*</i.test(chunk)) continue;
    const href = chunk.match(/href="(https?:\/\/[^"]*\/leaselisting\/([^"/]+)\/?)"/i);
    if (!href) continue;
    const url = href[1]!;
    const slug = decodeURIComponent(href[2]!);
    const title =
      chunk.match(/deal-one-heading[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
      chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
      slug.replace(/-/g, " ");
    if (/^sold$/i.test(title)) continue;
    const priceCents = parsePriceCents(chunk);
    const km = chunk.match(/Current Mileage[\s\S]*?<h4[^>]*>\s*([0-9,]+)\s*km/i);
    const mileage = km ? Number(km[1]!.replace(/,/g, "")) || 0 : 0;
    const body = chunk.match(/Body type[\s\S]*?<h4[^>]*>\s*([^<]+)/i)?.[1]?.trim() || "";
    const engine = chunk.match(/Engine[\s\S]*?<h4[^>]*>\s*([^<]+)/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
    const bg = chunk.match(/background-image:\s*url\((['"]?)(https?:\/\/[^'")]+)\1\)/i);
    const thumb = bg?.[2] || "";
    out.push({ slug, url, title, priceCents, mileage, body, engine, thumb });
  }
  return out;
}

function isSniperListingPhoto(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\/wp-content\/themes\//i.test(url)) return false;
  if (/\.png(\?|$)/i.test(url)) return false;
  if (!/\/wp-content\/uploads\//i.test(url)) return false;
  return /\.(jpe?g|webp)(\?|$)/i.test(url);
}

export function leaseSniperSlugFromUrl(url: string): string | null {
  const m = url.match(/\/leaselisting\/([^/?#]+)\/?/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return m[1]!;
  }
}

/**
 * Photos of THIS car only — WP media attached to the listing.
 * Avoids theme icons and the related-inventory strip of other cars on the VDP.
 */
export async function fetchLeaseSniperListingPhotos(listingUrlOrSlug: string): Promise<string[]> {
  const slug = leaseSniperSlugFromUrl(listingUrlOrSlug) || listingUrlOrSlug.replace(/\/$/, "").split("/").pop() || "";
  if (!slug) return [];
  const photos: string[] = [];
  const push = (u: string) => {
    const url = u.split("?")[0]!;
    if (!isSniperListingPhoto(url) || photos.includes(url)) return;
    photos.push(url);
  };
  try {
    const res = await fetch(
      `https://leasesniper.ca/wp-json/wp/v2/leaselisting?slug=${encodeURIComponent(slug)}&per_page=1`,
      {
        headers: { accept: "application/json", "user-agent": UA },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return photos;
    const rows = (await res.json()) as { id?: number; featured_media?: number }[];
    const id = rows[0]?.id;
    const featuredId = rows[0]?.featured_media;
    if (!id) return photos;

    if (featuredId) {
      try {
        const feat = await fetch(`https://leasesniper.ca/wp-json/wp/v2/media/${featuredId}`, {
          headers: { accept: "application/json", "user-agent": UA },
          signal: AbortSignal.timeout(10_000),
        });
        if (feat.ok) {
          const body = (await feat.json()) as { source_url?: string };
          if (body.source_url) push(body.source_url);
        }
      } catch {
        /* media parent still runs */
      }
    }

    const mediaRes = await fetch(
      `https://leasesniper.ca/wp-json/wp/v2/media?parent=${id}&per_page=40`,
      {
        headers: { accept: "application/json", "user-agent": UA },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (mediaRes.ok) {
      const media = (await mediaRes.json()) as { source_url?: string }[];
      for (const m of media) {
        if (m.source_url) push(m.source_url);
      }
    }
  } catch {
    /* empty — caller may have the card thumb */
  }
  return photos.slice(0, 16);
}

async function extraPhotos(slug: string, featured: string): Promise<string[]> {
  const fromWp = await fetchLeaseSniperListingPhotos(slug);
  const photos: string[] = [];
  const push = (u: string) => {
    const url = (u || "").split("?")[0]!;
    if (!url || photos.includes(url)) return;
    if (featured && url === featured.split("?")[0]) {
      photos.unshift(url);
      return;
    }
    if (isSniperListingPhoto(url) || url === featured) photos.push(url);
  };
  if (featured) push(featured);
  for (const u of fromWp) push(u);
  return photos.slice(0, 16);
}

export async function fetchLeaseSniperVehicles(dealerId: string): Promise<{
  items: SeedVehicle[];
  notes: string[];
}> {
  const notes: string[] = [];
  const seen = new Set<string>();
  const cards: ReturnType<typeof parseCards> = [];

  for (let page = 1; page <= 8; page++) {
    const url = page === 1 ? inventoryIndexUrl() : `https://leasesniper.ca/our-inventory/page/${page}/`;
    try {
      const html = await fetchHtml(url);
      const rawCount = html.split(/class="p5also-one"/).length - 1;
      const found = parseCards(html);
      notes.push(`Lease Sniper page ${page}: ${found.length} available / ${rawCount} cards`);
      if (rawCount === 0) break;
      for (const c of found) {
        if (seen.has(c.slug)) continue;
        seen.add(c.slug);
        cards.push(c);
      }
      if (rawCount < 8) break;
    } catch (err) {
      notes.push(`Lease Sniper page ${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  const premium = cards.filter((c) => c.priceCents >= PREMIUM_MIN_CENTS);
  notes.push(`Lease Sniper cards ${cards.length} · ≥$150k ${premium.length}`);

  const items: SeedVehicle[] = [];
  // Gallery extras in small parallel batches
  for (let i = 0; i < premium.length; i += 4) {
    const batch = premium.slice(i, i + 4);
    const photosets = await Promise.all(batch.map((c) => extraPhotos(c.slug, c.thumb)));
    batch.forEach((c, idx) => {
      const parsed = parseTitle(c.title);
      const photos = photosets[idx] || (c.thumb ? [c.thumb] : []);
      items.push({
        external_id: `ls-${c.slug}`.slice(0, 64),
        dealership_id: dealerId,
        year: parsed.year,
        make: parsed.make,
        model: parsed.model,
        trim: parsed.trim,
        body_style: c.body || "Coupe",
        exterior_color: "",
        interior_color: "",
        mileage: c.mileage,
        price_cents: c.priceCents,
        vin: "",
        stock_number: c.slug,
        description: c.title,
        specs: {
          engine: c.engine || "—",
          transmission: "—",
          drivetrain: "—",
          horsepower: "—",
          fuel: "—",
          seats: "—",
          doors: "—",
          source: "leasesniper",
        },
        thumbnail: photos[0] || "/vehicles/top-porsche-911.jpg",
        photos,
        listing_path: c.url,
      });
    });
  }

  notes.push(`Lease Sniper ≥ $150k live: ${items.length}`);
  return { items, notes };
}
