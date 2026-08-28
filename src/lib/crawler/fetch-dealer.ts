/**
 * Live dealer inventory fetch.
 * Tries partner APIs → own-site parsers (JSON-LD / Next / HTML cards)
 * → paginated AutoTrader fallback when the site is 403 / captcha / empty.
 */
import {
  BASE_INVENTORY,
  PREMIUM_MIN_CENTS,
  type SeedVehicle,
} from "@/lib/leasing/seed";
import { parseVehiclesFromHtml, rawToSeedVehicles } from "./parse-vehicles";
import { fetchAutoTraderPaginated, isAutoTraderUrl, parseAutoTraderHtml } from "./parse-autotrader";
import { fetchSigmaVehicles } from "./parse-sigma";
import { fetchLeaseSniperVehicles, isLeaseSniperUrl } from "./parse-leasesniper";
import { fetchGclInventory, htmlCardsToVehicles } from "./parse-html-cards";
import { parseNextInventory } from "./parse-next-inventory";
import { fetchGrandTouringInventory } from "./parse-grand-touring";
import { fetchWindingRoadInventory } from "./parse-winding-road";
import { fetchMclarenMontrealInventory } from "./parse-mclaren-montreal";
import { fetchSm360Inventory } from "./parse-sm360";
import { fetchAanInventory } from "./parse-aan";
import { fetchDealerPage } from "./http";
import {
  expandInventoryUrls,
  isGclDealer,
  looksBlockedOrEmpty,
  resolveAutoTraderFallback,
} from "./partner-fallbacks";

export type FetchResult = {
  dealerId: string;
  source: "live" | "seed" | "mixed";
  items: SeedVehicle[];
  httpStatus?: number;
  notes: string[];
};

export type FetchDealerOpts = {
  name?: string;
  websiteUrl?: string;
};

export async function fetchDealerInventory(
  dealerId: string,
  inventoryUrl: string,
  opts?: FetchDealerOpts,
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

  const candidateUrls = expandInventoryUrls(inventoryUrl, opts?.websiteUrl);
  let ownSiteBlocked = false;

  if (/windingroad\.ca/i.test(inventoryUrl) || dealerId.includes("winding-road")) {
    try {
      const wr = await fetchWindingRoadInventory(dealerId);
      live = mergeVehicles(live, wr.items);
      notes.push(...wr.notes);
      if (live.length >= 1) {
        return { dealerId, source: "live", items: live, notes: [...notes, `LIVE Winding Road (${live.length})`] };
      }
    } catch (err) {
      notes.push(`Winding Road: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (/grandtouringautos\.com/i.test(inventoryUrl) || dealerId.includes("grand-touring")) {
    try {
      const gta = await fetchGrandTouringInventory(dealerId);
      live = mergeVehicles(live, gta.items);
      notes.push(...gta.notes);
      if (live.length >= 1) {
        return { dealerId, source: "live", items: live, notes: [...notes, `LIVE Grand Touring (${live.length})`] };
      }
    } catch (err) {
      notes.push(`Grand Touring: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (/mclarenmontreal\.com/i.test(inventoryUrl) || dealerId.includes("mclaren-montreal")) {
    try {
      const mm = await fetchMclarenMontrealInventory(dealerId);
      live = mergeVehicles(live, mm.items);
      notes.push(...mm.notes);
      if (live.length >= 1) {
        return { dealerId, source: "live", items: live, notes: [...notes, `LIVE McLaren Montreal (${live.length})`] };
      }
    } catch (err) {
      notes.push(`McLaren Montreal: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (/ferrariquebec\.com/i.test(inventoryUrl) || dealerId.includes("ferrari-quebec")) {
    try {
      const aan = await fetchAanInventory(dealerId, "https://ferrariquebec.com", "5178");
      live = mergeVehicles(live, aan.items);
      notes.push(...aan.notes);
      if (live.length >= 1) {
        return { dealerId, source: "live", items: live, notes: [...notes, `LIVE Ferrari Québec (${live.length})`] };
      }
    } catch (err) {
      notes.push(`Ferrari Québec: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (/groupelauzon\.com/i.test(inventoryUrl) || dealerId.includes("groupe-lauzon")) {
    try {
      const sm = await fetchSm360Inventory(dealerId, inventoryUrl);
      live = mergeVehicles(live, sm.items);
      notes.push(...sm.notes);
      if (live.length >= 1) {
        return { dealerId, source: "live", items: live, notes: [...notes, `LIVE Lauzon (${live.length})`] };
      }
    } catch (err) {
      notes.push(`Lauzon: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // GCL server-rendered cards + fragment pagination
  if (isGclDealer(dealerId, inventoryUrl) || candidateUrls.some((u) => /gclcars\.ca/i.test(u))) {
    try {
      const gcl = await fetchGclInventory(dealerId);
      live = mergeVehicles(live, gcl.items);
      notes.push(...gcl.notes);
    } catch (err) {
      notes.push(`GCL: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const url of candidateUrls) {
    if (isAutoTraderUrl(url)) {
      try {
        const at = await fetchAutoTraderPaginated(url, dealerId);
        live = mergeVehicles(live, at.items);
        notes.push(...at.notes);
      } catch (err) {
        notes.push(`AutoTrader: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }

    try {
      const page = await fetchDealerPage(url);
      httpStatus = page.status;
      if (looksBlockedOrEmpty(page.text, page.status)) {
        ownSiteBlocked = true;
        notes.push(`Own site blocked/empty (${page.status}) ${hostLabel(url)}`);
        continue;
      }

      const parsed = parseOwnSite(page.text, page.url || url, dealerId);
      live = mergeVehicles(live, parsed);
      notes.push(`${hostLabel(url)} parse: ${parsed.length} ≥ $150k`);
    } catch (err) {
      ownSiteBlocked = true;
      notes.push(`Fetch error ${hostLabel(url)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const atFallback = resolveAutoTraderFallback({
    dealerId,
    name: opts?.name,
    inventoryUrl,
    websiteUrl: opts?.websiteUrl,
  });
  const alreadyCrawledAt =
    atFallback != null &&
    candidateUrls.some((u) => isAutoTraderUrl(u) && u.includes(atFallback.replace(/\/$/, "").split("/").pop() || "___"));

  // Own site empty or blocked — page AutoTrader. Also merge AT for GCL
  // because fragment scan is capped and AT holds the $150k+ tail.
  const shouldAt =
    atFallback &&
    !alreadyCrawledAt &&
    (live.length === 0 || ownSiteBlocked || isGclDealer(dealerId, inventoryUrl));

  if (shouldAt && atFallback) {
    try {
      const at = await fetchAutoTraderPaginated(atFallback, dealerId);
      live = mergeVehicles(live, at.items);
      notes.push(...at.notes);
      notes.push(`AutoTrader fallback ${atFallback}`);
    } catch (err) {
      notes.push(`AutoTrader fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
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

function parseOwnSite(html: string, pageUrl: string, dealerId: string): SeedVehicle[] {
  const next = parseNextInventory(html, pageUrl, dealerId);
  const jsonld = rawToSeedVehicles(dealerId, parseVehiclesFromHtml(html, pageUrl));
  const cards = htmlCardsToVehicles(dealerId, html, pageUrl);
  // parseAutoTraderHtml is harmless if there is no NEXT listings array
  const at = isAutoTraderUrl(pageUrl) ? parseAutoTraderHtml(html, pageUrl, dealerId) : [];
  return mergeVehicles(next, jsonld, cards, at);
}

function mergeVehicles(...batches: SeedVehicle[][]): SeedVehicle[] {
  const seen = new Set<string>();
  const out: SeedVehicle[] = [];
  for (const batch of batches) {
    for (const v of batch) {
      const vin = v.vin && v.vin.length >= 8 ? `VIN:${v.vin.toUpperCase()}` : "";
      const stock = v.stock_number ? `STK:${v.dealership_id}:${v.stock_number.toUpperCase()}` : "";
      const soft =
        `${v.dealership_id}|${v.year}|${v.make}|${v.model}|${v.price_cents}|${v.mileage}`
          .toUpperCase()
          .replace(/\s+/g, "");
      const keys = [v.external_id, vin, stock, soft].filter(Boolean);
      if (keys.some((k) => seen.has(k))) continue;
      for (const k of keys) seen.add(k);
      out.push(v);
    }
  }
  return out;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}
