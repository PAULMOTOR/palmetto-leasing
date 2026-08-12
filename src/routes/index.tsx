import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Loader2, X } from "lucide-react";
import { VehicleCard } from "@/components/inventory/vehicle-card";
import {
  bootstrapInventory,
  getInventoryStats,
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

/** Hide filters after this much idle while scrolled down; re-show on scroll. */
const FILTER_IDLE_MS = 1200;
/** Stay fully visible while near the top of the page. */
const TOP_ALWAYS_VISIBLE_PX = 48;

function InventoryPage() {
  const [vehicles, setVehicles] = useState<VehicleCardType[]>([]);
  const [stats, setStats] = useState<{ total: number } | null>(null);
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [monthly, setMonthly] = useState<MonthlyRangeId | "">("");

  const [filtersVisible, setFiltersVisible] = useState(true);
  const [filterPinned, setFilterPinned] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastY = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await bootstrapInventory();
        const [list, st, qs] = await Promise.all([
          listVehicles({ data: { sort: "price_desc" } }),
          getInventoryStats(),
          loadQuoteSettingsAsync().catch(() => DEFAULT_QUOTE_SETTINGS),
        ]);
        if (cancelled) return;
        setVehicles(list);
        setStats({ total: st.total });
        setQuoteSettings(qs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    lastY.current = window.scrollY;

    const clearIdle = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = null;
    };

    const atTop = () => window.scrollY <= TOP_ALWAYS_VISIBLE_PX;

    const scheduleHide = () => {
      clearIdle();
      // Never auto-hide at the top of the page
      if (atTop() || filterPinned) {
        setFiltersVisible(true);
        return;
      }
      idleTimer.current = setTimeout(() => {
        if (!filterPinned && !atTop()) setFiltersVisible(false);
      }, FILTER_IDLE_MS);
    };

    const onScroll = () => {
      const y = window.scrollY;
      if (atTop()) {
        setFiltersVisible(true);
        clearIdle();
      } else if (Math.abs(y - lastY.current) > 2) {
        setFiltersVisible(true);
        scheduleHide();
      }
      lastY.current = y;
    };

    // Landing at top → always show
    if (atTop()) {
      setFiltersVisible(true);
    } else {
      scheduleHide();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearIdle();
    };
  }, [filterPinned]);

  useEffect(() => {
    if (filterPinned) {
      setFiltersVisible(true);
      return;
    }
    if (window.scrollY <= TOP_ALWAYS_VISIBLE_PX) {
      setFiltersVisible(true);
      return;
    }
    const t = setTimeout(() => {
      if (window.scrollY > TOP_ALWAYS_VISIBLE_PX) setFiltersVisible(false);
    }, FILTER_IDLE_MS);
    return () => clearTimeout(t);
  }, [filterPinned]);

  const years = useMemo(
    () => [...new Set(vehicles.map((v) => v.year))].sort((a, b) => b - a),
    [vehicles],
  );
  const makes = useMemo(
    () => [...new Set(vehicles.map((v) => v.make))].sort(),
    [vehicles],
  );
  const models = useMemo(() => {
    const pool = make ? vehicles.filter((v) => v.make === make) : vehicles;
    return [...new Set(pool.map((v) => v.model))].sort();
  }, [vehicles, make]);

  const filtered = useMemo(() => {
    let list = vehicles;
    if (year) list = list.filter((v) => String(v.year) === year);
    if (make) list = list.filter((v) => v.make === make);
    if (model) list = list.filter((v) => v.model === model);
    if (monthly) list = list.filter((v) => inMonthlyRange(v.monthly_payment_cents, monthly));
    return list;
  }, [vehicles, year, make, model, monthly]);

  const hasFilters = Boolean(year || make || model || monthly);
  const clearFilters = () => {
    setYear("");
    setMake("");
    setModel("");
    setMonthly("");
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-10 sm:px-6">
      <div
        className={cn(
          "sticky top-[4.75rem] z-30 -mx-4 overflow-hidden border-b bg-[var(--color-canvas,#f3f3f3)]/95 backdrop-blur-md transition-[max-height,opacity,padding,border-color] duration-300 ease-out sm:top-[5.25rem] sm:-mx-6",
          filtersVisible
            ? "max-h-40 border-border/70 px-4 py-4 opacity-100 sm:px-6"
            : "max-h-0 border-transparent px-4 py-0 opacity-0 pointer-events-none sm:px-6",
        )}
        onMouseEnter={() => setFilterPinned(true)}
        onMouseLeave={() => setFilterPinned(false)}
        onFocusCapture={() => setFilterPinned(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setFilterPinned(false);
          }
        }}
      >
        <p className="mb-2.5 text-[13px] text-fg-muted">
          {loading
            ? "Loading…"
            : `${filtered.length} Available Vehicle${filtered.length === 1 ? "" : "s"}`}
          {hasFilters && stats && filtered.length !== stats.total ? (
            <span className="text-fg-subtle"> · of {stats.total}</span>
          ) : null}
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/50 pb-3">
          <FilterSelect
            label="Year"
            value={year}
            onChange={setYear}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <FilterSelect
            label="Make"
            value={make}
            onChange={(v) => {
              setMake(v);
              setModel("");
            }}
            options={makes.map((m) => ({ value: m, label: m }))}
          />
          <FilterSelect
            label="Model"
            value={model}
            onChange={setModel}
            options={models.map((m) => ({ value: m, label: m }))}
          />
          <FilterSelect
            label="Monthly Pmnt"
            value={monthly}
            onChange={(v) => setMonthly(v as MonthlyRangeId | "")}
            options={MONTHLY_RANGES.map((r) => ({ value: r.id, label: r.label }))}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[13px] text-fg-muted transition-colors hover:text-fg"
            >
              <X className="size-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="pt-5 sm:pt-6">
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
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-1 text-[13px] text-fg-muted transition-colors hover:text-fg">
      <span className={cn("font-medium", value ? "text-fg" : "text-fg-muted")}>
        {value ? options.find((o) => o.value === value)?.label || value : label}
      </span>
      <ChevronDown className="size-3.5 opacity-50" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
