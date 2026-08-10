import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { clientLookup } from "@/lib/leasing/settings";
import { formatCad, formatCadExact, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/client")({
  component: ClientPortalPage,
  head: () => ({
    meta: [{ title: "Client portal | Palmetto" }],
  }),
});

type AppRow = {
  id: number | string;
  vehicleLabel: string;
  dealerName?: string;
  priceCents?: number;
  monthlyPaymentCents?: number;
  termMonths?: number;
  residualCents?: number;
  status: string;
  contractStatus?: string;
  missingDocs?: string[];
  buyoutCents?: number | null;
  monthsElapsed?: number;
  createdAt?: string;
  customerName?: string;
};

function ClientPortalPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const e = sessionStorage.getItem("palmetto_client_email");
    if (!e) {
      void nav({ to: "/login" });
      return;
    }
    setEmail(e);
    clientLookup({ data: { email: e } })
      .then((r) => {
        setApps((r.applications || []) as unknown as AppRow[]);
        setNote((r as { note?: string }).note || null);
      })
      .finally(() => setLoading(false));
  }, [nav]);

  function signOut() {
    sessionStorage.removeItem("palmetto_client_email");
    void nav({ to: "/login" });
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.2em] text-fg-subtle uppercase">Client portal</p>
          <h1 className="mt-1 text-lg font-medium tracking-tight">Your applications</h1>
          {email && <p className="mt-1 text-sm text-fg-muted">{email}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Inventory</Link>
          </Button>
          <Button variant="secondary" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-fg-subtle" />
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-8 text-center shadow-[var(--shadow-card)]">
          <FileText className="mx-auto size-8 text-fg-subtle" />
          <p className="mt-3 text-sm text-fg-muted">
            {note || "No applications found for this email yet. Apply from any vehicle Lease panel."}
          </p>
          <Button asChild className="mt-4">
            <Link to="/">Browse inventory</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li
              key={String(a.id)}
              className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium text-fg">{a.vehicleLabel}</h2>
                  {a.dealerName && (
                    <p className="mt-0.5 text-xs text-fg-muted">{a.dealerName}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                    a.status === "won"
                      ? "bg-success/15 text-success"
                      : "bg-surface-2 text-fg-muted",
                  )}
                >
                  {a.status}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {a.monthlyPaymentCents != null && (
                  <div>
                    <dt className="text-fg-subtle">Monthly</dt>
                    <dd className="font-medium tabular-nums">
                      {formatCadExact(a.monthlyPaymentCents)}
                    </dd>
                  </div>
                )}
                {a.priceCents != null && (
                  <div>
                    <dt className="text-fg-subtle">Price</dt>
                    <dd className="font-medium tabular-nums">{formatCad(a.priceCents)}</dd>
                  </div>
                )}
                {a.buyoutCents != null && (
                  <div>
                    <dt className="text-fg-subtle">Buyout est.</dt>
                    <dd className="font-medium tabular-nums">{formatCad(a.buyoutCents)}</dd>
                  </div>
                )}
                {a.contractStatus && (
                  <div>
                    <dt className="text-fg-subtle">Contract</dt>
                    <dd className="font-medium capitalize">{a.contractStatus}</dd>
                  </div>
                )}
              </dl>
              {a.missingDocs && a.missingDocs.length > 0 && (
                <p className="mt-3 text-xs text-fg-muted">
                  Missing: {a.missingDocs.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
