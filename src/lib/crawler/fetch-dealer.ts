/**
 * Live dealer inventory fetch — real JSON-LD / Vehicle schema.
 * Seed fallback only when the partner site returns nothing usable.
 */
import {
  BASE_INVENTORY,
  PREMIUM_MIN_CENTS,
  type SeedVehicle,
} from "@/lib/leasing/seed";
import { parseVehiclesFromHtml, rawToSeedVehicles } from "./parse-vehicles";

const USER_AGENT =
  "Mozilla/5.0 (compatible; PalmettoLeasingBot/2.0; +https://palmettoleasing.com; inventory aggregator)";

export type FetchResult = {
  dealerId: string;
  source: "live" | "seed" | "mixed";
  items: SeedVehicle[];
  httpStatus?: number;
  notes: string[];
};

export async function fetchDealerInventory(
  dealerId: string,
  inventoryUrl: string,
): Promise<FetchResult> {
  const notes: string[] = [];
  const seed = BASE_INVENTORY.filter(
    (v) => v.dealership_id === dealerId && v.price_cents >= PREMIUM_MIN_CENTS,
  );

  let live: SeedVehicle[] = [];
  let httpStatus: number | undefined;

  try {
    const res = await fetch(inventoryUrl, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-CA,en;q=0.9",
      },
      signal: AbortSignal.timeout(25_000),
      redirect: "follow",
    });
    httpStatus = res.status;
    const text = await res.text();

    if (!res.ok) {
      notes.push(`HTTP ${res.status}`);
    } else {
      const raw = parseVehiclesFromHtml(text, res.url || inventoryUrl);
      live = rawToSeedVehicles(dealerId, raw);
      notes.push(`JSON-LD/live parse: ${raw.length} raw → ${live.length} ≥ $150k`);
    }
  } catch (err) {
    notes.push(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Live wins when we have a real haul. Seed only fills empty dealers (blocked sites).
  if (live.length >= 1) {
    return {
      dealerId,
      source: "live",
      items: live,
      httpStatus,
      notes: [...notes, `LIVE inventory locked (${live.length} units) — no seed mix`],
    };
  }

  return {
    dealerId,
    source: "seed",
    items: seed,
    httpStatus,
    notes: [
      ...notes,
      `No live ≥$150k parse — temporary seed (${seed.length}) until inventory URL is fixed`,
    ],
  };
}
