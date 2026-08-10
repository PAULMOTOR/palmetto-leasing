import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { VehicleCard } from "@/components/inventory/vehicle-card";
import {
  MONTHLY_RANGES,
  type MonthlyRangeId,
  type QuoteSettings,
  inMonthlyRange,
} from "@/lib/leasing/calc";
import { listVehicles } from "@/lib/leasing/queries";
import { getQuoteSettings } from "@/lib/leasing/settings";
import type { VehicleCard as VehicleCardType } from "@/lib/leasing/types";
import { formatNumber, cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: InventoryFunnel,
  head: () => ({
    meta: [{ title: "Palmetto | Paul Motor Leasing" }],
  }),
});

function InventoryFunnel() {
  const [vehicles, setVehicles] = useState<VehicleCardType[]>([]);
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettings | undefined>();
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [monthlyRange, setMonthlyRange] = useState<MonthlyRangeId | "">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listVehicles({ data: { sort: "price_desc" } }), getQuoteSettings()])
      .then(([rows, qs]) => {
        if (cancelled) return;
        setVehicles(rows);
        setQuoteSettings(qs);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const years = useMemo(
    () => Array.from(new Set(vehicles.map((v) => String(v.year)))).sort().reverse(),
    [vehicles],
  );
  const makes = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.make))).sort(),
    [vehicles],
  );
  const models = useMemo(() => {
    const pool = make ? vehicles.filter((v) => v.make === make) : vehicles;
    return Array.from(new Set(pool.map((v) => v.model))).sort();
  }, [vehicles, make]);

  const filtersActive = Boolean(year || make || model || monthlyRange);

  function clearFilters() {
    setYear("");
    setMake("");
    setModel("");
    setMonthlyRange("");
  }

  const filtered = useMemo(() => {
    let list = [...vehicles];
    if (year) list = list.filter((v) => String(v.year) === year);
    if (make) list = list.filter((v) => v.make === make);
    if (model) list = list.filter((v) => v.model === model);
    if (monthlyRange) {
      list = list.filter((v) => inMonthlyRange(v.monthly_payment_cents, monthlyRange));
    }
    return list;
  }, [vehicles, year, make, model, monthlyRange]);

  const downNote = quoteSettings
    ? `All ranges assume ${(quoteSettings.downPaymentRate * 100).toFixed(0)}% downpayment · ${(quoteSettings.residualRate * 100).toFixed(0)}% residual · ${quoteSettings.termMonths} months`
    : "All ranges assume 20% downpayment · 50% residual · 36 months";

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
      <p className="mb-3 text-sm text-fg-muted">
        {loading ? "…" : `${formatNumber(filtered.length)} Available Vehicles`}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/70 pb-3 sm:gap-x-8">
        <FilterSelect
          label="Year"
          value={year}
          onChange={setYear}
          options={years.map((y) => ({ value: y, label: y }))}
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
          value={monthlyRange}
          onChange={(v) => setMonthlyRange(v as MonthlyRangeId | "")}
          options={MONTHLY_RANGES.map((r) => ({ value: r.id, label: r.label }))}
          active={Boolean(monthlyRange)}
        />
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </button>
        )}
      </div>
      <p className="mb-6 text-[11px] text-fg-subtle">{downNote}</p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-[var(--radius-xl)] bg-surface"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] bg-surface px-6 py-20 text-center">
          <p className="text-sm text-fg-muted">No vehicles match.</p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-sm font-medium text-accent hover:underline"
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
              onToggleLease={() =>
                setExpandedId((cur) => (cur === v.id ? null : v.id))
              }
              quoteSettings={quoteSettings}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  active,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  active?: boolean;
}) {
  const isActive = active ?? Boolean(value);
  return (
    <label className="relative inline-flex items-center gap-1 text-sm text-fg-muted">
      <span className={cn(isActive && "text-fg")}>{label}</span>
      <ChevronDown className="size-3.5 opacity-50" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
