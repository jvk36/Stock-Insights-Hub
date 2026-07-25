import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, TrendingUp, ChevronLeft, ChevronRight, Building2, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  useList13fFunds,
  getList13fFundsQueryKey,
  useGet13fFundQuarters,
  getGet13fFundQuartersQueryKey,
  useGet13fFundHoldings,
  getGet13fFundHoldingsQueryKey,
  type ThirteenFHoldingRow,
  type HedgeFund,
} from "@workspace/api-client-react";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollars(val: number | null | undefined): string {
  if (val == null) return "—";
  const abs = Math.abs(val);
  if (abs >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(val / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function fmtShares(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString("en-US");
}

function fmtPct(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  return `${val.toFixed(decimals)}%`;
}

function fmtChange(val: number | null | undefined): string {
  if (val == null) return "New";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

const COLOR_CLASSES: Record<string, { cell: string; badge: string }> = {
  new:           { cell: "bg-green-50 dark:bg-green-950/30",    badge: "text-green-700 dark:text-green-400 font-semibold" },
  "increase-high": { cell: "bg-blue-50 dark:bg-blue-950/30",   badge: "text-blue-700 dark:text-blue-400 font-semibold" },
  "increase-low":  { cell: "bg-sky-50/60 dark:bg-sky-950/20",  badge: "text-sky-700 dark:text-sky-400 font-semibold" },
  "decrease-high": { cell: "bg-pink-50 dark:bg-pink-950/30",   badge: "text-pink-700 dark:text-pink-400 font-semibold" },
  "decrease-low":  { cell: "bg-rose-50/60 dark:bg-rose-950/20",badge: "text-rose-700 dark:text-rose-400 font-semibold" },
  "":            { cell: "",                                    badge: "text-foreground" },
};

function cellBg(colorClass: string): string {
  return COLOR_CLASSES[colorClass]?.cell ?? "";
}
function badgeStyle(colorClass: string): string {
  return COLOR_CLASSES[colorClass]?.badge ?? "text-foreground";
}

// ─── Holdings table ───────────────────────────────────────────────────────────

function HoldingsTable({
  rows,
  currentQ,
  priorQ,
}: {
  rows: ThirteenFHoldingRow[];
  currentQ: string;
  priorQ: string | null | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/50 z-10 min-w-[180px]">
              Name (Ticker)
            </th>
            <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[110px]">
              Mkt Value<br /><span className="font-normal opacity-70">{currentQ}</span>
            </th>
            <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[120px]">
              Shares<br /><span className="font-normal opacity-70">{currentQ}</span>
            </th>
            <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
              % Alloc<br /><span className="font-normal opacity-70">{currentQ}</span>
            </th>
            {priorQ && (
              <>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[110px]">
                  Mkt Value<br /><span className="font-normal opacity-70">{priorQ}</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[120px]">
                  Shares<br /><span className="font-normal opacity-70">{priorQ}</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
                  % Alloc<br /><span className="font-normal opacity-70">{priorQ}</span>
                </th>
              </>
            )}
            <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
              % Change<br /><span className="font-normal opacity-70">Shares</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const bg = cellBg(row.colorClass);
            const badge = badgeStyle(row.colorClass);
            return (
              <tr
                key={`${row.name}-${i}`}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                {/* Name (Ticker) — color-coded */}
                <td className={`px-3 py-2 sticky left-0 z-10 ${bg}`}>
                  <span className={`font-medium ${badge}`}>
                    {row.name}
                    {row.ticker && (
                      <span className="ml-1 font-mono text-[10px] opacity-80">({row.ticker})</span>
                    )}
                  </span>
                </td>
                {/* Current Market Value */}
                <td className="px-3 py-2 text-right tabular-nums font-mono">
                  {fmtDollars(row.currentMarketValue)}
                </td>
                {/* Current Shares */}
                <td className="px-3 py-2 text-right tabular-nums font-mono">
                  {fmtShares(row.currentShares)}
                </td>
                {/* Current % Allocation */}
                <td className="px-3 py-2 text-right tabular-nums font-mono">
                  {fmtPct(row.currentPctAllocation)}
                </td>
                {/* Prior quarter columns */}
                {priorQ && (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-muted-foreground">
                      {fmtDollars(row.priorMarketValue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-muted-foreground">
                      {fmtShares(row.priorShares)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-muted-foreground">
                      {fmtPct(row.priorPctAllocation)}
                    </td>
                  </>
                )}
                {/* % Change — color-coded */}
                <td className={`px-3 py-2 text-right tabular-nums ${bg}`}>
                  <span className={badge}>
                    {row.colorClass === "new" ? "New" : fmtChange(row.pctChangeShares)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Holdings view (fund selected) ───────────────────────────────────────────

function FundHoldingsView({
  cik,
  fundName,
  onBack,
}: {
  cik: string;
  fundName: string;
  onBack: () => void;
}) {
  const [quarterIndex, setQuarterIndex] = useState(0);

  const { data: quartersData, isLoading: quartersLoading } = useGet13fFundQuarters(cik, {
    query: {
      queryKey: getGet13fFundQuartersQueryKey(cik),
      enabled: !!cik,
      staleTime: 5 * 60 * 1000,
    },
  });

  const quarters = quartersData?.quarters ?? [];
  const currentQ = quarters[quarterIndex] ?? undefined;
  const priorQ   = quarters[quarterIndex + 1] ?? undefined;

  const canGoOlder = quarterIndex + 2 < quarters.length; // there's a prior quarter to priorQ
  const canGoNewer = quarterIndex > 0;

  const params = currentQ ? { currentQ, priorQ } : undefined;

  const { data: holdingsData, isLoading: holdingsLoading, isFetching } = useGet13fFundHoldings(
    cik,
    params,
    {
      query: {
        queryKey: getGet13fFundHoldingsQueryKey(cik, params),
        enabled: !!cik && !!currentQ,
        staleTime: 5 * 60 * 1000,
      },
    },
  );

  const isLoading = quartersLoading || (holdingsLoading && !holdingsData);

  return (
    <div className="space-y-4">
      {/* Back button + fund name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Funds
        </button>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold">{fundName}</h2>
        </div>
      </div>

      {/* Quarter navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setQuarterIndex((i) => i + 1)}
          disabled={!canGoOlder || quartersLoading}
          className="p-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Older quarter"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="text-sm font-medium min-w-[180px] text-center">
          {quartersLoading ? (
            <Skeleton className="h-5 w-40 mx-auto" />
          ) : currentQ ? (
            <span>
              <span className="text-foreground">{currentQ}</span>
              {priorQ && (
                <span className="text-muted-foreground"> vs {priorQ}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">No data available</span>
          )}
        </div>

        <button
          onClick={() => setQuarterIndex((i) => Math.max(0, i - 1))}
          disabled={!canGoNewer || quartersLoading}
          className="p-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Newer quarter"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {holdingsData && !holdingsData.seedingInProgress && (
          <span className="text-xs text-muted-foreground ml-2">
            {holdingsData.holdings.length} positions
            {holdingsData.currentTotalValue > 0 && (
              <> · Portfolio: {fmtDollars(holdingsData.currentTotalValue)}</>
            )}
          </span>
        )}

        {isFetching && !holdingsLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">Updating…</span>
        )}
      </div>

      {/* Holdings table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded" />
            ))}
          </div>
        ) : holdingsData?.seedingInProgress ? (
          <div className="py-20 text-center">
            <Building2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Loading 13F holdings from SEC EDGAR…</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              This takes a few minutes on the first load. Please check back shortly.
            </p>
          </div>
        ) : holdingsData && holdingsData.holdings.length > 0 ? (
          <HoldingsTable
            rows={holdingsData.holdings}
            currentQ={holdingsData.currentQ ?? currentQ ?? ""}
            priorQ={holdingsData.priorQ}
          />
        ) : (
          <div className="py-20 text-center">
            <p className="text-sm text-muted-foreground">No equity holdings found for this quarter.</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Color key:</span>
        {[
          { cls: "new",           label: "New position" },
          { cls: "increase-high", label: "≥10% increase" },
          { cls: "increase-low",  label: "<10% increase" },
          { cls: "decrease-low",  label: "<10% decrease" },
          { cls: "decrease-high", label: "≥10% decrease" },
        ].map(({ cls, label }) => (
          <span key={cls} className={`px-2 py-0.5 rounded border border-border ${cellBg(cls)} ${badgeStyle(cls)}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Fund list card ───────────────────────────────────────────────────────────

function FundListCard({ onSelectFund }: { onSelectFund: (cik: string, name: string) => void }) {
  const { data, isLoading, isError } = useList13fFunds({
    query: {
      queryKey: getList13fFundsQueryKey(),
      staleTime: 10 * 60 * 1000,
    },
  });

  const funds = data?.funds ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
        Top Hedge Funds
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Failed to load funds.</p>
      ) : funds.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No funds tracked yet.</p>
      ) : (
        <div className="space-y-1.5">
          {funds.map((fund: HedgeFund) => (
            <button
              key={fund.cik}
              onClick={() => onSelectFund(fund.cik, fund.name)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border/60 bg-background hover:bg-muted hover:border-border transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {fund.name}
                </p>
                <p className="text-xs text-muted-foreground">CIK {fund.cik}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ThirteenFInsights() {
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [selectedFund, setSelectedFund] = useState<{ cik: string; name: string } | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setLocation(`/stock/${searchInput.trim().toUpperCase()}`);
      setSearchInput("");
    }
  };

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
            <Link
              href="/indexes"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Stock Screens
            </Link>
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none">
              13F Insights
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-1"
        >
          <h1 className="text-3xl font-bold tracking-tight">13F Insights</h1>
          <p className="text-sm text-muted-foreground">
            Institutional holdings from SEC 13F-HR filings — updated quarterly
          </p>
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1">
            <TabsTrigger
              value="activity"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm"
            >
              Top Hedge Fund Activity
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="activity" className="mt-0">
              {selectedFund ? (
                <FundHoldingsView
                  cik={selectedFund.cik}
                  fundName={selectedFund.name}
                  onBack={() => setSelectedFund(null)}
                />
              ) : (
                <FundListCard
                  onSelectFund={(cik, name) => setSelectedFund({ cik, name })}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
