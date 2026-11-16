import { useGetTickerPerformance, getGetTickerPerformanceQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, LineChart, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import TickerSearch from "@/components/stock/TickerSearch";
import CagrView from "./CagrView";
import GrowthView from "./GrowthView";
import HeatmapView from "./HeatmapView";
import RollingView from "./RollingView";
import { fmtDate } from "./perf-shared";

export const PERFORMANCE_VIEWS = ["cagr", "growth", "heatmap", "rolling"] as const;
export type PerformanceView = (typeof PERFORMANCE_VIEWS)[number];
export function parsePerformanceView(v: string | null): PerformanceView {
  return (PERFORMANCE_VIEWS as readonly string[]).includes(v ?? "") ? (v as PerformanceView) : "cagr";
}

const LABELS: Record<PerformanceView, string> = {
  cagr: "CAGR",
  growth: "Historical Investment Growth",
  heatmap: "Monthly & Annual Returns Heat Map",
  rolling: "Rolling Returns",
};

export default function PerformanceLab({ symbol, view, onViewChange, onTickerChange }: {
  symbol?: string;
  view: PerformanceView;
  onViewChange: (v: PerformanceView) => void;
  onTickerChange: (s: string) => void;
}) {
  const sym = symbol ?? "";
  const q = useGetTickerPerformance(sym, { query: { enabled: !!sym, queryKey: getGetTickerPerformanceQueryKey(sym), staleTime: 10 * 60 * 1000, retry: 1 } });

  return (
    <div className="space-y-5" data-testid="panel-performance">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Performance</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-performance-symbol">{sym || "Choose a ticker"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Long-run return consistency on adjusted closes.</p>
        </div>
        <div className="w-full md:max-w-md">
          <TickerSearch size="sm" onSelect={onTickerChange} buttonLabel="Analyze" placeholder="Compare another ticker, e.g. MSFT" />
        </div>
      </div>

      {!sym ? (
        <EmptyState />
      ) : (
        <Tabs value={view} onValueChange={(v) => onViewChange(v as PerformanceView)}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0.5 border border-border bg-card p-1 lg:inline-flex lg:w-auto">
            {(Object.keys(LABELS) as PerformanceView[]).map((k) => (
              <TabsTrigger key={k} value={k} data-testid={`tab-performance-${k}`} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{LABELS[k]}</TabsTrigger>
            ))}
          </TabsList>
          <div className="mt-5">
            {q.isLoading ? <LoadingState /> : q.isError ? (
              <ErrorState symbol={sym} onRetry={() => q.refetch()} retrying={q.isFetching} />
            ) : !q.data || q.data.stock.prices.length < 2 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center" data-testid="status-performance-empty">
                <LineChart className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-3 font-semibold">No adjusted price history for {sym}</p>
                <p className="mt-1 text-sm text-muted-foreground">Check the symbol or try another ticker above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {q.data.warnings.length > 0 && (
                  <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="list-performance-warnings">
                    {q.data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
                <TabsContent value="cagr" className="mt-0"><CagrView key={sym} symbol={sym} prices={q.data.stock.prices} /></TabsContent>
                <TabsContent value="growth" className="mt-0"><GrowthView symbol={sym} currency={q.data.stock.currency} prices={q.data.stock.prices} benchmark={q.data.benchmark?.prices.length ? q.data.benchmark.prices : null} /></TabsContent>
                <TabsContent value="heatmap" className="mt-0"><HeatmapView prices={q.data.stock.prices} asOf={q.data.fetchedAt.slice(0, 10)} /></TabsContent>
                <TabsContent value="rolling" className="mt-0"><RollingView symbol={sym} prices={q.data.stock.prices} /></TabsContent>
                <p className="text-[11px] text-muted-foreground" data-testid="text-performance-basis">
                  Basis: {q.data.returnBasis}. Data {fmtDate(q.data.stock.prices[0].date)} to {fmtDate(q.data.stock.prices[q.data.stock.prices.length - 1].date)}{q.data.stock.currency ? `, ${q.data.stock.currency}` : ""}. Fetched {new Date(q.data.fetchedAt).toLocaleString()}. Not investment advice.
                </p>
              </div>
            )}
          </div>
        </Tabs>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5" data-testid="status-performance-loading" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

function ErrorState({ symbol, onRetry, retrying }: { symbol: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-card p-8 text-center" data-testid="status-performance-error">
      <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
      <p className="mt-3 font-semibold">Could not load performance history for {symbol}</p>
      <p className="mt-1 text-sm text-muted-foreground">The price provider did not respond or the symbol is unknown.</p>
      <button type="button" onClick={onRetry} disabled={retrying} data-testid="button-performance-retry" className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} /> Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center" data-testid="status-performance-no-ticker">
      <LineChart className="mx-auto h-8 w-8 text-primary" />
      <p className="mt-3 text-lg font-semibold">Pick a ticker to measure its returns</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">CAGR across custom dates, growth of 10,000 against the S&P 500, monthly heat maps and rolling returns.</p>
    </div>
  );
}
