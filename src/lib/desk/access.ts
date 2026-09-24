/**
 * Palmetto dealer token → this rooftop's CRM slug.
 * Never trust the URL slug alone — it must match the signed-in dealer.
 */
import { resolveDealerSlug, slugifyDealer } from "@/lib/crm/dealers";
import { displayDealerName } from "@/lib/leasing/dealer-name";
import { DEALERS } from "@/lib/leasing/seed";
import { loadDealerUser, parseDealerToken, type DealerUser } from "@/lib/desk/users";

export function dealerIdFromToken(token: string): string {
  return parseDealerToken(token).dealerId;
}

/** URL slug is this rooftop only when it matches the Palmetto id or the CRM slug. */
export function rooftopMatches(opts: {
  dealerId: string;
  urlSlug: string;
  resolvedSlug: string;
}): boolean {
  const url = slugifyDealer(opts.urlSlug);
  if (!url) return false;
  return url === slugifyDealer(opts.dealerId) || url === slugifyDealer(opts.resolvedSlug);
}

export type DeskContext = {
  dealerId: string;
  slug: string;
  name: string;
  province: string;
  user: DealerUser | null;
};

export async function assertDealerDesk(token: string, urlSlug: string): Promise<DeskContext> {
  const { dealerId, userId } = parseDealerToken(token);
  const seed = DEALERS.find((d) => d.id === dealerId);
  const resolved =
    (await resolveDealerSlug({ localSlug: dealerId, localName: seed?.name })) ||
    slugifyDealer(dealerId);
  if (!rooftopMatches({ dealerId, urlSlug, resolvedSlug: resolved })) {
    throw new Error("This desk belongs to another rooftop");
  }
  const user = userId ? await loadDealerUser(userId) : null;
  if (userId && (!user || user.dealershipId !== dealerId)) {
    throw new Error("Sign in as a person at this rooftop");
  }
  let name = seed?.name || "";
  let province = seed?.province || "";
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ name: string; province: string }>`
      select name, coalesce(province, '') as province
      from dealerships where id = ${dealerId} limit 1
    `;
    if (rows[0]?.name?.trim()) name = rows[0].name.trim();
    if (rows[0]?.province?.trim()) province = rows[0].province.trim();
  } catch {
    /* seed name is enough */
  }
  return {
    dealerId,
    slug: resolved,
    name: displayDealerName(name || dealerId),
    province,
    user,
  };
}