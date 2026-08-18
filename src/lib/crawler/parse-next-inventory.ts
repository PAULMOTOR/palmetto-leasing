/**
 * Next.js dealer sites that embed inventory in __NEXT_DATA__ (e.g. YD Auto).
 * Skip sold / archived rows — YD embeds the full history (status 7 + sold_date).
 */
import { PREMIUM_MIN_CENTS, type SeedVehicle } from "@/lib/leasing/seed";

type Loose = Record<string, unknown>;

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function walkVehicleArrays(node: unknown, out: Loose[], depth = 0): void {
  if (depth > 10 || node == null) return;
  if (Array.isArray(node)) {
    if (
      node.length > 0 &&
      typeof node[0] === "object" &&
      node[0] &&
      (("sell_price" in (node[0] as Loose) && "Vehicle" in (node[0] as Loose)) ||
        ("sell_price" in (node[0] as Loose) && "cover_image" in (node[0] as Loose)))
    ) {
      out.push(...(node as Loose[]));
      return;
    }
    for (const n of node) walkVehicleArrays(n, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Loose)) walkVehicleArrays(v, out, depth + 1);
  }
}

function mediaUrl(path: string, origin: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const cdn = "https://cdn.dealeralchemist.com";
  if (path.startsWith("/")) {
    return `${cdn}${path}`;
  }
  return `${origin.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function isSoldOrHidden(row: Loose): boolean {
  if (row.sold_date) return true;
  if (row.is_deleted === 1 || row.is_deleted === true) return true;
  if (row.visible_on_site === false) return true;
  const status = num(row.vehicle_status);
  // YD: 4 = in stock, 6 = incoming, 7 = sold
  if (status === 7) return true;
  return false;
}

export function parseNextInventory(html: string, pageUrl: string, dealerId: string): SeedVehicle[] {
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nd?.[1]) return [];
  let json: unknown;
  try {
    json = JSON.parse(nd[1]);
  } catch {
    return [];
  }

  const rows: Loose[] = [];
  walkVehicleArrays(json, rows);
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return "https://ydautosales.com";
    }
  })();

  const out: SeedVehicle[] = [];
  for (const row of rows) {
    if (isSoldOrHidden(row)) continue;
    const priceCad = num(row.sell_price || row.cash_price || row.price);
    if (priceCad < 150_000) continue;
    const priceCents = Math.round(priceCad * 100);
    if (priceCents < PREMIUM_MIN_CENTS) continue;

    const veh = (row.Vehicle && typeof row.Vehicle === "object" ? row.Vehicle : {}) as Loose;
    const year = num(veh.model_year || veh.year || row.year) || new Date().getFullYear();
    const make = str(veh.make || row.make) || "Unknown";
    const model = str(veh.model || row.model) || "Model";
    const trim = str(veh.trim || row.trim);
    const vin = str(veh.vin_number || row.vin);
    const stock = str(row.stock_NO || row.stock);
    const mileage = num(row.odometer);

    const photos: string[] = [];
    const media = row.MidVDSMedia;
    if (Array.isArray(media)) {
      for (const m of media) {
        if (!m || typeof m !== "object") continue;
        const src = str((m as Loose).media_src || (m as Loose).thumbnail_src);
        const u = mediaUrl(src, origin);
        if (u && !photos.includes(u)) photos.push(u);
      }
    }
    const cover = mediaUrl(str(row.cover_image || row.thumbnail_cover_image), origin);
    if (cover && !photos.includes(cover)) photos.unshift(cover);

    const slug = `${year}-${make}-${model}-${row.id || stock}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 64);
    let listing = pageUrl;
    try {
      const host = new URL(pageUrl).origin;
      listing = `${host}/cars/${row.id || slug}`;
    } catch {
      /* keep */
    }

    out.push({
      external_id: `nx-${slug}`.slice(0, 64),
      dealership_id: dealerId,
      year,
      make,
      model,
      trim,
      body_style: str((veh.BodyStyle as Loose | undefined)?.name) || "Coupe",
      exterior_color: str((veh.exterior_color as Loose | undefined)?.name),
      interior_color: str((veh.interior_color as Loose | undefined)?.name),
      mileage,
      price_cents: priceCents,
      vin,
      stock_number: stock || slug,
      description: `${year} ${make} ${model}`.trim(),
      specs: {
        engine: str(veh.engine) || "—",
        transmission: str((veh.Transmission as Loose | undefined)?.name) || "—",
        drivetrain: str(veh.drive_type) || "—",
        horsepower: "—",
        fuel: str(veh.fuel_type) || "—",
        seats: "—",
        doors: veh.doors != null ? String(veh.doors) : "—",
        source: "next-data",
      },
      thumbnail: photos[0] || "/vehicles/top-porsche-911.jpg",
      photos,
      listing_path: listing,
    });
  }
  return out;
}
