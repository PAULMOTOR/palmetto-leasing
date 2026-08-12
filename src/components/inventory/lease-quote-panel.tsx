import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { VehicleCard } from "@/lib/leasing/types";
import {
  calculateLease,
  LEASE_TERM_MONTHS,
  residualForTerm,
} from "@/lib/leasing/calc";
import { submitLeaseQuote } from "@/lib/leasing/queries";
import { formatCad, formatCadExact } from "@/lib/utils";

export function LeaseQuotePanel({ vehicle }: { vehicle: VehicleCard }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ leadId: string | number } | null>(null);

  const quote = useMemo(
    () => calculateLease(vehicle.price_cents, { termMonths: LEASE_TERM_MONTHS }),
    [vehicle.price_cents],
  );
  const residualPct = Math.round(quote.residualRate * 100);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitLeaseQuote({
        data: {
          vehicleId: vehicle.id,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          source: "lease_quote",
        },
      });
      setDone({ leadId: result.leadId });
      toast.success("Quote sent to CRM", {
        description: `Lead #${result.leadId}`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit quote");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
        <div>
          <p className="font-medium text-fg">Application received</p>
          <p className="mt-1 text-sm text-fg-muted">
            Reference <span className="font-mono text-fg">#{done.leadId}</span>. Our team will
            follow up shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-[10px] tracking-[0.16em] text-fg-subtle uppercase">Est. monthly</p>
          <p className="font-display text-3xl font-semibold tabular-nums tracking-tight text-price">
            {formatCadExact(quote.monthlyPaymentCents)}
            <span className="ml-1 text-sm font-normal text-fg-muted">/mo</span>
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            {LEASE_TERM_MONTHS} mo · 20% down · {residualPct}% residual
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:text-sm">
          <Row label="Vehicle price" value={formatCad(quote.priceCents)} />
          <Row label="Down (20%)" value={formatCad(quote.downPaymentCents)} />
          <Row label={`Residual (${residualPct}%)`} value={formatCad(quote.residualCents)} />
          <Row label="Cap cost" value={formatCad(quote.capCostCents)} />
        </dl>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-fg-muted">
          Apply on this quote — feeds our CRM. Residual for {LEASE_TERM_MONTHS} mo is{" "}
          {(residualForTerm(LEASE_TERM_MONTHS) * 100).toFixed(0)}%.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Full name" value={name} onChange={setName} required />
          <Field label="Email" value={email} onChange={setEmail} type="email" required />
          <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-fg text-sm font-medium text-primary-fg transition-[transform,opacity] hover:opacity-90 active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Apply with this quote
        </button>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-fg">{value}</dd>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-left">
      <span className="mb-1 block text-[10px] tracking-wide text-fg-subtle uppercase">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="h-10 w-full rounded-full border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}
