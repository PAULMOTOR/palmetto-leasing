import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  addDealer,
  deleteDealer,
  listAdminDealers,
  updateDealer,
  type AdminDealer,
} from "@/lib/admin/dealers";
import {
  getImageSupportEmail,
  listImageFixRequests,
  updateImageSupportEmail,
} from "@/lib/admin/image-support";
import {
  getQuoteSettings,
  updateQuoteSettings,
  verifyAdminPin,
} from "@/lib/leasing/settings";
import {
  getInventoryStats,
  getRecentCrawlRuns,
  triggerCrawl,
} from "@/lib/leasing/queries";
import type { QuoteSettings } from "@/lib/leasing/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RendersPanel } from "@/components/admin/renders-panel";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  validateSearch: (search: Record<string, unknown>) =>
    z
      .object({
        tab: z.enum(["inventory", "renders"]).optional(),
        q: z.string().optional(),
      })
      .parse({
        tab: search.tab === "renders" || search.tab === "inventory" ? search.tab : undefined,
        q: typeof search.q === "string" ? search.q : undefined,
      }),
  head: () => ({
    meta: [{ title: "Admin | Palmetto" }],
  }),
});

const TOKEN_KEY = "palmetto_admin_token";

function AdminPage() {
  const { tab: tabQ, q: searchQ } = Route.useSearch();
  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [dealers, setDealers] = useState<AdminDealer[]>([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<"inventory" | "renders">(tabQ === "renders" ? "renders" : "inventory");
  const [hasImagineKey, setHasImagineKey] = useState<boolean | null>(null);
  const [imageEmail, setImageEmail] = useState("Jeremyp@paulmotorcompany.com");
  const [mailReady, setMailReady] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [fixReqs, setFixReqs] = useState<
    Awaited<ReturnType<typeof listImageFixRequests>>
  >([]);
  const [thumbStats, setThumbStats] = useState<{ imagined: number; missing: number } | null>(null);
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
      const [rows, qs, crawlRuns, stats, image, reqs] = await Promise.all([
        listAdminDealers({ data: { token: t } }),
        getQuoteSettings(),
        getRecentCrawlRuns().catch(() => []),
        getInventoryStats().catch(() => null),
        getImageSupportEmail({ data: { token: t } }).catch(() => ({
          email: "Jeremyp@paulmotorcompany.com",
          smtpUser: "",
          smtpConfigured: false,
          hasResend: false,
        })),
        listImageFixRequests({ data: { token: t } }).catch(() => []),
      ]);
      setDealers(rows);
      setSettings(qs);
      setImageEmail(image.email);
      setSmtpUser(image.smtpUser || "");
      setMailReady(Boolean(image.smtpConfigured || image.hasResend));
      setFixReqs(reqs);
      if (stats) {
        setHasImagineKey(Boolean((stats as { hasImagineKey?: boolean }).hasImagineKey));
        setThumbStats({
          imagined: Number((stats as { imaginedThumbs?: number }).imaginedThumbs ?? 0),
          missing: Number((stats as { missingThumbs?: number }).missingThumbs ?? 0),
        });
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
        description: `${r.dealersScanned} dealers · ${r.listingsFound} listings · +${r.added} / ~${r.updated} / −${r.removed}`,
      });
      if (token) await refresh(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  }

  async function onToggle(d: AdminDealer) {
    if (!token) return;
    await updateDealer({ data: { token, id: d.id, active: !d.active } });
    toast.success(d.active ? "Dealer offline" : "Dealer live");
    await refresh(token);
  }

  async function onDelete(d: AdminDealer) {
    if (!token) return;
    const ok = window.confirm(
      `Delete ${d.name}? This removes the dealer and marks their ${d.vehicle_count} vehicles as removed. This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await deleteDealer({ data: { token, id: d.id } });
      toast.success("Dealer deleted", { description: d.name });
      await refresh(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
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
          <p className="mt-1 text-center text-xs text-fg-subtle">Inventory · quotes · dealers</p>
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
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Live inventory · quote defaults · partner pool
          </p>
          {hasImagineKey != null && (
            <p className={cn("mt-1 text-[11px]", hasImagineKey ? "text-success" : "text-fg-subtle")}>
              {hasImagineKey ? "XAI_API_KEY detected" : "XAI_API_KEY not set"}
              {thumbStats
                ? ` · ${thumbStats.imagined} studio tiles · ${thumbStats.missing} still dealer photos`
                : null}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-full border border-border p-0.5">
            <button
              type="button"
              onClick={() => setTab("inventory")}
              className={cn(
                "h-8 rounded-full px-3.5 text-xs font-medium",
                tab === "inventory" ? "bg-fg text-primary-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              Inventory
            </button>
            <button
              type="button"
              onClick={() => setTab("renders")}
              className={cn(
                "h-8 rounded-full px-3.5 text-xs font-medium",
                tab === "renders" ? "bg-fg text-primary-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              Renders
            </button>
          </div>
          {tab === "inventory" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => token && refresh(token)} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : ""} />
                Refresh
              </Button>
              <Button size="sm" onClick={onCrawl} disabled={crawling}>
                {crawling ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Pool inventory now
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                <Plus />
                Add dealer
              </Button>
            </>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link to="/">View site</Link>
          </Button>
        </div>
      </div>

      {tab === "renders" && token ? (
        <RendersPanel
          token={token}
          imagined={thumbStats?.imagined}
          missing={thumbStats?.missing}
          initialQuery={searchQ || ""}
        />
      ) : (
        <>
      {settings && token && (
        <QuoteSettingsEditor
          token={token}
          initial={settings}
          onSaved={(s) => setSettings(s)}
        />
      )}
      {token && (
        <ImageSupportEmailEditor
          token={token}
          initial={imageEmail}
          smtpUser={smtpUser}
          mailReady={mailReady}
          requests={fixReqs}
          onSaved={async () => {
            if (token) await refresh(token);
          }}
        />
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
          <DealerRow
            key={d.id}
            dealer={d}
            onToggle={() => onToggle(d)}
            onDelete={() => onDelete(d)}
            onSaveUrls={onSaveUrls}
          />
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
        </>
      )}
    </div>
  );
}

function ImageSupportEmailEditor({
  token,
  initial,
  smtpUser: smtpUserIn,
  mailReady,
  requests,
  onSaved,
}: {
  token: string;
  initial: string;
  smtpUser: string;
  mailReady: boolean;
  requests: Awaited<ReturnType<typeof listImageFixRequests>>;
  onSaved: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState(initial);
  const [gmailUser, setGmailUser] = useState(smtpUserIn || initial);
  const [appPass, setAppPass] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEmail(initial);
    if (smtpUserIn) setGmailUser(smtpUserIn);
  }, [initial, smtpUserIn]);

  async function submit(sendTest: boolean) {
    setSaving(true);
    try {
      const res = await updateImageSupportEmail({
        data: {
          token,
          email,
          smtpUser: gmailUser,
          smtpPass: appPass || undefined,
          sendTest,
        },
      });
      if (sendTest) {
        if (res.test?.ok) toast.success("Test email sent", { description: email });
        else toast.error(res.test?.error || "Test email failed");
      } else {
        toast.success("Mail settings saved", { description: email });
      }
      setAppPass("");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      className="mb-6 rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      <h2 className="text-sm font-medium">Image / support email</h2>
      <p className="mt-0.5 text-[11px] text-fg-subtle">
        Dealer “Request image fix” goes here. Gmail sending uses an{" "}
        <a
          className="underline"
          href="https://myaccount.google.com/apppasswords"
          target="_blank"
          rel="noreferrer"
        >
          App password
        </a>{" "}
        (2-Step Verification must be on).
      </p>
      <p className={`mt-2 text-[11px] ${mailReady ? "text-success" : "text-fg-subtle"}`}>
        {mailReady ? "Mailer ready" : "Mailer not configured — paste a Gmail app password below, then Send test"}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="img-email">Notify email</Label>
          <Input
            id="img-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="gmail-user">Send from Gmail</Label>
          <Input
            id="gmail-user"
            type="email"
            value={gmailUser}
            onChange={(e) => setGmailUser(e.target.value)}
            placeholder="Jeremyp@paulmotorcompany.com"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="gmail-pass">Gmail app password</Label>
          <Input
            id="gmail-pass"
            type="password"
            value={appPass}
            onChange={(e) => setAppPass(e.target.value)}
            placeholder={mailReady ? "•••• already saved" : "xxxx xxxx xxxx xxxx"}
            autoComplete="new-password"
            className="mt-1"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={() => void submit(true)}>
          Save & send test
        </Button>
      </div>
      {requests.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-xs font-medium text-fg-muted">Recent image-fix requests</h3>
          <ul className="mt-2 divide-y divide-border text-xs">
            {requests.slice(0, 8).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {r.dealer_name} · {r.title}
                  {r.note ? ` — ${r.note}` : ""}
                </span>
                <span className={r.email_ok ? "text-success" : "text-fg-subtle"}>
                  {r.email_ok ? "emailed" : r.email_error || "not emailed"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

function QuoteSettingsEditor({
  token,
  initial,
  onSaved,
}: {
  token: string;
  initial: QuoteSettings;
  onSaved: (s: QuoteSettings) => void;
}) {
  const [apr, setApr] = useState(String((initial.baseInterestRate * 100).toFixed(2)));
  const [term, setTerm] = useState(String(initial.termMonths));
  const [residual, setResidual] = useState(String((initial.residualRate * 100).toFixed(0)));
  const [down, setDown] = useState(String((initial.downPaymentRate * 100).toFixed(0)));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setApr(String((initial.baseInterestRate * 100).toFixed(2)));
    setTerm(String(initial.termMonths));
    setResidual(String((initial.residualRate * 100).toFixed(0)));
    setDown(String((initial.downPaymentRate * 100).toFixed(0)));
  }, [initial]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const baseInterestRate = Number(apr) / 100;
      const termMonths = Math.round(Number(term));
      const residualRate = Number(residual) / 100;
      const downPaymentRate = Number(down) / 100;
      if (!Number.isFinite(baseInterestRate) || baseInterestRate < 0 || baseInterestRate > 0.4) {
        toast.error("APR must be between 0 and 40%");
        return;
      }
      if (!Number.isFinite(termMonths) || termMonths < 12 || termMonths > 72) {
        toast.error("Term must be 12–72 months");
        return;
      }
      if (!Number.isFinite(residualRate) || residualRate < 0.1 || residualRate > 0.9) {
        toast.error("Residual must be 10–90%");
        return;
      }
      if (!Number.isFinite(downPaymentRate) || downPaymentRate < 0 || downPaymentRate > 0.5) {
        toast.error("Down must be 0–50%");
        return;
      }
      const res = await updateQuoteSettings({
        data: {
          token,
          baseInterestRate,
          termMonths,
          residualRate,
          downPaymentRate,
        },
      });
      if (!res.ok) {
        toast.error("Could not save quote settings");
        return;
      }
      onSaved(res.settings);
      toast.success("Quote defaults saved", {
        description: "Live on inventory quotes immediately (no redeploy).",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="mb-6 rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">Quote defaults</h2>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            Base APR, term, residual & down used for every lease estimate
          </p>
        </div>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save quote settings
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-[10px] tracking-wide text-fg-subtle uppercase">
            Base APR (%)
          </span>
          <input
            type="number"
            step="0.01"
            min={0}
            max={40}
            value={apr}
            onChange={(e) => setApr(e.target.value)}
            className="h-10 w-full rounded-full border border-border bg-surface px-3 text-sm tabular-nums outline-none focus:border-accent"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] tracking-wide text-fg-subtle uppercase">
            Term (months)
          </span>
          <input
            type="number"
            step={1}
            min={12}
            max={72}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="h-10 w-full rounded-full border border-border bg-surface px-3 text-sm tabular-nums outline-none focus:border-accent"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] tracking-wide text-fg-subtle uppercase">
            Residual (%)
          </span>
          <input
            type="number"
            step={1}
            min={10}
            max={90}
            value={residual}
            onChange={(e) => setResidual(e.target.value)}
            className="h-10 w-full rounded-full border border-border bg-surface px-3 text-sm tabular-nums outline-none focus:border-accent"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] tracking-wide text-fg-subtle uppercase">
            Default down (%)
          </span>
          <input
            type="number"
            step={1}
            min={0}
            max={50}
            value={down}
            onChange={(e) => setDown(e.target.value)}
            className="h-10 w-full rounded-full border border-border bg-surface px-3 text-sm tabular-nums outline-none focus:border-accent"
            required
          />
        </label>
      </div>
    </form>
  );
}

function DealerRow({
  dealer,
  onToggle,
  onDelete,
  onSaveUrls,
}: {
  dealer: AdminDealer;
  onToggle: () => void;
  onDelete: () => void;
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
        <div className="flex flex-wrap gap-2">
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
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/40 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
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
