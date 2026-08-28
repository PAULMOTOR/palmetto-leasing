/** SM360 dealer sites (Groupe Lauzon) — JSON-LD ItemList, paginated. */
import { type SeedVehicle } from "@/lib/leasing/seed";
import { fetchDealerPage } from "./http";
import { parseVehiclesFromHtml, rawToSeedVehicles } from "./parse-vehicles";

export async function fetchSm360Inventory(
  dealerId: string,
  inventoryUrl: string,
): Promise<{ items: SeedVehicle[]; notes: string[] }> {
  const notes: string[] = [];
  const seen = new Set<string>();
  const items: SeedVehicle[] = [];
  const origin = (() => {
    try {
      return new URL(inventoryUrl);
    } catch {
      return new URL("https://www.groupelauzon.com/en/used-inventory");
    }
  })();

  const maxPages = 16;
  for (let page = 1; page <= maxPages; page++) {
    const u = new URL(origin.href);
    if (page > 1) u.searchParams.set("page", String(page));
    try {
      const res = await fetchDealerPage(u.toString());
      if (res.status >= 400) {
        notes.push(`SM360 p${page} HTTP ${res.status}`);
        break;
      }
      const batch = rawToSeedVehicles(dealerId, parseVehiclesFromHtml(res.text, res.url)).map(
        (v) => ({ ...v, specs: { ...v.specs, source: "sm360" } }),
      );
      let added = 0;
      for (const v of batch) {
        const key = v.external_id;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(v);
        added += 1;
      }
      notes.push(`SM360 p${page}: ${batch.length} ≥$150k (+${added})`);
      if (page > 1 && added === 0) break;
      if (!/page=\d+/.test(res.text) && page === 1 && batch.length < 8) break;
    } catch (err) {
      notes.push(`SM360 p${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }
  notes.push(`SM360 ≥$150k live: ${items.length}`);
  return { items, notes };
}
