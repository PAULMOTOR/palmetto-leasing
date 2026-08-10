import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { calculateLease, LEASE_TERM_MONTHS } from "@/lib/leasing/calc";
import { submitLeaseQuote } from "@/lib/leasing/queries";
import type { VehicleCard } from "@/lib/leasing/types";
import { vehicleLabel } from "@/lib/leasing/types";
import { formatCad, formatCadExact } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export function LeaseQuotePanel({
  vehicle,
  dealerMode = false,
}: {
  vehicle: VehicleCard;
  dealerMode?: boolean;
}) {
  const user = useCurrentUser();
  const quote = useMemo(() => calculateLease(vehicle.price_cents), [vehicle.price_cents]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | number | null>(null);

  const isDealer = dealerMode || Boolean(user);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const dealerNote = isDealer
        ? `Dealer application${user?.displayName ? ` by ${user.displayName}` : ""}${user?.primaryEmail ? ` (${user.primaryEmail})` : ""}`
        : "";
      const result = await submitLeaseQuote({
        data: {
          vehicleId: vehicle.id,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          notes: [dealerNote, notes, `Live quote for ${vehicleLabel(vehicle)}`]
            .filter(Boolean)
            .join(" · "),
        },
      });
      setSubmittedId(result.leadId);
      toast.success(isDealer ? "Application sent to CRM" : "Quote sent", {
        description: `Lead #${result.leadId} · ${formatCadExact(result.quote.monthlyPaymentCents)}/mo`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save quote");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border-strong bg-surface shadow-[var(--shadow-card-hover)]">
      <div className="border-b border-border bg-surface-2/80 px-5 py-5 sm:px-6">
        <p className="text-[11px] tracking-[0.16em] text-fg-subtle uppercase">
          {isDealer ? "Dealer lease application" : "Monthly"}
        </p>
        <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-price sm:text-4xl">
          {formatCadExact(quote.monthlyPaymentCents)}
          <span className="ml-1 text-base font-normal text-fg-muted">/mo</span>
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          {LEASE_TERM_MONTHS} mo · 20% down · 50% residual
        </p>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <dl className="grid gap-2.5 text-sm">
          <Row label="Price" value={formatCad(quote.priceCents)} />
          <Row label="Down (20%)" value={formatCad(quote.downPaymentCents)} />
          <Row label="Residual (50%)" value={formatCad(quote.residualCents)} />
          <Row label="Depreciation" value={formatCad(quote.depreciationCents)} />
        </dl>

        {submittedId ? (
          <div className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface-2 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <p className="font-medium text-fg">CRM lead #{submittedId}</p>
              <p className="mt-1 text-fg-muted">Ready for follow-up.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Customer</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domain.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isDealer ? "Trade-in, credit notes…" : "Optional"}
                className="min-h-[72px]"
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" size="lg" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Sending…
                </>
              ) : isDealer ? (
                "Submit application to CRM"
              ) : (
                "Get lease quote"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="tabular-nums text-fg">{value}</dd>
    </div>
  );
}
