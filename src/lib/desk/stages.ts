import type { DeskBucket } from "@/lib/desk/buckets";

/** Dealer-facing stages. CRM buckets still exist; Palmetto only paints these four. */
export const DESK_STAGES = ["quoted", "credit", "approved", "compliance"] as const;
export type DeskStage = (typeof DESK_STAGES)[number] | "lost";

export const DESK_STAGE_META: Record<
  Exclude<DeskStage, "lost">,
  { label: string; color: string }
> = {
  quoted: { label: "Quoted", color: "#c23b3b" },
  credit: { label: "Credit", color: "#e07a2f" },
  approved: { label: "Approved", color: "#2f8f4e" },
  compliance: { label: "Compliance", color: "#2f5fbf" },
};

export function deskStage(bucket: string): DeskStage {
  if (bucket === "lost") return "lost";
  if (bucket === "compliance_hold") return "compliance";
  if (bucket === "gsm_approved" || bucket === "in_book") return "approved";
  if (bucket === "app_ids" || bucket === "credit_review" || bucket === "docs_missing") return "credit";
  return "quoted";
}

export function stageBuckets(stage: DeskStage): DeskBucket[] {
  if (stage === "lost") return ["lost"];
  if (stage === "compliance") return ["compliance_hold"];
  if (stage === "approved") return ["gsm_approved", "in_book"];
  if (stage === "credit") return ["app_ids", "credit_review", "docs_missing"];
  return ["quote_sent", "started"];
}

export function canDeleteDeal(bucket: string): boolean {
  const stage = deskStage(bucket);
  return stage === "quoted" || stage === "lost";
}
