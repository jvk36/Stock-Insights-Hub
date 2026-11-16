import { useEffect, useMemo, useState } from "react";
import { useGetTickerPerformance, getGetTickerPerformanceQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import TickerSearch from "@/components/stock/TickerSearch";
import { resolvePeriod, subtractYears } from "@/lib/performance-calculations";
import { Notice, fmtDate } from "@/components/stock/performance/perf-shared";
import { RISK_LABELS, sliceRange } from "./risk-shared";
import type { RiskView } from "./risk-shared";
import RiskInfoPanel from "./RiskInfoPanel";
import DrawdownView from "./DrawdownView";
import VolatilityView from "./VolatilityView";
import RatiosView from "./RatiosView";
import CorrelationView from "./CorrelationView";

export default function RiskLab({ symbol, view, onViewChange, onTickerChange }: {
  symbol?: string; view: RiskView; onViewChange: (v: RiskView) => void; onTickerChange: (s: string) => void;
}) {
  const sym = symbol ?? "";
  const q = useGetTickerPerformance(sym, { query: { enabled: !!sym, queryKey: getGetTickerPerformanceQueryKey(sym), staleTime: 600000, retry: 1 } });
  const all = q.data?.stock.prices ?? [];
  const first = all[0]?.date ?? "", last = all[all.length - 1]?.date ?? "";
  const tenYr = last ? (subtractYears(last, 10) < first ? first : subtractYears(last, 10)) : "";
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  useEffect(() => { setStart(tenYr); setEnd(last); }, [sym, tenYr, last]);

  const period = useMemo(() => (all.length && start && end ? resolvePeriod(all, start, end) : null), [all, start, end]);
  const range = useMemo(() => (period?.ok ? sliceRange(all, period.start.date, period.end.date) : []), [all, period]);
  const preset = (y: number | null) => { setEnd(last); setStart(y === null ? first : (subtractYears(last, y) < first ? first : subtractYears(last, y))); };

  return (
    <div className="space-y-5" data-testid="panel-risk">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Risk Analysis</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-risk-symbol">{sym || "Choose a ticker"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drawdowns, volatility, risk-adjusted returns and co-movement, with every formula shown.</p>
        </div>
        <div className="w-full md:max-w-md"><TickerSearch size="sm" onSelect={onTickerChange} buttonLabel="Analyze" placeholder="Analyze another ticker, e.g. MSFT" /></div>
      </div>

      {!sym ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center" data-testid="status-risk-no-ticker">
          <ShieldAlert className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-lg font-semibold">Pick a ticker to see how much it has hurt, and how often</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Peak-to-trough episodes, volatility against index ETFs, Sharpe, Sortino and Calmar, plus beta to SPY.</p>
        </div>
      ) : (
        <Tabs value={view} onValueChange={(v) => onViewChange(v as RiskView)}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0.5 border border-border bg-card p-1 lg:inline-flex lg:w-auto">
            {(Object.keys(RISK_LABELS) as RiskView[]).map((k) => (
              <TabsTrigger key={k} value={k} data-testid={`tab-risk-${k}`} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{RISK_LABELS[k]}</TabsTrigger>
            ))}
          </TabsList>
          <div className="mt-5">
            {q.isLoading ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-5" data-testid="status-risk-loading" aria-busy="true">
                <Skeleton className="h-4 w-48" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
                <Skeleton className="h-[300px] w-full" />
              </div>
            ) : q.isError ? (
              <div className="rounded-xl border border-destructive/40 bg-card p-8 text-center" data-testid="status-risk-error">
                <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
                <p className="mt-3 font-semibold">Could not load price history for {sym}</p>
                <p className="mt-1 text-sm text-muted-foreground">The price provider did not respond or the symbol is unknown.</p>
                <button type="button" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-risk-retry" className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                  <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> Retry
                </button>
              </div>
            ) : !q.data || all.length < 2 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center" data-testid="status-risk-empty">
                <p className="font-semibold">No adjusted price history for {sym}</p>
                <p className="mt-1 text-sm text-muted-foreground">Check the symbol or try another ticker above.</p>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3" data-testid="panel-risk-range">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Start
                      <input type="date" value={start} min={first} max={last} onChange={(e) => setStart(e.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground" data-testid="input-risk-start" />
                    </label>
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">End
                      <input type="date" value={end} min={first} max={last} onChange={(e) => setEnd(e.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground" data-testid="input-risk-end" />
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {[1, 3, 5, 10].map((y) => (
                        <button key={y} type="button" onClick={() => preset(y)} className="h-9 rounded-md border border-border px-2.5 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground" data-testid={`button-risk-range-${y}y`}>{y}Y</button>
                      ))}
                      <button type="button" onClick={() => preset(null)} className="h-9 rounded-md border border-border px-2.5 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-risk-range-all">All history</button>
                    </div>
                    <p className="w-full text-xs text-muted-foreground" data-testid="text-risk-coverage">
                      {period?.ok
                        ? <>Actual coverage: <span className="font-mono text-foreground">{fmtDate(period.start.date)} to {fmtDate(period.end.date)}</span> ({period.years.toFixed(2)} years, {range.length.toLocaleString()} sessions). Listing history begins {fmtDate(first)}{tenYr === first ? "; default 10-year window clipped to listing start" : ""}.</>
                        : null}
                    </p>
                  </div>
                  {period && !period.ok && <Notice tone="warn" testId="status-risk-range-invalid">{period.reason}</Notice>}
                  {period?.ok && period.years < 1 && <Notice tone="warn" testId="status-risk-short">Selected range is under one year. All risk estimates are statistically weak.</Notice>}
                  {q.data.warnings.length > 0 && (
                    <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="list-risk-warnings">
                      {q.data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  {period?.ok && range.length >= 2 && (
                    <>
                      <TabsContent value="drawdown" className="mt-0"><DrawdownView symbol={sym} prices={range} /></TabsContent>
                      <TabsContent value="volatility" className="mt-0">{view === "volatility" && <VolatilityView symbol={sym} data={q.data} prices={range} start={period.start.date} end={period.end.date} />}</TabsContent>
                      <TabsContent value="ratios" className="mt-0"><RatiosView symbol={sym} data={q.data} prices={range} start={period.start.date} end={period.end.date} /></TabsContent>
                      <TabsContent value="correlation" className="mt-0">{view === "correlation" && <CorrelationView symbol={sym} data={q.data} prices={range} start={period.start.date} end={period.end.date} />}</TabsContent>
                    </>
                  )}
                  <p className="text-[11px] text-muted-foreground" data-testid="text-risk-basis">
                    Basis: {q.data.returnBasis}{q.data.stock.currency ? `, ${q.data.stock.currency} listing currency, no FX conversion` : ""}. Fetched {new Date(q.data.fetchedAt).toLocaleString()}. Historical risk is not a guarantee of future risk. Not investment advice.
                  </p>
                </div>
                <div className="lg:sticky lg:top-20 lg:self-start"><RiskInfoPanel view={view} /></div>
              </div>
            )}
          </div>
        </Tabs>
      )}
    </div>
  );
}
