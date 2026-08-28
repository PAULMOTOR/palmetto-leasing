import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { z } from "zod";
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
import { getQuoteSettings } from "@/lib/leasing/settings";
import type { VehicleCard as VehicleCardType } from "@/lib/leasing/types";
import { cn } from "@/lib/utils";
import { canonicalMake, uniqueCanonicalMakes } from "@/lib/leasing/makes";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) =>
    z
      .object({
        dealer: z.string().optional(),
      })
      .parse({
        dealer:
          typeof search.dealer === "string" && /^[a-z0-9-]{2,64}$/i.test(search.dealer)
            ? search.dealer.toLowerCase()
            : undefined,
      }),
  component: InventoryPage,
});

/** Hide filters after this much idle while scrolled down; re-show on scroll. */
const FILTER_IDLE_MS = 1200;
/** Stay fully visible while near the top of the page. */
const TOP_ALWAYS_VISIBLE_PX = 48;
/** Cards per page. Full catalog stays in memory so filters still run over every car. */
const PAGE_SIZE = 24;

function InventoryPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const [vehicles, setVehicles] = useState<VehicleCardType[]>([]);
  const [stats, setStats] = useState<{ total: number } | null>(null);
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [monthly, setMonthly] = useState<MonthlyRangeId | "">("");
  const [dealer, setDealer] = useState(search.dealer || "");

  const [filtersVisible, setFiltersVisible] = useState(true);
  const [filterPinned, setFilterPinned] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastY = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [list, st, qs] = await Promise.all([
          listVehicles({ data: { sort: "price_desc" } }),
          getInventoryStats(),
          getQuoteSettings().catch(() => DEFAULT_QUOTE_SETTINGS),
        ]);
        if (cancelled) return;
        setVehicles(list);
        setStats({ total: st.total });
        setQuoteSettings(qs);
        void bootstrapInventory();
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

  const dealers = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehicles) {
      if (!v.dealership_id || map.has(v.dealership_id)) continue;
      map.set(v.dealership_id, v.dealer_name || v.dealership_id);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [vehicles]);

  const dealerPool = useMemo(() => {
    if (!dealer) return vehicles;
    return vehicles.filter((v) => v.dealership_id === dealer);
  }, [vehicles, dealer]);

  const years = useMemo(
    () => [...new Set(dealerPool.map((v) => v.year))].sort((a, b) => b - a),
    [dealerPool],
  );
  const makes = useMemo(
    () => uniqueCanonicalMakes(dealerPool.map((v) => v.make)),
    [dealerPool],
  );
  const models = useMemo(() => {
    const pool = make
      ? dealerPool.filter((v) => canonicalMake(v.make) === make)
      : dealerPool;
    return [...new Set(pool.map((v) => v.model))].sort();
  }, [dealerPool, make]);

  const filtered = useMemo(() => {
    let list = dealerPool;
    if (year) list = list.filter((v) => String(v.year) === year);
    if (make) list = list.filter((v) => canonicalMake(v.make) === make);
    if (model) list = list.filter((v) => v.model === model);
    if (monthly) list = list.filter((v) => inMonthlyRange(v.monthly_payment_cents, monthly));
    return list;
  }, [dealerPool, year, make, model, monthly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart],
  );
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [dealer, year, make, model, monthly]);

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), pageCount);
    if (clamped === currentPage) return;
    setPage(clamped);
    setExpandedId(null);
    requestAnimationFrame(() => {
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const setDealerParam = (slug: string) => {
    void navigate({
      search: { dealer: slug || undefined },
      replace: true,
    });
  };

  const hasFilters = Boolean(dealer || year || make || model || monthly);
  const heroThumbs = useMemo(
    () => paged.slice(0, 3).map((v) => v.thumbnail_url).filter(Boolean),
    [paged],
  );
  const clearFilters = () => {
    setDealer("");
    setYear("");
    setMake("");
    setModel("");
    setMonthly("");
    setDealerParam("");
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-10 sm:px-6">
      <HeroImagePreloads urls={heroThumbs} />
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 top-[4.75rem] z-30 sm:top-[5.25rem]",
        )}
        aria-hidden={!filtersVisible}
      >
        <div className="pointer-events-none mx-auto max-w-[1280px] px-4 sm:px-6">
          <div
            className={cn(
              "pointer-events-auto origin-top border-b bg-[var(--color-canvas,#f3f3f3)]/95 px-4 py-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] backdrop-blur-md will-change-transform sm:px-6",
              filtersVisible
                ? "border-border/70"
                : "border-transparent pointer-events-none",
            )}
            style={{
              transform: filtersVisible
                ? "translate3d(0, 0, 0)"
                : "translate3d(0, calc(-100% - 12px), 0)",
              opacity: filtersVisible ? 1 : 0,
              transition:
                "transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
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
              {!loading && filtered.length > PAGE_SIZE ? (
                <span className="text-fg-subtle">
                  {" "}
                  · {rangeFrom}–{rangeTo}
                </span>
              ) : null}
            </p>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/50 pb-3">
              <FilterSelect
                label="Dealer"
                value={dealer}
                onChange={(v) => {
                  setDealer(v);
                  setYear("");
                  setMake("");
                  setModel("");
                  setDealerParam(v);
                }}
                options={dealers}
              />
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
        </div>
      </div>

      <div className="pt-[5.5rem] sm:pt-24">
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
          <div
            ref={gridRef}
            id="inventory-grid"
            className="scroll-mt-36 sm:scroll-mt-44"
          >
            <div
              key={currentPage}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
            >
              {paged.map((v, i) => (
                <VehicleCard
                  key={v.id}
                  vehicle={v}
                  index={i}
                  expanded={expandedId === v.id}
                  onToggleLease={() => {
                    setExpandedId((id) => {
                      const next = id === v.id ? null : v.id;
                      setDealerParam(next ? v.dealership_id : dealer);
                      return next;
                    });
                  }}
                  quoteSettings={quoteSettings}
                />
              ))}
            </div>
            {pageCount > 1 ? (
              <InventoryPager
                page={currentPage}
                pageCount={pageCount}
                from={rangeFrom}
                to={rangeTo}
                total={filtered.length}
                onPage={goToPage}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function paginationItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("ellipsis");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}

function InventoryPager({
  page,
  pageCount,
  from,
  to,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onPage: (n: number) => void;
}) {
  const items = paginationItems(page, pageCount);
  return (
    <nav
      className="mt-8 flex flex-col items-center gap-3 sm:mt-10"
      aria-label="Inventory pages"
    >
      <p className="text-[13px] text-fg-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="inline-flex size-10 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>

        <p className="min-w-[7.5rem] text-center text-[13px] text-fg sm:hidden">
          Page {page} of {pageCount}
        </p>

        <div className="hidden items-center gap-0.5 sm:flex">
          {items.map((item, i) =>
            item === "ellipsis" ? (
              <span
                key={`e-${i}`}
                className="inline-flex h-10 min-w-8 items-center justify-center px-1 text-[13px] text-fg-subtle"
                aria-hidden
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPage(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-[13px] transition-colors",
                  item === page
                    ? "bg-primary text-primary-fg"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {item}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className="inline-flex size-10 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

function HeroImagePreloads({ urls }: { urls: string[] }) {
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    urls.slice(0, 3).forEach((href, i) => {
      if (!href || href.startsWith("data:")) return;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = href;
      link.setAttribute("fetchpriority", "high");
      if (i === 1) link.media = "(min-width: 640px)";
      if (i === 2) link.media = "(min-width: 1024px)";
      document.head.appendChild(link);
      links.push(link);
    });
    return () => {
      for (const link of links) link.remove();
    };
  }, [urls.join("\n")]);
  return null;
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
