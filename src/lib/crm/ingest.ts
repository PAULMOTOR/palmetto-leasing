import { getSql } from "@/lib/db";
import type { LeaseQuote } from "@/lib/leasing/calc";

export type LeaseLeadInput = {
  vehicleId: string;
  vehicleLabel: string;
  dealerName: string;
  quote: LeaseQuote;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  notes?: string;
  source?: string;
  /** Extended application fields */
  application?: {
    address?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    employer?: string;
    occupation?: string;
    annualIncome?: string;
    sinLast4?: string;
    consentCredit?: boolean;
  };
};

/**
 * Push every live lease quote / application into the built-in CRM.
 * Optionally mirrors to CRM_WEBHOOK_URL when configured in production.
 */
export async function ingestLeaseQuote(input: LeaseLeadInput) {
  const sql = await getSql();
  const app = input.application;
  const appNotes = app
    ? [
        app.address && `Address: ${app.address}`,
        app.city && `City: ${app.city}`,
        app.province && `Prov: ${app.province}`,
        app.postalCode && `Postal: ${app.postalCode}`,
        app.employer && `Employer: ${app.employer}`,
        app.occupation && `Occupation: ${app.occupation}`,
        app.annualIncome && `Income: ${app.annualIncome}`,
        app.sinLast4 && `SIN last4: ${app.sinLast4}`,
        app.consentCredit != null && `Credit consent: ${app.consentCredit ? "yes" : "no"}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const notes = [input.notes?.trim(), appNotes].filter(Boolean).join(" | ");
  const source = input.source || "lease_quote";

  const rows = await sql<{ id: number }>`
    insert into crm_leads (
      vehicle_id, vehicle_label, dealer_name,
      price_cents, down_payment_cents, residual_cents,
      term_months, monthly_payment_cents,
      customer_name, customer_email, customer_phone, notes,
      source, status, created_at, updated_at
    ) values (
      ${input.vehicleId},
      ${input.vehicleLabel},
      ${input.dealerName},
      ${input.quote.priceCents},
      ${input.quote.downPaymentCents},
      ${input.quote.residualCents},
      ${input.quote.termMonths},
      ${input.quote.monthlyPaymentCents},
      ${input.customerName?.trim() || ""},
      ${input.customerEmail?.trim().toLowerCase() || ""},
      ${input.customerPhone?.trim() || ""},
      ${notes},
      ${source},
      'new',
      now(),
      now()
    )
    returning id
  `;

  const leadId = rows[0]!.id;

  const webhook = process.env.CRM_WEBHOOK_URL?.trim();
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: source,
          leadId,
          vehicleId: input.vehicleId,
          vehicleLabel: input.vehicleLabel,
          dealerName: input.dealerName,
          priceCents: input.quote.priceCents,
          downPaymentCents: input.quote.downPaymentCents,
          residualCents: input.quote.residualCents,
          termMonths: input.quote.termMonths,
          monthlyPaymentCents: input.quote.monthlyPaymentCents,
          customerName: input.customerName || "",
          customerEmail: input.customerEmail || "",
          customerPhone: input.customerPhone || "",
          notes,
          application: app || null,
          source: "palmettoleasing.com",
          createdAt: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error("[crm] webhook failed", err);
    }
  }

  return { leadId };
}

export async function listCrmLeads(limit = 50) {
  const sql = await getSql();
  return sql<{
    id: number;
    vehicle_id: string | null;
    vehicle_label: string;
    dealer_name: string;
    price_cents: number;
    down_payment_cents: number;
    residual_cents: number;
    term_months: number;
    monthly_payment_cents: number;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    notes: string;
    source: string;
    status: string;
    assigned_to: string | null;
    created_at: string;
    updated_at: string;
  }>`
    select * from crm_leads
    order by created_at desc
    limit ${limit}
  `;
}

export async function updateLeadStatus(id: number, status: string) {
  const sql = await getSql();
  await sql`
    update crm_leads set status = ${status}, updated_at = now() where id = ${id}
  `;
}
