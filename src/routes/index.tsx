import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, X } from "lucide-react";
import { VehicleCard } from "@/components/inventory/vehicle-card";
import {
  bootstrapInventory,
  getInventoryStats,
  listDealers,
  listVehicles,
} from "@/lib/leasing/queries";
import {
  MONTHLY_RANGES,
  type MonthlyRangeId,
  inMonthlyRange,
  DEFAULT_QUOTE_SETTINGS,
  type QuoteSettings,
} from "@/lib/leasing/calc";
import { loadQuoteSettingsAsync } from "@/lib/leasing/quote-config";
import type { VehicleCard as VehicleCardType } from "@/lib/leasing/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: InventoryPage,
});

function InventoryPage() {
  const [vehicles, setVehicles] = useState<VehicleCardType[]>([]);
  const [dealers, setDealers] = useState<
    { id: string; name: string; city: string; province: string; count: number }[]
  >([]);
  const [stats, setStats] = useState<{
    total: number;
    premium: number;
    dealers: number;
  } | null>(null);
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [make, setMake] = useState("");
  const [dealerId, setDealerId] = useState("");
  const [monthly, setMonthly] = useState<MonthlyRangeId | "">("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await bootstrapInventory();
        const [list, dlist, st, qs] = await Promise.all([
          listVehicles({ data: { sort: "price_desc" } }),
          listDealers(),
          getInventoryStats(),
          loadQuoteSettingsAsync().catch(() => DEFAULT_QUOTE_SETTINGS),
        ]);
        if (cancelled) return;
        setVehicles(list);
        setDealers(
          dlist.map((d) => ({
            id: d.id,
            name: d.name,
            city: d.city,
            province: d.province,
            count: Number((d as { count?: number }).count ?? 0),
          })),
        );
        setStats({ total: st.total, premium: st.premium, dealers: st.dealers });
        setQuoteSettings(qs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const makes = useMemo(() => {
    return [...new Set(vehicles.map((v) => v.make))].sort();
  }, [vehicles]);

  const filtered = useMemo(() => {
    let list = vehicles;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((v) =>
        `${v.year} ${v.make} ${v.model} ${v.trim} ${v.exterior_color} ${v.dealer_name}`
          .toLowerCase()
          .includes(needle),
      );
    }
    if (make) list = list.filter((v) => v.make === make);
    if (dealerId) list = list.filter((v) => v.dealership_id === dealerId);
    if (monthly) {
      list = list.filter((v) => inMonthlyRange(v.monthly_payment_cents, monthly));
    }
    return list;
  }, [vehicles, q, make, dealerId, monthly]);

  const hasFilters = Boolean(q || make || dealerId || monthly);
  const clearFilters = () => {
    setQ("");
    setMake("");
    setDealerId("");
    setMonthly("");
  };

  const rangeHint =
    "All ranges assume 20% down · residual by term (25→63% · 37→52% · 49→41% · 61→32%)";

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-col gap-3 sm:mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="h-10 min-w-[10rem] flex-1 rounded-full border border-border bg-surface px-4 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 sm:max-w-xs"
          />
          <select
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className="h-10 rounded-full border border-border bg-surface px-3 text-sm text-fg outline-none"
          >
            <option value="">All makes</option>
            {makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={dealerId}
            onChange={(e) => setDealerId(e.target.value)}
            className="h-10 max-w-[12rem] rounded-full border border-border bg-surface px-3 text-sm text-fg outline-none"
          >
            <option value="">All dealers</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={monthly}
            onChange={(e) => setMonthly(e.target.value as MonthlyRangeId | "")}
            className="h-10 rounded-full border border-border bg-surface px-3 text-sm text-fg outline-none"
          >
            <option value="">Monthly pmnt</option>
            {MONTHLY_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-10 items-center gap-1 rounded-full border border-border px-3 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-3.5" />
              Clear
            </button>
          )}
        </div>
        <p className="text-[11px] text-fg-subtle">{rangeHint}</p>
        {stats && (
          <p className="text-[11px] text-fg-subtle">
            {stats.total} cars · {stats.dealers} dealers
            {filtered.length !== vehicles.length ? ` · showing ${filtered.length}` : ""}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center text-fg-muted">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-border bg-surface px-6 py-16 text-center">
          <p className="text-sm text-fg-muted">No vehicles match these filters.</p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 text-sm font-medium text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {filtered.map((v, i) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              index={i}
              expanded={expandedId === v.id}
              onToggleLease={() => setExpandedId((id) => (id === v.id ? null : v.id))}
              quoteSettings={quoteSettings}
            />
          ))}
        </div>
      )}
    </div>
  );
}

void cn;
