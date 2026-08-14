/**
 * Live dealer inventory fetch — JSON-LD / AutoTrader / partner APIs.
 * Seed fallback only when the partner site returns nothing usable.
 */
import {
  BASE_INVENTORY,
  PREMIUM_MIN_CENTS,
  type SeedVehicle,
} from "@/lib/leasing/seed";
import { parseVehiclesFromHtml, rawToSeedVehicles } from "./parse-vehicles";
import { isAutoTraderUrl, parseAutoTraderHtml } from "./parse-autotrader";
import { fetchSigmaVehicles } from "./parse-sigma";
import { fetchLeaseSniperVehicles, isLeaseSniperUrl } from "./parse-leasesniper";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

  // Lease Sniper WordPress inventory (no JSON-LD Vehicle nodes)
  if (isLeaseSniperUrl(inventoryUrl) || /lease[-_]?sniper/i.test(dealerId)) {
    try {
      const ls = await fetchLeaseSniperVehicles(dealerId);
      live = ls.items;
      notes.push(...ls.notes);
      if (live.length >= 1) {
        return {
          dealerId,
          source: "live",
          items: live,
          notes: [...notes, `LIVE Lease Sniper (${live.length} ≥ $150k)`],
        };
      }
    } catch (err) {
      notes.push(`Lease Sniper: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Sigma custom API (SPA — no JSON-LD)
  if (/sigmaautomotive\.ca/i.test(inventoryUrl) || dealerId.includes("sigma")) {
    try {
      const sigma = await fetchSigmaVehicles(dealerId);
      live = sigma.items;
      notes.push(...sigma.notes);
      if (live.length >= 1) {
        return {
          dealerId,
          source: "live",
          items: live,
          notes: [...notes, `LIVE Sigma API (${live.length} ≥ $150k)`],
        };
      }
    } catch (err) {
      notes.push(`Sigma API: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const res = await fetch(inventoryUrl, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-CA,en;q=0.9",
      },
      signal: AbortSignal.timeout(30_000),
      redirect: "follow",
    });
    httpStatus = res.status;
    const text = await res.text();

    if (!res.ok) {
      notes.push(`HTTP ${res.status}`);
    } else if (isAutoTraderUrl(inventoryUrl) || isAutoTraderUrl(res.url)) {
      live = parseAutoTraderHtml(text, res.url || inventoryUrl, dealerId);
      notes.push(`AutoTrader parse: ${live.length} ≥ $150k from dealer page`);
    } else {
      const raw = parseVehiclesFromHtml(text, res.url || inventoryUrl);
      live = rawToSeedVehicles(dealerId, raw);
      notes.push(`JSON-LD/live parse: ${raw.length} raw → ${live.length} ≥ $150k`);
    }
  } catch (err) {
    notes.push(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

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
