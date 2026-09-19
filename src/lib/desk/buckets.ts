/** CRM file buckets — do not invent others. */
export const DESK_BUCKETS = [
  "started",
  "quote_sent",
  "app_ids",
  "credit_review",
  "docs_missing",
  "gsm_approved",
  "compliance_hold",
  "in_book",
  "lost",
] as const;

export type DeskBucket = (typeof DESK_BUCKETS)[number];

export const DESK_BUCKET_LABELS: Record<DeskBucket, string> = {
  started: "started",
  quote_sent: "quote_sent",
  app_ids: "app_ids",
  credit_review: "credit_review",
  docs_missing: "docs_missing",
  gsm_approved: "gsm_approved",
  compliance_hold: "compliance_hold",
  in_book: "in_book",
  lost: "lost",
};

export function isDeskBucket(v: unknown): v is DeskBucket {
  return typeof v === "string" && (DESK_BUCKETS as readonly string[]).includes(v);
}

export function bucketLabel(bucket: string, fromCrm?: string): string {
  if (fromCrm && fromCrm.trim()) return fromCrm.trim();
  if (isDeskBucket(bucket)) return DESK_BUCKET_LABELS[bucket];
  return bucket;
}

export function emptyGauges(): Record<DeskBucket, number> {
  return {
    started: 0,
    quote_sent: 0,
    app_ids: 0,
    credit_review: 0,
    docs_missing: 0,
    gsm_approved: 0,
    compliance_hold: 0,
    in_book: 0,
    lost: 0,
  };
}

export function tallyGauges(deals: { bucket: string }[]): Record<DeskBucket, number> {
  const g = emptyGauges();
  for (const d of deals) {
    if (isDeskBucket(d.bucket)) g[d.bucket] += 1;
  }
  return g;
}
