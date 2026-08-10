import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { listAdminDealers, type AdminDealer } from "@/lib/admin/dealers";
import {
  getQuoteSettings,
  updateQuoteSettings,
  verifyAdminPin,
} from "@/lib/leasing/settings";
import type { QuoteSettings } from "@/lib/leasing/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [{ title: "Admin | Palmetto" }],
  }),
});

const TOKEN_KEY = "palmetto_admin_token";

function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [dealers, setDealers] = useState<AdminDealer[]>([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) setToken(t);
  }, []);

  const refresh = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const [rows, qs] = await Promise.all([
        listAdminDealers({ data: { token: t } }),
        getQuoteSettings(),
      ]);
      setDealers(rows);
      setSettings(qs);
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken(null);
      toast.error("Session expired");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void refresh(token);
  }, [token, refresh]);

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    try {
      const res = await verifyAdminPin({ data: { pin } });
      if (!res.ok) {
        toast.error("Invalid PIN");
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setPin("");
    } finally {
      setUnlocking(false);
    }
  }

  async function onSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !settings) return;
    setSavingSettings(true);
    try {
      const res = await updateQuoteSettings({
        data: {
          token,
          baseInterestRate: settings.baseInterestRate,
          termMonths: settings.termMonths,
          residualRate: settings.residualRate,
          downPaymentRate: settings.downPaymentRate,
        },
      });
      setSettings(res.settings);
      toast.message("Quote defaults are env-driven", {
        description:
          "Set QUOTE_* vars in Vercel → Environment Variables, then redeploy. Current values shown are live from env.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingSettings(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-4 py-16">
        <form
          onSubmit={onUnlock}
          className="rounded-[var(--radius-xl)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <img
            src="/palmetto-logo.png"
            alt="Palmetto"
            className="mx-auto h-12 w-auto object-contain"
          />
          <h1 className="mt-3 text-center text-lg font-medium">Admin</h1>
          <p className="mt-1 text-center text-xs text-fg-subtle">Marketing site control panel</p>
          <div className="mt-6 space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="mt-4 w-full" disabled={unlocking}>
            {unlocking ? <Loader2 className="animate-spin" /> : "Unlock"}
          </Button>
          <Link
            to="/login"
            className="mt-4 block text-center text-[11px] tracking-wide text-fg-subtle uppercase"
          >
            All login options
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-fg-muted">
            No database on this project — quote defaults via Vercel env · dealers via seed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => token && refresh(token)}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Inventory</Link>
          </Button>
        </div>
      </div>

      {settings && (
        <form
          onSubmit={onSaveSettings}
          className="mb-6 rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6"
        >
          <h2 className="text-sm font-medium">Default quote settings (live from env)</h2>
          <p className="mt-1 text-xs text-fg-muted">
            Change in Vercel: <code className="text-[11px]">QUOTE_BASE_INTEREST_RATE</code>,{" "}
            <code className="text-[11px]">QUOTE_TERM_MONTHS</code>,{" "}
            <code className="text-[11px]">QUOTE_RESIDUAL_RATE</code>,{" "}
            <code className="text-[11px]">QUOTE_DOWN_PAYMENT_RATE</code>
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Readout
              label="Base APR"
              value={`${(settings.baseInterestRate * 100).toFixed(2)}%`}
            />
            <Readout label="Term" value={`${settings.termMonths} mo`} />
            <Readout
              label="Residual"
              value={`${(settings.residualRate * 100).toFixed(0)}%`}
            />
            <Readout
              label="Down payment"
              value={`${(settings.downPaymentRate * 100).toFixed(0)}%`}
            />
          </div>
          <Button type="submit" className="mt-4" variant="secondary" disabled={savingSettings}>
            How to update
          </Button>
        </form>
      )}

      <h2 className="mb-3 text-sm font-medium">Partner dealerships (seed)</h2>
      <p className="mb-3 text-xs text-fg-muted">
        Edit roster in <code className="text-[11px]">src/lib/leasing/seed.ts</code> and redeploy.
        Active = included in public pool.
      </p>
      <div className="space-y-3">
        {dealers.map((d) => (
          <div
            key={d.id}
            className={cn(
              "rounded-[var(--radius-xl)] border bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5",
              d.active ? "border-border" : "border-border/60 opacity-75",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{d.name}</h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                  d.active ? "bg-success/15 text-success" : "bg-surface-3 text-fg-subtle",
                )}
              >
                {d.active ? "Live" : "Off"}
              </span>
              <span className="text-xs text-fg-subtle">
                {d.vehicle_count} vehicles · {d.city}, {d.province}
              </span>
            </div>
            <p className="mt-1 text-xs text-fg-muted">{d.brands}</p>
            <p className="mt-2 break-all text-[11px] text-fg-subtle">{d.inventory_url}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border/80 bg-surface-2/40 px-3 py-2">
      <p className="text-[10px] tracking-wide text-fg-subtle uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
