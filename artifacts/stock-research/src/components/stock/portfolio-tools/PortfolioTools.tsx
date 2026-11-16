import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { getGetTickerPerformanceQueryOptions, getGetTickerPerformanceQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, PieChart, RefreshCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizePortfolioSymbol, simulatePortfolio, validateHoldings } from "@/lib/portfolio-tools-calculations";
import type { HoldingHistory, RebalanceRule } from "@/lib/portfolio-tools-calculations";
import { subtractYears } from "@/lib/performance-calculations";
import { Notice, fmtDate } from "@/components/stock/performance/perf-shared";
import HoldingsEditor from "./HoldingsEditor";
import type { Row } from "./HoldingsEditor";
import AnalyzerView from "./AnalyzerView";
import BacktesterView from "./BacktesterView";
import CorrelationMatrixView from "./CorrelationMatrixView";
import CrisisSimulatorView from "./CrisisSimulatorView";
import RecoveryTimeView from "./RecoveryTimeView";
import { PORTFOLIO_LABELS, PORTFOLIO_VIEWS, REBALANCE_LABELS, fmtWeight } from "./portfolio-shared";
import type { PortfolioView, Submission } from "./portfolio-shared";

const SUBMIT: Record<PortfolioView, string> = { analyzer: "Analyze portfolio", correlation: "Calculate matrix", backtester: "Run backtest", crisis: "Simulate crises", recovery: "Measure recovery" };
const dateCls = "mt-1 block h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground";

export default function PortfolioTools({ symbol, view, onViewChange }: { symbol?: string; view: PortfolioView; onViewChange: (v: PortfolioView) => void }) {
  const [rows, setRows] = useState<Row[]>(() => [
    { id: 1, symbol: symbol ? normalizePortfolioSymbol(symbol) : "", weight: "" },
    { id: 2, symbol: "", weight: "" },
  ]);
  const [initial, setInitial] = useState("10000");
  const [rf, setRf] = useState("0");
  const [rebalance, setRebalance] = useState<RebalanceRule>("none");
  const [sub, setSub] = useState<Submission | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const dirty = () => { setSub(null); setErrors([]); };
  const weighted = view !== "correlation";

  const submit = () => {
    const holdings = rows.map((r) => ({ symbol: normalizePortfolioSymbol(r.symbol), weight: r.weight.trim() === "" ? NaN : Number(r.weight) }));
    const errs = validateHoldings(holdings, weighted);
    const iv = Number(initial), rate = Number(rf);
    if (weighted) {
      if (initial.trim() === "" || !Number.isFinite(iv) || iv <= 0) errs.push("Initial investment must be a positive number.");
      if (rf.trim() === "" || !Number.isFinite(rate) || rate <= -100) errs.push("Enter an annual risk-free rate above -100% (0 is allowed).");
    }
    setErrors(errs);
    setSub(errs.length ? null : { holdings, weighted, initialValue: iv, annualRiskFree: rate / 100, rebalance });
  };

  const useWeights = !!sub?.weighted && view !== "correlation";
  const symbols = sub ? (useWeights ? sub.holdings.filter((h) => h.weight > 0) : sub.holdings).map((h) => h.symbol) : [];
  const queries = useQueries({
    queries: symbols.map((s) => getGetTickerPerformanceQueryOptions(s, { query: { queryKey: getGetTickerPerformanceQueryKey(s), staleTime: 600000, retry: 1 } })),
  });
  const loading = queries.some((q) => q.isLoading);
  const failed = symbols.filter((_, i) => queries[i]?.isError || (queries[i]?.data && queries[i].data!.stock.prices.length < 2));
  const ready = !!sub && !loading && failed.length === 0 && queries.every((q) => q.data);
  const dataStamp = queries.map((q) => q.dataUpdatedAt).join(",");
  const histories: HoldingHistory[] = useMemo(
    () => (ready ? symbols.map((s, i) => ({ symbol: s, currency: queries[i].data!.stock.currency, prices: queries[i].data!.stock.prices })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, symbols.join(","), dataStamp],
  );
  const commonFirst = histories.reduce((m, h) => (h.prices[0].date > m ? h.prices[0].date : m), "");
  const commonLast = histories.reduce((m, h) => (!m || h.prices[h.prices.length - 1].date < m ? h.prices[h.prices.length - 1].date : m), "");
  const overlap = !!commonFirst && !!commonLast && commonFirst < commonLast;
  const tenYr = overlap ? (subtractYears(commonLast, 10) < commonFirst ? commonFirst : subtractYears(commonLast, 10)) : "";
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const isRec = view === "recovery";
  const [clipNote, setClipNote] = useState<string | null>(null);
  useEffect(() => {
    if (!overlap) { setStart(""); setEnd(""); setClipNote(null); return; }
    setStart(isRec ? commonFirst : tenYr); setEnd(commonLast);
    setClipNote(isRec ? "Recovery Time defaults to all common history." : tenYr && tenYr === commonFirst && subtractYears(commonLast, 10) < commonFirst ? "Default 10-year window clipped to the shortest common history." : null);
  }, [tenYr, commonLast, commonFirst, overlap, isRec]);
  const preset = (y: number | null) => {
    if (!overlap) return;
    const want = y === null ? commonFirst : subtractYears(commonLast, y);
    const clipped = want < commonFirst;
    setEnd(commonLast); setStart(clipped ? commonFirst : want);
    setClipNote(clipped ? `${y}Y preset clipped to the shortest common history, which starts ${fmtDate(commonFirst)}.` : null);
  };
  const rangeError = start && end && start >= end ? "Start date must be before end date." : null;
  const outcome = useMemo(
    () => (ready && sub?.weighted && view !== "crisis" && start && end && !rangeError ? simulatePortfolio(sub.holdings, histories, { start, end, rebalance: sub.rebalance, initialValue: sub.initialValue, annualRiskFree: sub.annualRiskFree }) : null),
    [ready, sub, histories, start, end, rangeError, view],
  );
  const warnings = queries.flatMap((q, i) => (q.data?.warnings ?? []).map((w) => `${symbols[i]}: ${w}`));

  return (
    <div className="space-y-5" data-testid="panel-portfolio">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Portfolio Tools</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Test a mix of holdings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Combine 2 to 20 tickers, then measure the portfolio, how its pieces move together, and how it would have grown. Every assumption is listed.</p>
      </div>
      <Tabs value={view} onValueChange={(v) => onViewChange(v as PortfolioView)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0.5 border border-border bg-card p-1 lg:inline-flex lg:w-auto">
          {PORTFOLIO_VIEWS.map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`tab-portfolio-${k}`} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{PORTFOLIO_LABELS[k]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <HoldingsEditor rows={rows} onRows={(r) => { setRows(r); dirty(); }} weighted={weighted}
            initial={initial} onInitial={(v) => { setInitial(v); dirty(); }} rf={rf} onRf={(v) => { setRf(v); dirty(); }}
            rebalance={rebalance} onRebalance={(v) => { setRebalance(v); dirty(); }}
            onSubmit={submit} submitLabel={SUBMIT[view]} errors={errors} />
        </div>
        <div className="min-w-0 space-y-3">
          {!sub ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center" data-testid="status-portfolio-empty">
              <PieChart className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 text-lg font-semibold">{PORTFOLIO_LABELS[view]}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {view === "analyzer" && "Enter tickers and weights totaling 100%, then press Analyze to see CAGR, volatility, maximum drawdown and Sharpe for the combined portfolio."}
                {view === "correlation" && "Enter at least two tickers and press Calculate to see how their daily returns move together. Weights are not needed."}
                {view === "backtester" && "Enter tickers and weights, choose a rebalancing rule, and run the backtest to see how the portfolio would have grown over any date range."}
                {view === "crisis" && "Enter tickers and weights, then simulate the same starting amount and target weights through four named historical crises: 2000 to 2002 dot-com, calendar 2008, the February to March 2020 COVID crash, and calendar 2022. Each window runs independently and explains itself if any holding lacks history for it."}
                {view === "recovery" && "Enter tickers and weights, then measure every major drawdown of the combined portfolio: peak, trough, depth, how long the decline took, and how long it took to regain the old high, or whether it is still underwater."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Nothing is calculated until you submit. Editing any input clears previous results.</p>
            </div>
          ) : (
            <>
              <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 font-mono text-xs" data-testid="text-portfolio-submitted">
                Results for submitted holdings{useWeights && sub.holdings.some((h) => h.weight === 0) ? " (0% holdings excluded from weighted analytics, still shown in Correlation)" : ""}: {sub.holdings.map((h) => (sub.weighted ? `${h.symbol} ${fmtWeight(h.weight)}` : h.symbol)).join(", ")}
                {sub.weighted && ` | ${REBALANCE_LABELS[sub.rebalance]} | rf ${(sub.annualRiskFree * 100).toFixed(2)}%`}
              </p>
              {loading ? (
                <div className="space-y-3 rounded-xl border border-border bg-card p-5" aria-busy="true" data-testid="status-portfolio-loading">
                  <Skeleton className="h-4 w-56" />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
                  <Skeleton className="h-[260px] w-full" />
                  <p className="text-xs text-muted-foreground">Loading price history for {symbols.length} holdings ({queries.filter((q) => q.data).length} done).</p>
                </div>
              ) : failed.length > 0 ? (
                <div className="rounded-xl border border-destructive/40 bg-card p-8 text-center" data-testid="status-portfolio-error">
                  <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
                  <p className="mt-3 font-semibold">No usable price history for {failed.join(", ")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">No holding is dropped silently. Retry, or edit the ticker and resubmit.</p>
                  <button type="button" onClick={() => symbols.forEach((s, i) => { if (failed.includes(s)) queries[i].refetch(); })} className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" data-testid="button-portfolio-retry">
                    <RefreshCw className={`h-4 w-4 ${queries.some((q) => q.isFetching) ? "animate-spin" : ""}`} /> Retry
                  </button>
                </div>
              ) : ready && (
                <>
                  {view !== "crisis" && <>
                  <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3" data-testid="panel-portfolio-range">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Start
                      <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setClipNote(null); }} className={dateCls} data-testid="input-portfolio-start" />
                    </label>
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">End
                      <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setClipNote(null); }} className={dateCls} data-testid="input-portfolio-end" />
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {[1, 3, 5, 10].map((y) => <button key={y} type="button" onClick={() => preset(y)} disabled={!overlap} className="h-9 rounded-md border border-border px-2.5 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" data-testid={`button-portfolio-range-${y}y`}>{y}Y</button>)}
                      <button type="button" onClick={() => preset(null)} disabled={!overlap} className="h-9 rounded-md border border-border px-2.5 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" data-testid="button-portfolio-range-all">All common</button>
                    </div>
                    <p className="w-full text-xs text-muted-foreground" data-testid="text-portfolio-coverage">
                      Common history across holdings: <span className="font-mono text-foreground">{fmtDate(commonFirst)} to {fmtDate(commonLast)}</span>. Requested: <span className="font-mono text-foreground">{start ? fmtDate(start) : "?"} to {end ? fmtDate(end) : "?"}</span>.{clipNote && ` ${clipNote}`}
                    </p>
                  </div>
                  {!overlap && <Notice tone="warn" testId="status-portfolio-no-overlap">These holdings have no overlapping price history, so no date range can be applied. Edit the tickers and resubmit.</Notice>}
                  {rangeError && <Notice tone="warn" testId="status-portfolio-range-invalid">{rangeError}</Notice>}
                  </>}
                  {warnings.length > 0 && (
                    <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="list-portfolio-warnings">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  {view === "crisis" ? (!sub.weighted ? (
                    <Notice tone="warn" testId="status-portfolio-needs-weights">These results were submitted for the Correlation Matrix, where weights are not checked. Enter weights totaling 100% and press {SUBMIT[view]}.</Notice>
                  ) : <CrisisSimulatorView sub={sub} histories={histories} />) : overlap && !rangeError && start && end && (view === "correlation" ? (
                    <CorrelationMatrixView holdings={sub.holdings} histories={histories} start={start} end={end} />
                  ) : !sub.weighted ? (
                    <Notice tone="warn" testId="status-portfolio-needs-weights">These results were submitted for the Correlation Matrix, where weights are not checked. Enter weights totaling 100% and press {SUBMIT[view]}.</Notice>
                  ) : outcome && !outcome.ok ? (
                    <Notice tone="warn" testId="status-portfolio-sim-error">{outcome.reason}</Notice>
                  ) : outcome?.ok ? (
                    view === "analyzer" ? <AnalyzerView result={outcome} sub={sub} /> : view === "recovery" ? <RecoveryTimeView result={outcome} sub={sub} /> : <BacktesterView result={outcome} sub={sub} />
                  ) : null)}
                  <p className="text-[11px] text-muted-foreground">Basis: adjusted closes (dividends reinvested). Fetched {queries[0]?.data ? new Date(queries[0].data.fetchedAt).toLocaleString() : ""}. Historical results do not guarantee future results. Not investment advice.</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
