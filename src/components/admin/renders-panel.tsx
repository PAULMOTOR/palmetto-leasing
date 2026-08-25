import { Loader2, Sparkles, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listAdminRenders, type AdminRenderRow } from "@/lib/admin/renders";
import { Button } from "@/components/ui/button";
import { formatCad, formatNumber } from "@/lib/utils";

type Slot = "front" | "rear" | "interior";
type Triple = { front?: string; rear?: string; interior?: string };

function fileToJpegDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/") || file.size > 12_000_000) {
      reject(new Error("Use a photo under 12 MB"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(64, Math.round(img.width * scale));
      const h = Math.max(64, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not read photo"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read photo"));
    };
    img.src = url;
  });
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
  const [uploads, setUploads] = useState<Record<string, Triple>>({});

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

  function applyResult(row: AdminRenderRow, data: { source?: string; updatedAt?: string }) {
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
  }

  async function postRerender(row: AdminRenderRow, extra?: Triple) {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/rerender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, vehicleId: row.id, ...extra }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        hasApiKey?: boolean;
        error?: string;
        source?: string;
        updatedAt?: string;
      };
      if (data.hasApiKey === false) {
        toast.error("XAI_API_KEY missing on Vercel");
        return;
      }
      if (!res.ok || !data.ok) {
        toast.error(data.error || `Re-render failed (${res.status})`);
        return;
      }
      applyResult(row, data);
      toast.success(extra ? "Rendered from your uploads" : "Tile replaced", {
        description: row.title,
      });
      if (extra) {
        setUploads((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Re-render failed";
      toast.error(/load failed|aborted|fetch/i.test(msg) ? "Timed out — try once more" : msg);
    } finally {
      setBusyId(null);
    }
  }

  async function onPick(rowId: string, slot: Slot, file: File | undefined) {
    if (!file) return;
    try {
      const uri = await fileToJpegDataUri(file);
      setUploads((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [slot]: uri } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read photo");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">Studio tiles</h2>
          <p className="mt-0.5 max-w-xl text-[12px] text-fg-subtle">
            Re-render uses the dealer gallery. For a stubborn car, drop a front 3/4, rear 3/4, and
            seat shot — then Render from uploads. That path looks only at those three photos.
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
          {filtered.map((r) => {
            const u = uploads[r.id] || {};
            const ready = Boolean(u.front && u.rear && u.interior);
            const busy = busyId === r.id;
            return (
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
                    disabled={busy}
                    onClick={() => void postRerender(r)}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Re-render
                  </Button>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ["front", "Front 3/4"],
                        ["rear", "Rear 3/4"],
                        ["interior", "Seats"],
                      ] as const
                    ).map(([slot, label]) => (
                      <label
                        key={slot}
                        className="relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-canvas text-[9px] text-fg-subtle"
                      >
                        {u[slot] ? (
                          <img src={u[slot]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <>
                            <Upload className="mb-0.5 size-3" />
                            {label}
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => void onPick(r.id, slot, e.target.files?.[0])}
                        />
                      </label>
                    ))}
                  </div>
                  {ready ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      disabled={busy}
                      onClick={() =>
                        void postRerender(r, {
                          front: u.front,
                          rear: u.rear,
                          interior: u.interior,
                        })
                      }
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                      Render from uploads
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {rows && filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-fg-subtle">No matching cars</p>
      )}
    </div>
  );
}
