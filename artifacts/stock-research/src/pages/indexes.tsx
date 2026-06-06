import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Search, TrendingUp, BarChart2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetIndexSp500,    getGetIndexSp500QueryKey,
  useGetIndexNasdaq100, getGetIndexNasdaq100QueryKey,
  useGetIndexSp400,    getGetIndexSp400QueryKey,
  useGetIndexSp600,    getGetIndexSp600QueryKey,
  useGetIndexDjia,     getGetIndexDjiaQueryKey,
  useGetIndexAdrs,     getGetIndexAdrsQueryKey,
} from "@workspace/api-client-react";

// ─── Color palette (GICS sectors + ADR countries) ────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  // GICS sectors (US indexes)
  "Information Technology":  "bg-blue-500/10 text-blue-600 border-blue-200",
  "Health Care":             "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  "Financials":              "bg-amber-500/10 text-amber-700 border-amber-200",
  "Consumer Discretionary":  "bg-orange-500/10 text-orange-600 border-orange-200",
  "Communication Services":  "bg-violet-500/10 text-violet-600 border-violet-200",
  "Industrials":             "bg-sky-500/10 text-sky-600 border-sky-200",
  "Consumer Staples":        "bg-lime-500/10 text-lime-700 border-lime-200",
  "Energy":                  "bg-red-500/10 text-red-600 border-red-200",
  "Utilities":               "bg-teal-500/10 text-teal-600 border-teal-200",
  "Real Estate":             "bg-pink-500/10 text-pink-600 border-pink-200",
  "Materials":               "bg-stone-500/10 text-stone-600 border-stone-200",
  // Countries (ADR tab)
  "United Kingdom":          "bg-blue-600/10 text-blue-700 border-blue-300",
  "Japan":                   "bg-red-600/10 text-red-700 border-red-300",
  "China":                   "bg-rose-500/10 text-rose-700 border-rose-300",
  "Canada":                  "bg-red-400/10 text-red-600 border-red-200",
  "India":                   "bg-orange-600/10 text-orange-700 border-orange-300",
  "Brazil":                  "bg-green-600/10 text-green-700 border-green-300",
  "Australia":               "bg-yellow-600/10 text-yellow-700 border-yellow-300",
  "Germany":                 "bg-gray-600/10 text-gray-700 border-gray-300",
  "France":                  "bg-indigo-500/10 text-indigo-700 border-indigo-300",
  "Switzerland":             "bg-red-500/10 text-red-600 border-red-200",
  "Netherlands":             "bg-orange-500/10 text-orange-700 border-orange-300",
  "South Korea":             "bg-cyan-500/10 text-cyan-700 border-cyan-300",
  "Taiwan":                  "bg-teal-600/10 text-teal-700 border-teal-300",
  "Hong Kong":               "bg-purple-500/10 text-purple-700 border-purple-300",
  "Mexico":                  "bg-green-500/10 text-green-700 border-green-300",
  "Spain":                   "bg-yellow-500/10 text-yellow-700 border-yellow-300",
  "Israel":                  "bg-blue-400/10 text-blue-600 border-blue-200",
  "Sweden":                  "bg-sky-600/10 text-sky-700 border-sky-300",
  "Denmark":                 "bg-rose-600/10 text-rose-700 border-rose-300",
  "Ireland":                 "bg-emerald-600/10 text-emerald-700 border-emerald-300",
  "Singapore":               "bg-pink-600/10 text-pink-700 border-pink-300",
  "Argentina":               "bg-cyan-400/10 text-cyan-600 border-cyan-200",
  "Chile":                   "bg-red-300/10 text-red-600 border-red-200",
  "Colombia":                "bg-yellow-400/10 text-yellow-600 border-yellow-200",
  "South Africa":            "bg-lime-600/10 text-lime-700 border-lime-300",
  "Russia":                  "bg-stone-600/10 text-stone-700 border-stone-300",
  "Italy":                   "bg-green-400/10 text-green-600 border-green-200",
  "Finland":                 "bg-sky-400/10 text-sky-600 border-sky-200",
  "Norway":                  "bg-blue-300/10 text-blue-600 border-blue-200",
  "Belgium":                 "bg-amber-600/10 text-amber-700 border-amber-300",
  "Portugal":                "bg-lime-500/10 text-lime-600 border-lime-200",
};

function sectorColor(sector: string) {
  return SECTOR_COLORS[sector] ?? "bg-muted text-muted-foreground border-border";
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function TickerGrid({ stocks }: { stocks: { symbol: string; name: string; sector: string; industry?: string }[] }) {
  const [, setLocation] = useLocation();
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}
    >
      {stocks.map((s) => (
        <Tooltip key={s.symbol} delayDuration={120}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setLocation(`/stock/${s.symbol}`)}
              className={`
                px-2 py-2 rounded-md border text-xs font-mono font-semibold
                tracking-tight text-center transition-all duration-100
                hover:scale-105 hover:shadow-sm hover:z-10
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                cursor-pointer ${sectorColor(s.sector)}
              `}
            >
              {s.symbol}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-center">
            <p className="font-semibold text-sm">{s.name}</p>
            {s.sector && <p className="text-xs text-muted-foreground mt-0.5">{s.sector}</p>}
            {s.industry && <p className="text-xs text-muted-foreground/75 mt-0.5">{s.industry}</p>}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function SectorLegend({ sectors }: { sectors: string[] }) {
  if (sectors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {sectors.map((sector) => (
        <span
          key={sector}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${sectorColor(sector)}`}
        >
          {sector}
        </span>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}
    >
      {Array.from({ length: 60 }).map((_, i) => (
        <Skeleton key={i} className="h-9 rounded-md" />
      ))}
    </div>
  );
}

// ─── Per-tab content (owns its own filter/sector state) ───────────────────────

interface IndexTabContentProps {
  stocks: { symbol: string; name: string; sector: string }[];
  isLoading: boolean;
  isError: boolean;
  indexName: string;
  fetchedAt?: string;
  legendLabel?: string;
  source?: string;
}

function IndexTabContent({ stocks, isLoading, isError, indexName, fetchedAt, legendLabel, source }: IndexTabContentProps) {
  const [filterText, setFilterText]       = useState("");
  const [activeSector, setActiveSector]   = useState<string | null>(null);
  const [showSectors, setShowSectors]     = useState(false);

  const sectors = useMemo(
    () =>
      Array.from(new Set(stocks.map((s) => s.sector).filter(Boolean))).sort(),
    [stocks],
  );

  const filtered = useMemo(() => {
    let list = stocks;
    if (activeSector) list = list.filter((s) => s.sector === activeSector);
    if (filterText.trim()) {
      const q = filterText.trim().toUpperCase();
      list = list.filter(
        (s) => s.symbol.toUpperCase().includes(q) || s.name.toUpperCase().includes(q),
      );
    }
    return list;
  }, [stocks, activeSector, filterText]);

  const sectorActive = activeSector !== null;

  return (
    <div>
      {/* ── Filter ribbon ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0">
          Filter by
        </span>

        {/* Symbol / name search */}
        <div className="relative w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Symbol or name…"
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>

        {/* Sector toggle */}
        <button
          onClick={() => setShowSectors((v) => !v)}
          className={`inline-flex items-center gap-1 px-3 h-8 rounded-md border text-xs font-medium transition-colors ${
            showSectors || sectorActive
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          {legendLabel === "Color by Country" ? "Country" : "Sector"}
          {sectorActive && !showSectors && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-current opacity-70" />
          )}
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-150 ${showSectors ? "rotate-180" : ""}`}
          />
        </button>

        {/* ── future screener buttons land here ── */}

        <span className="ml-auto text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `${filtered.length} constituents`}
        </span>
      </div>

      {/* ── Collapsible sector / country pills ────────────────────────── */}
      {showSectors && (
        <div className="flex flex-wrap gap-1.5 pt-2 pb-3 border-t border-border mt-1">
          <button
            onClick={() => setActiveSector(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeSector === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
            }`}
          >
            All
          </button>
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSector(activeSector === s ? null : s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeSector === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : `${sectorColor(s)} hover:opacity-80`
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="rounded-xl border border-border bg-card p-4">
        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground text-sm">
              Could not load {indexName} data.{" "}
              {source
                ? `The server may still be fetching from ${source}.`
                : "The server may still be fetching from Wikipedia."}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No tickers match your filter.
          </div>
        ) : (
          <TickerGrid stocks={filtered} />
        )}
      </div>

      {/* Legend */}
      {!isLoading && !isError && sectors.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
            {legendLabel ?? "Color by GICS Sector"}
          </p>
          <SectorLegend sectors={sectors} />
        </div>
      )}

      {fetchedAt && (
        <p className="text-xs text-muted-foreground mt-3">
          Source: {source ?? "Wikipedia"} · as of{" "}
          {new Date(fetchedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STALE_TIME = 24 * 60 * 60 * 1000;

export default function StockIndexes() {
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setLocation(`/stock/${searchInput.trim().toUpperCase()}`);
      setSearchInput("");
    }
  };

  const sp500    = useGetIndexSp500(   { query: { queryKey: getGetIndexSp500QueryKey(),    staleTime: STALE_TIME } });
  const nasdaq100= useGetIndexNasdaq100({ query: { queryKey: getGetIndexNasdaq100QueryKey(), staleTime: STALE_TIME } });
  const sp400    = useGetIndexSp400(   { query: { queryKey: getGetIndexSp400QueryKey(),    staleTime: STALE_TIME } });
  const sp600    = useGetIndexSp600(   { query: { queryKey: getGetIndexSp600QueryKey(),    staleTime: STALE_TIME } });
  const djia     = useGetIndexDjia(    { query: { queryKey: getGetIndexDjiaQueryKey(),     staleTime: STALE_TIME } });
  const adrs     = useGetIndexAdrs(    { query: { queryKey: getGetIndexAdrsQueryKey(),     staleTime: STALE_TIME } });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Ribbon */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground tracking-tight">Terminal</span>
          </div>

          <nav className="flex items-center gap-1">
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none">
              Stock Screens
            </span>
            <Link
              href="/stock/AAPL"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Stock Insights
            </Link>
            <Link
              href="/macro"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Macro Summary
            </Link>
          </nav>

          <div className="flex-1" />

          <form onSubmit={handleSearch} className="relative w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="Symbol…"
              className="w-full pl-9 bg-background border-border font-mono h-9 uppercase text-sm"
            />
          </form>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <BarChart2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Stock Screens</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse and screen index constituents — click any ticker to open its research page
          </p>
        </div>

        <Tabs defaultValue="sp500">
          <TabsList className="mb-4">
            <TabsTrigger value="sp500">S&amp;P 500</TabsTrigger>
            <TabsTrigger value="nasdaq100">Nasdaq-100</TabsTrigger>
            <TabsTrigger value="sp400">S&amp;P MidCap 400</TabsTrigger>
            <TabsTrigger value="sp600">S&amp;P SmallCap 600</TabsTrigger>
            <TabsTrigger value="djia">Dow Jones</TabsTrigger>
            <TabsTrigger value="adrs">Top ADRs</TabsTrigger>
          </TabsList>

          <TabsContent value="sp500">
            <IndexTabContent
              stocks={sp500.data?.stocks ?? []}
              isLoading={sp500.isLoading}
              isError={sp500.isError}
              indexName="S&P 500"
              fetchedAt={sp500.data?.fetchedAt}
            />
          </TabsContent>

          <TabsContent value="nasdaq100">
            <IndexTabContent
              stocks={nasdaq100.data?.stocks ?? []}
              isLoading={nasdaq100.isLoading}
              isError={nasdaq100.isError}
              indexName="Nasdaq-100"
              fetchedAt={nasdaq100.data?.fetchedAt}
            />
          </TabsContent>

          <TabsContent value="sp400">
            <IndexTabContent
              stocks={sp400.data?.stocks ?? []}
              isLoading={sp400.isLoading}
              isError={sp400.isError}
              indexName="S&P MidCap 400"
              fetchedAt={sp400.data?.fetchedAt}
            />
          </TabsContent>

          <TabsContent value="sp600">
            <IndexTabContent
              stocks={sp600.data?.stocks ?? []}
              isLoading={sp600.isLoading}
              isError={sp600.isError}
              indexName="S&P SmallCap 600"
              fetchedAt={sp600.data?.fetchedAt}
            />
          </TabsContent>

          <TabsContent value="djia">
            <IndexTabContent
              stocks={djia.data?.stocks ?? []}
              isLoading={djia.isLoading}
              isError={djia.isError}
              indexName="Dow Jones Industrial Average"
              fetchedAt={djia.data?.fetchedAt}
            />
          </TabsContent>

          <TabsContent value="adrs">
            <IndexTabContent
              stocks={adrs.data?.stocks ?? []}
              isLoading={adrs.isLoading}
              isError={adrs.isError}
              indexName="Top ADRs"
              fetchedAt={adrs.data?.fetchedAt}
              legendLabel="Color by Country"
              source="BNY Mellon DR Directory"
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
