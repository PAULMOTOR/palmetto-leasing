/**
 * Paint one rooftop per pass (3 tiles). Never round-robin across dealers —
 * that leaves every store half-finished and burns the budget on unreadable
 * AutoTrader crops.
 */
export function pickOneDealerImagineBatch<T extends { dealership_id: string }>(
  rows: T[],
  limit: number,
  preferDealer?: string,
): T[] {
  const cap = Math.max(0, limit);
  if (!rows.length || cap === 0) return [];
  const queues = new Map<string, T[]>();
  for (const row of rows) {
    const id = (row.dealership_id || "").trim();
    if (!id) continue;
    const list = queues.get(id) || [];
    list.push(row);
    queues.set(id, list);
  }
  if (!queues.size) return [];
  const keys = [...queues.keys()].sort();
  let dealer = keys[0]!;
  const prefer = (preferDealer || "").trim();
  if (prefer && (queues.get(prefer)?.length || 0) > 0) {
    dealer = prefer;
  } else if (prefer) {
    dealer = keys.find((k) => k > prefer) || keys[0]!;
  }
  return (queues.get(dealer) || []).slice(0, cap);
}

export const IMAGINE_SPEC_KEYS = [
  "imagineRev",
  "imagineQa",
  "imagineQaFails",
  "imagineSkip",
] as const;

/** Crawl listing specs replace each run — keep Imagine progress on the row. */
export function mergeListingSpecs(
  previous: Record<string, string | undefined> | undefined,
  incoming: Record<string, string | undefined> | undefined,
  opts?: { resetSkip?: boolean },
): Record<string, string | undefined> {
  const next: Record<string, string | undefined> = { ...(incoming || {}) };
  const prev = previous || {};
  for (const key of IMAGINE_SPEC_KEYS) {
    if (opts?.resetSkip && (key === "imagineSkip" || key === "imagineQaFails")) continue;
    if (prev[key]) next[key] = prev[key];
  }
  return next;
}
