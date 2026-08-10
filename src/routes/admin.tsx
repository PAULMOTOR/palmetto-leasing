import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  addDealer,
  listAdminDealers,
  updateDealer,
  type AdminDealer,
} from "@/lib/admin/dealers";
import {
  getQuoteSettings,
  updateQuoteSettings,
  verifyAdminPin,
} from "@/lib/leasing/settings";
import {
  getInventoryStats,
  getRecentCrawlRuns,
  triggerCrawl,
  triggerImagineThumbs,
} from "@/lib/leasing/queries";
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
  const [crawling, setCrawling] = useState(false);
  const [imagining, setImagining] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [hasImagineKey, setHasImagineKey] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<
    {
      id: number;
      status: string;
      listings_found: number;
      added: number;
      updated: number;
      removed: number;
      started_at: string;
    }[]
  >([]);

  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) setToken(t);
  }, []);

  const refresh = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const [rows, qs, crawlRuns, stats] = await Promise.all([
        listAdminDealers({ data: { token: t } }),
        getQuoteSettings(),
        getRecentCrawlRuns().catch(() => []),
        getInventoryStats().catch(() => null),
      ]);
      setDealers(rows);
      setSettings(qs);
      if (stats && "hasImagineKey" in stats) {
        setHasImagineKey(Boolean((stats as { hasImagineKey?: boolean }).hasImagineKey));
      }
      setRuns(
        (
          crawlRuns as {
            id: number;
            status: string;
            listings_found: number;
            added: number;
            updated: number;
            removed: number;
            started_at: string;
          }[]
        ).map((r) => ({
          ...r,
          listings_found: Number(r.listings_found),
          added: Number(r.added),
          updated: Number(r.updated),
          removed: Number(r.removed),
        })),
      );
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

  async function onCrawl() {
    setCrawling(true);
    try {
      const r = await triggerCrawl();
      toast.success("Inventory pool refreshed", {
        description: `${r.dealersScanned} dealers · ${r.listingsFound} listings · +${r.added} / ~${r.updated} / −${r.removed}${r.imagined ? ` · ${r.imagined} Imagine` : ""}`,
      });
      if (token) await refresh(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  }

  async function onImagine() {
    setImagining(true);
    try {
      const r = await triggerImagineThumbs({ data: { limit: 20 } });
      if (!r.hasApiKey) {
        toast.error("XAI_API_KEY missing on Vercel", {
          description: "Add the key from console.x.ai, redeploy, then try again.",
        });
        return;
      }
      toast.success("Imagine batch done", {
        description: `${r.succeeded}/${r.attempted} studio tiles · ${r.skipped} skipped`,
      });
      if (r.errors?.length) {
        toast.message("Some failed", { description: r.errors[0] });
      }
      if (token) await refresh(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Imagine failed");
    } finally {
      setImagining(false);
    }
  }

  async function onToggle(d: AdminDealer) {
    if (!token) return;
    await updateDealer({ data: { token, id: d.id, active: !d.active } });
    toast.success(d.active ? "Dealer offline" : "Dealer live");
    await refresh(token);
  }

  async function onSaveUrls(d: AdminDealer, website_url: string, inventory_url: string) {
    if (!token) return;
    await updateDealer({ data: { token, id: d.id, website_url, inventory_url } });
    toast.success("Links saved — run Pool inventory to re-crawl");
    await refresh(token);
  }

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-4 py-16">
        <form
          onSubmit={onUnlock}
          className="rounded-[var(--radius-xl)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <img src="/palmetto-logo.png" alt="Palmetto" className="mx-auto h-12 w-auto object-contain" />
          <h1 className="mt-3 text-center text-lg font-medium">Admin</h1>
          <p className="mt-1 text-center text-xs text-fg-subtle">Inventory · crawl · Imagine</p>
          <div className="mt-6 space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input id="pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} required />
          </div>
          <Button type="submit" className="mt-4 w-full" disabled={unlocking}>
            {unlocking ? <Loader2 className="animate-spin" /> : "Unlock"}
          </Button>
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
            Live inventory · Imagine studio tiles · partner pool
          </p>
          {hasImagineKey != null && (
            <p
              className={cn(
                "mt-1 text-[11px]",
                hasImagineKey ? "text-success" : "text-fg-subtle",
              )}
            >
              {hasImagineKey
                ? "XAI_API_KEY detected — Imagine ready"
                : "XAI_API_KEY not set — tiles use dealer photos until you add the key + redeploy"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => token && refresh(token)} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button size="sm" onClick={onCrawl} disabled={crawling}>
            {crawling ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Pool inventory now
          </Button>
          <Button size="sm" variant="outline" onClick={onImagine} disabled={imagining}>
            {imagining ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Generate Imagine tiles
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <Plus />
            Add dealer
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Inventory</Link>
          </Button>
        </div>
      </div>

      {settings && (
        <div className="mb-6 rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-sm font-medium">Quote defaults</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Stat label="APR" value={`${(settings.baseInterestRate * 100).toFixed(2)}%`} />
            <Stat label="Term" value={`${settings.termMonths} mo`} />
            <Stat label="Residual" value={`${(settings.residualRate * 100).toFixed(0)}%`} />
            <Stat label="Down" value={`${(settings.downPaymentRate * 100).toFixed(0)}%`} />
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
          <div className="border-b border-border px-4 py-2 text-sm font-medium">Recent crawls</div>
          <ul className="divide-y divide-border text-xs">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  #{r.id} · {r.status} · {new Date(r.started_at).toLocaleString()}
                </span>
                <span className="tabular-nums text-fg-muted">
                  {r.listings_found} found · +{r.added} ~{r.updated} −{r.removed}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mb-3 text-sm font-medium">Dealership pool</h2>
      <div className="space-y-3">
        {dealers.map((d) => (
          <DealerRow key={d.id} dealer={d} onToggle={() => onToggle(d)} onSaveUrls={onSaveUrls} />
        ))}
      </div>

      {showAdd && token && (
        <AddDealerModal
          token={token}
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
            setShowAdd(false);
            await refresh(token);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border/80 bg-surface-2/40 px-3 py-2">
      <p className="text-[10px] tracking-wide text-fg-subtle uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function DealerRow({
  dealer,
  onToggle,
  onSaveUrls,
}: {
  dealer: AdminDealer;
  onToggle: () => void;
  onSaveUrls: (d: AdminDealer, website: string, inventory: string) => Promise<void>;
}) {
  const [website, setWebsite] = useState(dealer.website_url);
  const [inventory, setInventory] = useState(dealer.inventory_url);
  const [saving, setSaving] = useState(false);
  const dirty = website !== dealer.website_url || inventory !== dealer.inventory_url;

  useEffect(() => {
    setWebsite(dealer.website_url);
    setInventory(dealer.inventory_url);
  }, [dealer.website_url, dealer.inventory_url]);

  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5",
        dealer.active ? "border-border" : "border-border/60 opacity-80",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium text-fg">{dealer.name}</h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                dealer.active ? "bg-success/15 text-success" : "bg-surface-3 text-fg-subtle",
              )}
            >
              {dealer.active ? "Live" : "Off"}
            </span>
            <span className="text-xs text-fg-subtle">
              {dealer.vehicle_count} vehicles · {dealer.city}, {dealer.province}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">{dealer.brands}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "inline-flex h-9 items-center rounded-full border px-4 text-xs font-medium",
            dealer.active
              ? "border-border text-fg-muted hover:bg-surface-2"
              : "border-accent text-accent hover:bg-accent hover:text-accent-fg",
          )}
        >
          {dealer.active ? "Turn off" : "Turn on"}
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10px] tracking-wide text-fg-subtle uppercase">Website</span>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="h-10 w-full rounded-full border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] tracking-wide text-fg-subtle uppercase">
            Inventory URL
          </span>
          <input
            value={inventory}
            onChange={(e) => setInventory(e.target.value)}
            className="h-10 w-full rounded-full border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>
      {dirty && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSaveUrls(dealer, website, inventory);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save links
          </Button>
        </div>
      )}
    </div>
  );
}

function AddDealerModal({
  token,
  onClose,
  onAdded,
}: {
  token: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("ON");
  const [brands, setBrands] = useState("");
  const [website, setWebsite] = useState("https://");
  const [inventory, setInventory] = useState("https://");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await addDealer({
        data: {
          token,
          name,
          city,
          province,
          brands,
          website_url: website,
          inventory_url: inventory,
          active: true,
        },
      });
      toast.success("Dealer onboarded");
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-3 rounded-[var(--radius-xl)] border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium">Onboard dealership</h2>
        <Field label="Name" value={name} onChange={setName} required />
        <div className="grid grid-cols-2 gap-2">
          <Field label="City" value={city} onChange={setCity} required />
          <Field label="Province" value={province} onChange={setProvince} required />
        </div>
        <Field label="Brands" value={brands} onChange={setBrands} />
        <Field label="Website URL" value={website} onChange={setWebsite} required />
        <Field label="Inventory URL" value={inventory} onChange={setInventory} required />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : "Add"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] tracking-wide text-fg-subtle uppercase">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="h-10 w-full rounded-full border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

void updateQuoteSettings;
