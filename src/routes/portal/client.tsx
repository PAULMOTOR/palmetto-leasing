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
  id: number;
  vehicleLabel: string;
  dealerName: string;
  priceCents: number;
  monthlyPaymentCents: number;
  termMonths: number;
  residualCents: number;
  status: string;
  contractStatus: string;
  missingDocs: string[];
  buyoutCents: number;
  monthsElapsed: number;
  createdAt: string;
  customerName: string;
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
        setApps((r.applications || []) as AppRow[]);
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
        <div className="rounded-[var(--radius-xl)] border border-border bg-surface px-6 py-14 text-center">
          <p className="text-sm text-fg-muted">
            {note ||
              "No applications returned from CRM yet. After you apply on a vehicle, status is tracked in the Paul Motor CRM project (connect CRM_STATUS_URL when ready)."}
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/">Browse inventory</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map((a) => (
            <article
              key={a.id}
              className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-fg">{a.vehicleLabel}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">{a.dealerName}</p>
                </div>
                <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-fg-muted uppercase">
                  {a.status}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[10px] text-fg-subtle uppercase">Monthly</dt>
                  <dd className="font-medium tabular-nums text-price">
                    {formatCadExact(a.monthlyPaymentCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-fg-subtle uppercase">Term</dt>
                  <dd className="tabular-nums">{a.termMonths} mo</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-fg-subtle uppercase">Price</dt>
                  <dd className="tabular-nums">{formatCad(a.priceCents)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-fg-subtle uppercase">Buyout</dt>
                  <dd className="tabular-nums text-price">{formatCad(a.buyoutCents)}</dd>
                </div>
              </dl>
              {a.missingDocs?.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-border pt-3">
                  {a.missingDocs.map((d) => (
                    <li key={d} className="flex items-center gap-2 text-sm text-fg-muted">
                      <FileText className="size-3.5 opacity-60" />
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
