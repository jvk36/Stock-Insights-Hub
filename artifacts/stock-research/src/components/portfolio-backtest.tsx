import { useMemo, useState } from "react";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetModelPortfolioBacktest, getGetModelPortfolioBacktestQueryKey, type ModelPortfolioBacktest, type BacktestAllocation } from "@workspace/api-client-react";
import { NA, usd, num, pct, signedUsd, date, dateTime, tone, Stat, SectionTitle, PerformanceChart, th, thr, td, tdr } from "@/components/model-portfolio-shared";

type Strategy = "momentum" | "lazy" | "blind-trust";

function Rebalance({ a, i, strategy }: { a: BacktestAllocation; i: number; strategy: Strategy }) {
  const cashW = a.equity ? (a.cash / a.equity) * 100 : null;
  const sma = strategy === "momentum";
  const book = strategy === "blind-trust";
  const cols = book ? 8 : sma ? 7 : 6;
  return (
    <tbody data-testid={`group-backtest-rebalance-${a.date}`}>
      <tr className="border-t-2 border-foreground/30 bg-muted/40">
        <td className={`${td} font-semibold`} colSpan={cols}>
          {i === 0 ? "Initial allocation" : `Rebalance ${i}`} · executed {date(a.date)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">scheduled {date(a.scheduledDate)}{a.scheduledDate !== a.date ? " (next completed session)" : ""}</span>
          <span className="ml-2 font-mono text-xs font-normal">equity {usd(a.equity)}</span>
        </td>
      </tr>
      {a.positions.map((p) => (
        <tr key={p.ticker} className={`border-t border-border ${p.selected && p.weight > 0 ? "" : "text-muted-foreground"}`} data-testid={`row-backtest-${a.date}-${p.ticker}`}>
          <td className={td}><span className="font-mono font-semibold">{p.ticker}</span><div className="text-[11px] text-muted-foreground max-w-[180px] truncate" title={p.name}>{p.name}</div></td>
          {sma && <td className={tdr}>{usd(p.sma200)}</td>}
          {sma && <td className={td}>{p.selected
            ? <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">Above SMA</span>
            : <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{p.sma200 == null ? "No SMA" : "At / below"}</span>}</td>}
          {book && <td className={tdr}>{usd(p.bookValue)}</td>}
          {book && <td className={tdr}>{p.priceToBook == null ? NA : `${num(p.priceToBook, 3)}×`}{p.selected && <div className="text-[11px] text-primary">Selected</div>}</td>}
          {book && <td className={`${td} text-[11px]`}>Period {date(p.bookDate)}<br />Filed {date(p.filedOn)}{p.bookSource && <><br /><a href={p.bookSource} target="_blank" rel="noreferrer" className="underline text-primary">Original filing</a></>}{p.reason && <div className="max-w-[200px] whitespace-normal text-muted-foreground">{p.reason}</div>}</td>}
          <td className={tdr}>{usd(p.price)}</td>
          <td className={tdr}>{num(p.shares, 8)}</td>
          <td className={tdr}>{usd(p.value)}</td>
          <td className={tdr}>{num(p.weight, 1)}%</td>
          {!sma && !book && <td className={td} />}
        </tr>
      ))}
      <tr className="border-t border-border bg-muted/20" data-testid={`row-backtest-${a.date}-cash`}>
        <td className={`${td} font-semibold`} colSpan={sma || book ? cols - 2 : cols - 3}>Cash</td>
        <td className={tdr}>{usd(a.cash)}</td>
        <td className={tdr}>{cashW == null ? NA : `${num(cashW, 1)}%`}</td>
        {!sma && !book && <td className={td} />}
      </tr>
    </tbody>
  );
}

function Body({ b, strategy }: { b: ModelPortfolioBacktest; strategy: Strategy }) {
  const years = useMemo(() => Array.from(new Set(b.allocations.map((a) => a.date.slice(0, 4)))), [b.allocations]);
  const [year, setYear] = useState("all");
  const rows = useMemo(() => b.allocations.map((a, i) => ({ a, i })).filter(({ a }) => year === "all" || a.date.startsWith(year)), [b.allocations, year]);
  const sma = strategy === "momentum";
  const book = strategy === "blind-trust";
  const shortEnd = b.actualEndDate != null && b.actualEndDate < b.endDateExclusive;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 mb-5">
        <Stat id="backtest-start" k="Simulated start" v={date(b.actualStartDate)} sub={`window from ${date(b.startDate)}`} />
        <Stat id="backtest-end" k="Last simulated close" v={date(b.actualEndDate)} sub={`before ${date(b.endDateExclusive)}`} />
        <Stat id="backtest-initial" k="Starting capital" v={usd(b.initialCapital, 0)} sub="hypothetical" />
        <Stat id="backtest-final" k="Ending value" v={b.finalValue == null ? "Unavailable" : usd(b.finalValue)} />
        <Stat id="backtest-gain" k="Simulated return ($)" v={signedUsd(b.gain)} cls={tone(b.gain)} />
        <Stat id="backtest-return" k="Simulated return (%)" v={pct(b.returnPercent)} cls={tone(b.returnPercent)} sub="cumulative, not annualized" />
      </div>
      {shortEnd && <p className="mb-4 text-xs text-muted-foreground" data-testid="text-backtest-period-note">The last simulated close is {date(b.actualEndDate)}, short of the nominal window end, so no exact ten-year annualized figure is shown.</p>}
      <h3 className="text-sm font-semibold mb-2">Hypothetical simulated value, {date(b.actualStartDate)} to {date(b.actualEndDate)}</h3>
      <div data-testid="chart-backtest"><PerformanceChart p={{ performance: b.performance }} /></div>

      <div className="mt-6 mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Holdings after every rebalance ({b.allocations.length})</h3>
          <p className="text-xs text-muted-foreground">{book ? "All eight businesses are listed, including exclusions, with historical P/B inputs and original filing dates." : `Every ETF is listed at each rebalance; ${sma ? "unselected funds show zero weight." : "weights reflect the fixed targets at execution."}`} Values at the execution close.</p>
        </div>
        {years.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Year
            <select value={year} onChange={(e) => setYear(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="select-backtest-year">
              <option value="all">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="max-h-[640px] overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm" data-testid="table-backtest-rebalances">
          <caption className="sr-only">Simulated holdings, cash and equity after each rebalance</caption>
          <thead className="bg-muted sticky top-0 z-[1]"><tr>
            <th className={th}>{book ? "Business" : "ETF"}</th>{sma && <th className={thr}>200-day SMA</th>}{sma && <th className={th}>Signal</th>}
            {book && <><th className={thr}>Book / share</th><th className={thr}>P/B</th><th className={th}>Historical source</th></>}
            <th className={thr}>Price</th><th className={thr}>Shares</th><th className={thr}>Value</th><th className={thr}>Weight</th>{!sma && !book && <th className={th} />}
          </tr></thead>
          {rows.map(({ a, i }) => <Rebalance key={a.date} a={a} i={i} strategy={strategy} />)}
          {rows.length === 0 && <tbody><tr><td colSpan={book ? 8 : sma ? 7 : 6} className="px-3 py-8 text-center text-muted-foreground">No rebalances in this range.</td></tr></tbody>}
        </table>
      </div>

      {b.omittedDates.length > 0 && (
        <p className="mt-3 text-xs text-amber-800" data-testid="text-backtest-omitted">Omitted valuation sessions (insufficient data): {b.omittedDates.map(date).join(", ")}.</p>
      )}
      {b.assumptions.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold mb-2">Simulation assumptions</h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3" data-testid="list-backtest-assumptions">
            {b.assumptions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

export function PortfolioBacktest({ strategy }: { strategy: Strategy }) {
  const q = useGetModelPortfolioBacktest(strategy, { query: { queryKey: getGetModelPortfolioBacktestQueryKey(strategy), staleTime: 60 * 60_000 } });
  const b = q.data;
  return (
    <section data-testid={`section-backtest-${strategy}`}>
      <SectionTitle n="03" title="Ten-year backtest" sub="Hypothetical historical simulation before inception. Separate from the actual since-inception results above." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900" data-testid="text-backtest-disclaimer">
        <span>Simulated with hindsight on historical closes. These are not results the model actually achieved, and they do not predict or guarantee future returns.</span>
        <span className="flex items-center gap-2">
          {b && <span className="font-mono text-[11px]" data-testid="text-backtest-refreshed">computed {dateTime(b.refreshedAt)}</span>}
          <button onClick={() => q.refetch()} disabled={q.isFetching} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50" data-testid="button-refresh-backtest"><RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />Refresh</button>
        </span>
      </div>
      {q.isLoading ? (
        <div className="space-y-3" data-testid="status-backtest-loading"><div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /></div>
      ) : q.isError || !b ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm" data-testid="status-backtest-error">
          <div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle className="w-4 h-4" />Could not load the backtest.</div>
          <button onClick={() => q.refetch()} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-xs font-medium hover:bg-muted" data-testid="button-retry-backtest"><RefreshCw className="w-3.5 h-3.5" />Retry</button>
        </div>
      ) : (
        <>
          {(b.status !== "complete" || b.message || q.isStale) && (
            <div className={`mb-4 flex gap-2 rounded-lg border p-3 text-sm ${b.status === "complete" ? "border-border bg-muted/40" : "border-amber-300 bg-amber-50 text-amber-900"}`} data-testid="text-backtest-status">
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              <span><span className="font-semibold uppercase text-xs mr-1.5" data-testid="status-backtest">{b.status}</span>{b.message ?? (b.status === "partial" ? "Only part of the window could be simulated with available data." : b.status === "unavailable" ? "Historical data is not available for this simulation." : `Cached result from ${dateTime(b.refreshedAt)}.`)}</span>
            </div>
          )}
          {b.status === "unavailable" && b.allocations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="text-backtest-unavailable">No simulated figures are shown. Nothing is estimated in their place.</div>
          ) : <Body b={b} strategy={strategy} />}
        </>
      )}
    </section>
  );
}
