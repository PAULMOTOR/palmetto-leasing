import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listAdminRenders, type AdminRenderRow } from "@/lib/admin/renders";
import { Button } from "@/components/ui/button";
import { formatCad, formatNumber } from "@/lib/utils";

function friendlyRerenderError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (/aborted|abort|timeout|failed to fetch|network/i.test(msg)) {
    return "Server cut the request off. Wait for this deploy, then try once — 2K tiles take ~30s.";
  }
  return msg || "Re-render failed";
}

export function RendersPanel({
  token,
  imagined,
  missing,
}: {
  token: string;
  imagined?: number;
  missing?: number;
}) {
  const [rows, setRows] = useState<AdminRenderRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listAdminRenders({ data: { token } });
      setRows(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load renders");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows || [];
    return (rows || []).filter((r) =>
      `${r.title} ${r.dealerName} ${r.make} ${r.model}`.toLowerCase().includes(s),
    );
  }, [rows, q]);

  async function onRerender(row: AdminRenderRow) {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/rerender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, vehicleId: row.id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        hasApiKey?: boolean;
        error?: string;
        source?: string;
        updatedAt?: string;
      };
      if (!data.hasApiKey) {
        toast.error("XAI_API_KEY missing on Vercel");
        return;
      }
      if (!res.ok || !data.ok) {
        toast.error(data.error || `Re-render failed (${res.status})`);
        return;
      }
      const v = data.updatedAt || String(Date.now());
      setRows((prev) =>
        (prev || []).map((r) =>
          r.id === row.id
            ? {
                ...r,
                hasStudio: true,
                inferred: data.source === "inferred",
                updatedAt: v,
                tileUrl: `/api/thumb/${encodeURIComponent(r.id)}?v=${encodeURIComponent(v)}`,
              }
            : r,
        ),
      );
      toast.success("Tile replaced", { description: row.title });
    } catch (err) {
      toast.error(friendlyRerenderError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">Studio tiles</h2>
          <p className="mt-0.5 max-w-xl text-[12px] text-fg-subtle">
            Visitors always see the saved tile — photographed cars stay locked. Inferred tiles
            (stock / no dealer photos) re-render automatically when real photography lands.
            {imagined != null ? ` ${imagined} studio · ${missing ?? 0} still dealer photos.` : null}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search make, model, dealer"
            className="h-9 w-full min-w-[12rem] rounded-full border border-border bg-surface px-3 text-sm outline-none focus:border-accent sm:w-64"
          />
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      {rows == null && loading ? (
        <p className="py-12 text-center text-sm text-fg-subtle">Loading tiles…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((r) => (
            <article
              key={r.id}
              className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface"
            >
              <div className="relative aspect-square bg-white">
                <img
                  src={r.tileUrl}
                  alt=""
                  className="h-full w-full object-cover object-center"
                />
                {!r.hasStudio && (
                  <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                    Dealer photo
                  </span>
                )}
                {r.inferred && (
                  <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                    Inferred
                  </span>
                )}
              </div>
              <div className="space-y-2 p-3">
                <p className="text-[9px] tracking-[0.18em] text-fg-subtle uppercase">
                  {r.dealerName}
                </p>
                <h3 className="text-[13px] leading-snug text-fg">{r.title}</h3>
                <p className="text-[12px] tabular-nums text-fg-muted">
                  {formatCad(r.priceCents)} · {formatNumber(r.mileage)} km
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={busyId === r.id}
                  onClick={() => void onRerender(r)}
                >
                  {busyId === r.id ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Re-render
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {rows && filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-fg-subtle">No matching cars</p>
      )}
    </div>
  );
}