/**
 * Palmetto captures only. Dealer status lives in the CRM.
 * GET {CRM_HANDOFF_URL}?status returns the slugs CRM will accept.
 */

export type CrmDealer = {
  slug: string;
  name: string;
  kind?: string;
};

type StatusBody = {
  dealers?: Array<{ slug?: string; name?: string; kind?: string }>;
};

let cache: { at: number; dealers: CrmDealer[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

export function slugifyDealer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export async function fetchCrmDealers(): Promise<CrmDealer[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.dealers;
  const url = process.env.CRM_HANDOFF_URL?.trim();
  const secret = process.env.CRM_HANDOFF_SECRET?.trim();
  if (!url) return [];
  try {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}status`, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return cache?.dealers || [];
    const body = (await res.json().catch(() => ({}))) as StatusBody;
    const dealers = (body.dealers || [])
      .map((d) => ({
        slug: slugifyDealer(String(d.slug || "")),
        name: String(d.name || "").trim(),
        kind: d.kind ? String(d.kind) : undefined,
      }))
      .filter((d) => d.slug);
    cache = { at: Date.now(), dealers };
    return dealers;
  } catch {
    return cache?.dealers || [];
  }
}

/** Prefer a CRM-known slug; otherwise keep Palmetto's dealership id. */
export async function resolveDealerSlug(opts: {
  localSlug?: string | null;
  localName?: string | null;
}): Promise<string | undefined> {
  const local = slugifyDealer(opts.localSlug || "") || slugifyDealer(opts.localName || "");
  if (!local) return undefined;
  const crm = await fetchCrmDealers();
  if (!crm.length) return local;
  const name = (opts.localName || "").trim().toLowerCase();
  const hit =
    crm.find((d) => d.slug === local) ||
    crm.find((d) => name && d.name.toLowerCase() === name) ||
    crm.find((d) => slugifyDealer(d.name) === local);
  return hit?.slug || local;
}
