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
      images: img ? [img] : [],
    });
  }
  const items = rawToSeedVehicles(dealerId, raw).map((v) => ({
    ...v,
    specs: { ...v.specs, source: "grand-touring-api" },
  }));
  notes.push(`GTA API ${rows.length} rows → ${items.length} ≥$150k`);
  return { items, notes };
}
