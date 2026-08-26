import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getDealerPortal,
  requestImageFix,
  updateDealerPortalSettings,
} from "@/lib/leasing/settings";
import { formatCad, formatCadExact, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/portal/dealer")({
  component: DealerPortalPage,
  head: () => ({
    meta: [{ title: "Dealer portal | Palmetto" }],
  }),
});

function DealerPortalPage() {
  const nav = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof getDealerPortal>> | null>(null);
  const [referralBps, setReferralBps] = useState(150);
  const [offsetBps, setOffsetBps] = useState(0);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = sessionStorage.getItem("palmetto_dealer_token");
    if (!t) {
      void nav({ to: "/login" });
      return;
    }
    setToken(t);
    getDealerPortal({ data: { token: t } })
      .then((d) => {
        setData(d);
        setReferralBps(d.dealer.referralFeeBps);
        setOffsetBps(d.dealer.quoteRateOffsetBps);
      })
      .catch(() => {
        sessionStorage.removeItem("palmetto_dealer_token");
        void nav({ to: "/login" });
      })
      .finally(() => setLoading(false));
  }, [nav]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      await updateDealerPortalSettings({
        data: {
          token,
          referralFeeBps: referralBps,
          quoteRateOffsetBps: offsetBps,
        },
      });
      toast.success("Payout settings saved");
      const d = await getDealerPortal({ data: { token } });
      setData(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onRequestFix(vehicleId: string, title: string) {
    if (!token) return;
    setBusyId(vehicleId);
    try {
      const res = await requestImageFix({
        data: { token, vehicleId, note: notes[vehicleId] || "" },
      });
      if (res.throttled) {
        toast.message("Already requested", { description: "Try again in a few minutes." });
        return;
      }
      toast.success("Fix requested", {
        description: `${title} — Palmetto was emailed.`,
      });
      setNotes((prev) => ({ ...prev, [vehicleId]: "" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setBusyId(null);
    }
  }

  function signOut() {
    sessionStorage.removeItem("palmetto_dealer_token");
    void nav({ to: "/login" });
  }

  if (loading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-fg-subtle" />
      </div>
    );
  }

  const { dealer, referrals, vehicles = [] } = data as typeof data & {
    vehicles?: {
      id: string;
      title: string;
      priceCents: number;
      mileage: number;
      hasStudio: boolean;
      tileUrl: string;
    }[];
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] tracking-[0.2em] text-fg-subtle uppercase">Dealer portal</p>
          <h1 className="mt-1 text-lg font-medium tracking-tight">{dealer.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {dealer.city}, {dealer.province}
            {dealer.active ? " · Live in pool" : " · Offline"}
          </p>
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

      <section className="mb-8">
        <h2 className="text-sm font-medium">Your Palmetto tiles</h2>
        <p className="mt-1 max-w-2xl text-xs text-fg-muted">
          These are the studio images shoppers see. If one is the wrong colour, angle, or car,
          request an image fix — Palmetto will re-render it.
        </p>
        {vehicles.length === 0 ? (
          <p className="mt-6 rounded-[var(--radius-xl)] border border-border bg-surface px-5 py-10 text-center text-sm text-fg-muted">
            No live listings on Palmetto yet.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {vehicles.map((v) => (
              <article
                key={v.id}
                className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface"
              >
                <div className="relative aspect-square bg-white">
                  <img src={v.tileUrl} alt="" className="h-full w-full object-cover object-center" />
                  {!v.hasStudio && (
                    <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                      Dealer photo
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <h3 className="text-[13px] leading-snug text-fg">{v.title}</h3>
                  <p className="text-[12px] tabular-nums text-fg-muted">
                    {formatCad(v.priceCents)} · {formatNumber(v.mileage)} km
                  </p>
                  <textarea
                    rows={2}
                    value={notes[v.id] || ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [v.id]: e.target.value }))}
                    placeholder="What’s wrong? (colour, slats, seats…)"
                    className="w-full resize-none rounded-lg border border-border bg-canvas px-2 py-1.5 text-[11px] outline-none focus:border-accent"
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={busyId === v.id}
                    onClick={() => void onRequestFix(v.id, v.title)}
                  >
                    {busyId === v.id ? <Loader2 className="animate-spin" /> : null}
                    Request image fix
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <form
        onSubmit={onSave}
        className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6"
      >
        <h2 className="text-sm font-medium">Quote & referral payouts</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Controls how your store’s referrals are paid and any rate spread on Palmetto quotes.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ref">Referral fee (basis points)</Label>
            <Input
              id="ref"
              type="number"
              min={0}
              max={1000}
              value={referralBps}
              onChange={(e) => setReferralBps(Number(e.target.value))}
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-fg-subtle">
              {(referralBps / 100).toFixed(2)}% of financed amount · e.g. 150 = 1.50%
            </p>
          </div>
          <div>
            <Label htmlFor="off">Quote rate offset (bps)</Label>
            <Input
              id="off"
              type="number"
              min={-500}
              max={500}
              value={offsetBps}
              onChange={(e) => setOffsetBps(Number(e.target.value))}
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-fg-subtle">
              Added to Palmetto base APR for your listings (can be 0)
            </p>
          </div>
        </div>

        <Button type="submit" className="mt-5" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save payout settings
        </Button>
      </form>

      <div className="mt-6 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-medium">Recent referrals</h2>
        </div>
        {referrals.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-fg-muted">No lease leads yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {referrals.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-fg">{r.vehicle_label}</p>
                  <p className="text-xs text-fg-subtle">
                    {r.customer_name || "—"} · #{r.id} · {r.status}
                  </p>
                </div>
                <p className="tabular-nums text-price">{formatCadExact(r.monthly_payment_cents)}/mo</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
