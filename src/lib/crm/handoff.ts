/**
 * Server-side handoff to the separate CRM Vercel project.
 * Never embeds CRM database credentials here.
 */
import type { LeaseQuote } from "@/lib/leasing/calc";

export type HandoffPayload = {
  type: "lease_application" | "lease_quote";
  vehicleId: string;
  vehicleLabel: string;
  dealerName: string;
  priceCents: number;
  downPaymentCents: number;
  residualCents: number;
  termMonths: number;
  monthlyPaymentCents: number;
  baseInterestRate: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
  application?: Record<string, unknown>;
  source: string;
  site: string;
  createdAt: string;
};

export type HandoffResult = {
  ok: boolean;
  queued: boolean;
  referenceId: string;
  message: string;
};

export async function handoffLeaseToCrm(input: {
  vehicleId: string;
  vehicleLabel: string;
  dealerName: string;
  quote: LeaseQuote;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  source?: string;
  application?: Record<string, unknown>;
}): Promise<HandoffResult> {
  const referenceId = `pml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const site =
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.VITE_PUBLIC_SITE_URL?.trim() ||
    "https://palmettoleasing.com";

  const payload: HandoffPayload = {
    type: "lease_application",
    vehicleId: input.vehicleId,
    vehicleLabel: input.vehicleLabel,
    dealerName: input.dealerName,
    priceCents: input.quote.priceCents,
    downPaymentCents: input.quote.downPaymentCents,
    residualCents: input.quote.residualCents,
    termMonths: input.quote.termMonths,
    monthlyPaymentCents: input.quote.monthlyPaymentCents,
    baseInterestRate: input.quote.baseInterestRate,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone || "",
    notes: input.notes || "",
    application: input.application,
    source: input.source || "palmettoleasing.com",
    site,
    createdAt: new Date().toISOString(),
  };

  const url = process.env.CRM_HANDOFF_URL?.trim();
  const secret = process.env.CRM_HANDOFF_SECRET?.trim();

  if (!url) {
    // Marketing site works without CRM wired yet — application still accepted client-side.
    console.info("[crm-handoff] CRM_HANDOFF_URL not set — application accepted locally only", {
      referenceId,
      email: payload.customerEmail,
    });
    return {
      ok: true,
      queued: false,
      referenceId,
      message:
        "Application received. Connect CRM_HANDOFF_URL on Vercel to push leads into your CRM project.",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        "x-palmetto-reference": referenceId,
      },
      body: JSON.stringify({ ...payload, referenceId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[crm-handoff] failed", res.status, text.slice(0, 300));
      return {
        ok: false,
        queued: false,
        referenceId,
        message: `CRM handoff failed (${res.status}). We'll still record your request — please call us if urgent.`,
      };
    }
    return {
      ok: true,
      queued: true,
      referenceId,
      message: "Application sent to Paul Motor CRM.",
    };
  } catch (err) {
    console.error("[crm-handoff] network error", err);
    return {
      ok: false,
      queued: false,
      referenceId,
      message: "Could not reach CRM handoff. Please try again or contact Palmetto.",
    };
  }
}
