/**
 * When a partner site is Cloudflare / captcha / JS-only, crawl their
 * AutoTrader.ca dealer page instead. IDs are public AutoTrader dealer numbers.
 *
 * VFC Auto Group lists on AutoTrader as "VENUS FINE CARS" (47944355) —
 * descriptions say "VFC Auto Group" and cars sit at 7582 Yonge / 1100 Finch.
 */
export const AUTOTRADER_BY_DEALER_ID: Record<string, string> = {
  "faraz-auto-sales": "47944939",
  faraz: "47944939",
  gcl: "47945926",
  "great-canadian-leasing": "47945926",
  "gta-motorcars": "47945027",
  "gta-motor-cars": "47945027",
  "rev-motors": "47943315",
  revmotors: "47943315",
  "yd-auto-sales": "47944279",
  "yd-auto": "47944279",
  "vin-auto": "47943552",
  vinauto: "47943552",
  "vfc-auto": "47944355",
  "vfc-auto-group": "47944355",
  vfc: "47944355",
};

export const AUTOTRADER_BY_HOST: Record<string, string> = {
  "farazautosalesltd.ca": "47944939",
  "farazautosales.com": "47944939",
  "gclcars.ca": "47945926",
  "gtamotorcars.com": "47945027",
  "revmotors.ca": "47943315",
  "ydautosales.com": "47944279",
  "vinauto.ca": "47943552",
  "vfcautogroup.ca": "47944355",
};

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function autotraderDealerUrl(dealerNumericId: string): string {
  return `https://www.autotrader.ca/dealers/${dealerNumericId}`;
}

export function resolveAutoTraderFallback(opts: {
  dealerId: string;
  name?: string;
  inventoryUrl?: string;
  websiteUrl?: string;
}): string | null {
  const id = (opts.dealerId || "").toLowerCase();
  if (AUTOTRADER_BY_DEALER_ID[id]) return autotraderDealerUrl(AUTOTRADER_BY_DEALER_ID[id]);

  for (const [key, num] of Object.entries(AUTOTRADER_BY_DEALER_ID)) {
    if (key.length < 3) continue;
    if (id.includes(key) || key.includes(id)) return autotraderDealerUrl(num);
  }

  const name = (opts.name || "").toLowerCase();
  if (/faraz/.test(name)) return autotraderDealerUrl("47944939");
  if (/\bgcl\b|great canadian leasing/.test(name)) return autotraderDealerUrl("47945926");
  if (/gta\s*motor/.test(name)) return autotraderDealerUrl("47945027");
  if (/rev\s*motor/.test(name)) return autotraderDealerUrl("47943315");
  if (/\byd\b/.test(name)) return autotraderDealerUrl("47944279");
  if (/\bvin\s*auto/.test(name)) return autotraderDealerUrl("47943552");
  if (/\bvfc\b|venus fine/.test(name)) return autotraderDealerUrl("47944355");

  for (const url of [opts.inventoryUrl, opts.websiteUrl]) {
    const host = hostOf(url || "");
    if (host && AUTOTRADER_BY_HOST[host]) return autotraderDealerUrl(AUTOTRADER_BY_HOST[host]);
    const m = (url || "").match(/autotrader\.ca\/dealers\/(\d+)/i);
    if (m) return autotraderDealerUrl(m[1]!);
  }
  return null;
}

/** If admin pasted a homepage, hop to the real inventory path when known. */
export function expandInventoryUrls(inventoryUrl: string, websiteUrl?: string): string[] {
  const urls: string[] = [];
  const push = (u?: string) => {
    if (!u) return;
    const t = u.trim();
    if (t && !urls.includes(t)) urls.push(t);
  };
  push(inventoryUrl);
  push(websiteUrl);

  const extras: string[] = [];
  for (const raw of [...urls]) {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      const path = u.pathname.replace(/\/+$/, "") || "/";
      if (host === "gclcars.ca" && path === "/") extras.push("https://gclcars.ca/inventory");
      if (host === "farazautosalesltd.ca" && !/vehicles/.test(path)) {
        extras.push("https://www.farazautosalesltd.ca/vehicles/used/");
      }
      if (host === "gtamotorcars.com" && !/inventory/.test(path)) {
        extras.push("https://www.gtamotorcars.com/inventory/");
      }
      if (host === "revmotors.ca" && !/inventory/.test(path)) {
        extras.push("https://www.revmotors.ca/used-inventory/");
      }
      if (host === "vfcautogroup.ca" && !/used/.test(path)) {
        extras.push("https://www.vfcautogroup.ca/used-cars");
      }
      if (host === "ydautosales.com" && !/cars/.test(path)) {
        extras.push("https://ydautosales.com/cars");
      }
      if (host === "vinauto.ca" && path === "/") {
        extras.push("https://www.vinauto.ca/used-cars");
        extras.push("https://www.vinauto.ca/inventory");
      }
    } catch {
      /* keep original */
    }
  }
  for (const e of extras) push(e);
  return urls;
}

export function looksBlockedOrEmpty(html: string, status?: number): boolean {
  if (status && (status >= 400 || status === 202)) return true;
  const t = (html || "").trim();
  if (t.length < 800) return true;
  if (/sgcaptcha|cf-challenge|just a moment|access denied|cf-mitigated|attention required/i.test(t)) return true;
  return false;
}

export function isGclDealer(dealerId: string, url?: string): boolean {
  const id = (dealerId || "").toLowerCase();
  if (id === "gcl" || id.includes("gcl") || /great-canadian/.test(id)) return true;
  return /gclcars\.ca/i.test(url || "");
}

export function isYdDealer(dealerId: string, url?: string): boolean {
  const id = (dealerId || "").toLowerCase();
  if (id.includes("yd-auto") || id === "yd") return true;
  return /ydautosales\.com/i.test(url || "");
}
