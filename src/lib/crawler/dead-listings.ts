/**
 * A 404/410 (or sold VDP copy) means the car is gone — drop it from Palmetto.
 * 403/429/5xx are not sold; leave those for the next crawl.
 */
import type { getSql } from "@/lib/db";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SOLD_COPY =
  /no longer available|listing (has been )?removed|this vehicle (has been )?sold|vehicle has sold|n['’]est plus disponible|annonce introuvable|we couldn['’]t find|vehicle not found|this listing is (now )?closed|sold out of inventory/i;

export function listingProbeLooksDead(status: number, finalUrl: string, originalUrl: string, html = ""): boolean {
  if (status === 404 || status === 410 || status === 451) return true;
  if (status !== 200) return false;
  if (redirectedOffListing(originalUrl, finalUrl)) return true;
  const sample = html.slice(0, 80_000);
  if (SOLD_COPY.test(sample) && !/itemprop=["']Vehicle["']|application\/ld\+json[^>]{0,80}Vehicle/i.test(sample)) {
    return true;
  }
  return false;
}

function redirectedOffListing(from: string, to: string): boolean {
  try {
    const a = new URL(from);
    const b = new URL(to);
    if (a.hostname.replace(/^www\./, "") !== b.hostname.replace(/^www\./, "")) return false;
    const ap = a.pathname.replace(/\/+$/, "").toLowerCase();
    const bp = b.pathname.replace(/\/+$/, "").toLowerCase();
    if (ap === bp) return false;
    if (bp === "" || bp === "/" || /\/(inventory|used-cars|vehicles|search|dealers?)\/?$/i.test(bp)) {
      return ap.length > 12;
    }
    return false;
  } catch {
    return false;
  }
}

export async function probeListingUrl(url: string): Promise<"live" | "dead" | "unknown"> {
  if (!url?.startsWith("http")) return "unknown";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-CA,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 403 || res.status === 401 || res.status === 429 || res.status >= 500) {
      return "unknown";
    }
    let html = "";
    if (res.status === 200) {
      html = await res.text();
    }
    if (listingProbeLooksDead(res.status, res.url || url, url, html)) return "dead";
    if (res.ok) return "live";
    return "unknown";
  } catch {
    return "unknown";
  }
}

type Sql = Awaited<ReturnType<typeof getSql>>;

export async function sweepDeadListings(
  sql: Sql,
  opts?: { limit?: number; concurrency?: number },
): Promise<{ checked: number; removed: number; ids: string[] }> {
  const limit = opts?.limit ?? 80;
  const concurrency = Math.max(1, opts?.concurrency ?? 6);
  const rows = await sql<{ id: string; dealer_listing_url: string }>`
    select id, dealer_listing_url from vehicles
    where status = 'active' and dealer_listing_url like 'http%'
    order by last_seen_at asc
    limit ${limit}
  `;
  const deadIds: string[] = [];
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      if (!row) break;
      const verdict = await probeListingUrl(row.dealer_listing_url);
      if (verdict === "dead") deadIds.push(row.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
  for (const id of deadIds) {
    await sql`delete from vehicles where id = ${id}`;
  }
  return { checked: rows.length, removed: deadIds.length, ids: deadIds };
}

export async function deleteVehicleIfListingDead(
  sql: Sql,
  vehicleId: string,
  listingUrl: string,
  httpSource?: string,
): Promise<boolean> {
  const statusMatch = httpSource?.match(/^http-(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const deadFromGallery = status === 404 || status === 410 || status === 451;
  const verdict = deadFromGallery ? "dead" : await probeListingUrl(listingUrl);
  if (verdict !== "dead") return false;
  await sql`delete from vehicles where id = ${vehicleId}`;
  return true;
}
