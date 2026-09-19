/**
 * Palmetto dealer token → this rooftop's CRM slug.
 * Never trust the URL slug alone — it must match the signed-in dealer.
 */
import { resolveDealerSlug, slugifyDealer } from "@/lib/crm/dealers";
import { DEALERS } from "@/lib/leasing/seed";

export function dealerIdFromToken(token: string): string {
  if (!token.startsWith("dealer:")) throw new Error("Sign in as a dealer");
  const id = token.slice("dealer:".length).trim();
  if (!id) throw new Error("Sign in as a dealer");
  return id;
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
};

export async function assertDealerDesk(token: string, urlSlug: string): Promise<DeskContext> {
  const dealerId = dealerIdFromToken(token);
  const seed = DEALERS.find((d) => d.id === dealerId);
  const resolved =
    (await resolveDealerSlug({ localSlug: dealerId, localName: seed?.name })) ||
    slugifyDealer(dealerId);
  if (!rooftopMatches({ dealerId, urlSlug, resolvedSlug: resolved })) {
    throw new Error("This desk belongs to another rooftop");
  }
  return {
    dealerId,
    slug: resolved,
    name: seed?.name || dealerId,
  };
}
