import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetCloningPortfolio,
  getGetCloningPortfolioQueryKey,
  type CloningPortfolio,
  type ModelPortfolioBacktest,
  type BacktestAllocation,
} from "@workspace/api-client-react";
import { NA, usd, num, pct, signedUsd, date, dateTime, tone, Stat, SectionTitle, PerformanceChart, TransactionLedger, th, thr, td, tdr } from "@/components/model-portfolio-shared";

const btn = "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";

function ErrorBox({ what, onRetry, id }: { what: string; onRetry: () => void; id: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm" data-testid={`status-${id}-error`}>
      <div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle className="w-4 h-4" />Could not load {what}.</div>
      <button onClick={onRetry} className={`mt-3 ${btn}`} data-testid={`button-retry-${id}`}><RefreshCw className="w-3.5 h-3.5" />Retry</button>
    </div>
  );
}

function StatusNote({ b, id }: { b: ModelPortfolioBacktest; id: string }) {
  if (b.status === "complete" && !b.message) return null;
  return (
    <div className={`mb-4 flex gap-2 rounded-lg border p-3 text-sm ${b.status === "complete" ? "border-border bg-muted/40" : "border-amber-300 bg-amber-50 text-amber-900"}`} data-testid={`text-${id}-status`}>
      <Clock className="w-4 h-4 mt-0.5 shrink-0" />
      <span><span className="font-semibold uppercase text-xs mr-1.5" data-testid={`status-${id}`}>{b.status}</span>{b.message ?? (b.status === "partial" ? "Only part of the period could be valued with available data (for example, missing prices for delisted stocks). Figures cover the actual dates shown only." : b.status === "unavailable" ? "Data is not available for this period." : "")}</span>
    </div>
  );
}

/** Reusable allocation spreadsheet for cloning rebalances: manager, ranking weight and source per position. */
export function CloningAllocationTable({ allocations, testId }: { allocations: BacktestAllocation[]; testId: string }) {
  const years = useMemo(() => Array.from(new Set(allocations.map((a) => a.date.slice(0, 4)))), [allocations]);
  const [year, setYear] = useState("all");
  const rows = useMemo(() => allocations.map((a, i) => ({ a, i })).filter(({ a }) => year === "all" || a.date.startsWith(year)), [allocations, year]);
  const cols = 8;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs text-muted-foreground">Every quarterly allocation ({allocations.length}). Ranking weight is the manager's added portfolio weight from the 13F used; values at the execution close.</p>
        {years.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Year
            <select value={year} onChange={(e) => setYear(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid={`select-${testId}-year`}>
              <option value="all">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="max-h-[640px] overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] text-sm" data-testid={`table-${testId}`}>
          <caption className="sr-only">Positions, cash and equity after each quarterly allocation</caption>
          <thead className="bg-muted sticky top-0 z-[1]"><tr>
            <th className={th}>Stock</th><th className={th}>Manager</th><th className={thr}>Added weight</th><th className={th}>13F source</th>
            <th className={thr}>Price</th><th className={thr}>Shares</th><th className={thr}>Value</th><th className={thr}>Weight</th>
          </tr></thead>
          {rows.map(({ a, i }) => {
            const cashW = a.equity ? (a.cash / a.equity) * 100 : null;
            return (
              <tbody key={a.date} data-testid={`group-${testId}-${a.date}`}>
                <tr className="border-t-2 border-foreground/30 bg-muted/40">
                  <td className={`${td} font-semibold`} colSpan={cols}>
                    {i === 0 ? "Initial allocation" : `Rebalance ${i}`} · executed {date(a.date)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">scheduled {date(a.scheduledDate)}{a.scheduledDate !== a.date ? " (next trading close)" : ""}</span>
                    <span className="ml-2 font-mono text-xs font-normal">equity {usd(a.equity)}</span>
                    {a.positions.length === 0 && <span className="ml-2 text-xs font-normal text-amber-800">no qualifying purchases; held in cash</span>}
                  </td>
                </tr>
                {a.positions.map((p) => (
                  <tr key={p.ticker} className="border-t border-border" data-testid={`row-${testId}-${a.date}-${p.ticker}`}>
                    <td className={td}><Link href={`/stock/${p.ticker}`} className="font-mono font-semibold hover:text-primary">{p.ticker}</Link><div className="text-[11px] text-muted-foreground max-w-[180px] truncate" title={p.name}>{p.name}</div></td>
                    <td className={`${td} text-xs max-w-[200px] truncate`} title={p.manager}>{p.manager ?? NA}</td>
                    <td className={tdr}>{p.addedWeight == null ? NA : `${num(p.addedWeight, 2)}%`}</td>
                    <td className={`${td} text-[11px]`}>Period {p.reportPeriod ?? NA}{p.filingSource && <><br /><a href={p.filingSource} target="_blank" rel="noreferrer" className="underline text-primary">Filing</a></>}</td>
                    <td className={tdr}>{usd(p.price)}</td>
                    <td className={tdr}>{num(p.shares, 6)}</td>
                    <td className={tdr}>{usd(p.value)}</td>
                    <td className={tdr}>{num(p.weight, 1)}%</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/20">
                  <td className={`${td} font-semibold`} colSpan={6}>Cash</td>
                  <td className={tdr}>{usd(a.cash)}</td>
                  <td className={tdr}>{cashW == null ? NA : `${num(cashW, 1)}%`}</td>
                </tr>
              </tbody>
            );
          })}
          {rows.length === 0 && <tbody><tr><td colSpan={cols} className="px-3 py-8 text-center text-muted-foreground">No allocations in this range.</td></tr></tbody>}
        </table>
      </div>
    </div>
  );
}

function Intro({ p, loading }: { p?: CloningPortfolio; loading: boolean }) {
  const picks = p ? [...p.candidates].sort((a, b) => Number(b.selected) - Number(a.selected) || b.addedWeight - a.addedWeight) : [];
  return (
    <section>
      <SectionTitle n="01" title="Intro: following the highest-conviction new buys of 13F filers" sub="Rationale, exact rules and what to expect" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3 text-sm leading-6 text-foreground/85">
          <h3 className="font-semibold text-foreground">Strategy and rationale</h3>
          <p>Cloning borrows the single most emphatic fresh commitment each tracked institutional manager disclosed in its latest Form 13F. The premise is that when a manager allocates a meaningful slice of the portfolio to a new or enlarged position, that decision reflects research and conviction worth studying. The model does not judge the ideas; it mechanically follows disclosed purchases.</p>
          <h3 className="font-semibold text-foreground">Exact rules</h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            <li>Starting capital {usd(30000, 0)}. Scheduled inception August 15, 2026, executed at the next trading close (August 17, 2026).</li>
            <li>Thereafter rebalances are scheduled 45 calendar days after each quarter end and executed at the close of that day, or the next trading day if the market is closed. Example: September 30 plus 45 days is Saturday, November 14, so execution is Monday, November 16.</li>
            <li>For each tracked manager, the candidate is its single largest new or increased common-share purchase ranked by added portfolio weight = (current shares minus split-normalized prior shares) x quarter-end unit value / current total portfolio value x 100. Weight changes caused only by price moves do not count.</li>
            <li>Manager winners are ranked by added weight, descending. Duplicate tickers keep only the largest entry. The top ten unique stocks are bought in equal dollar amounts; fewer than ten are split equally among those available; none means the portfolio holds cash.</li>
            <li>At each quarterly rebalance, all remaining holdings are sold at the execution close before the new selections are purchased with all available cash. Stocks selected again are sold and repurchased as well. The transaction ledger records each sale and purchase separately.</li>
            <li>Only original, current and prior filings available strictly before the trade date are used. Filings arriving on the trade date itself are excluded. A position with no prior comparison filing is not treated as a new purchase.</li>
            <li>No taxes, commissions or slippage are modelled.</li>
          </ul>
          <h3 className="font-semibold text-foreground">Return expectations and principal risks</h3>
          <p>This is a concentrated equity strategy. It is correlated with the stock market, can lose money for extended periods, and is not promised to deliver absolute, uncorrelated, or above-market returns. 13F filings are delayed up to 45 days and incomplete: they omit short positions, most international and private holdings, and hedges, so a manager's true exposure may differ. The tracked manager universe reflects present-day selection, which introduces survivorship and selection bias. Model figures are hypothetical and were not achieved by any account.</p>
        </div>
        <div>
          <div className="mb-2 text-xs text-muted-foreground">Current candidate purchases{p?.reportPeriod ? ` from 13Fs for the period ending ${date(p.reportPeriod)}` : ""}. Highlighted rows are selected.</div>
          {loading ? <Skeleton className="h-64 w-full" /> : !p ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Candidate list unavailable while the live portfolio cannot be loaded.</div>
          ) : (
            <div className="max-h-[560px] overflow-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm" data-testid="table-cloning-candidates">
                <caption className="sr-only">Largest purchase per manager by added weight</caption>
                <thead className="bg-muted/50 sticky top-0"><tr><th className={th}>Stock</th><th className={th}>Manager</th><th className={thr}>Added weight</th><th className={th}>Activity</th><th className={th}>Filing</th></tr></thead>
                <tbody>
                  {picks.map((c) => (
                    <tr key={`${c.fundCik}-${c.ticker}`} className={`border-t border-border ${c.selected ? "bg-primary/[0.07]" : ""}`} data-testid={`row-cloning-candidate-${c.fundCik}-${c.ticker}`}>
                      <td className={td}><Link href={`/stock/${c.ticker}`} className="font-mono font-semibold hover:text-primary">{c.ticker}</Link>{c.selected && <span className="ml-1 text-[10px] font-semibold text-primary">PICK</span>}<div className="text-xs text-muted-foreground max-w-[160px] truncate" title={c.name}>{c.name}</div></td>
                      <td className={`${td} text-xs max-w-[180px] truncate`} title={`${c.manager} (CIK ${c.fundCik})`}>{c.manager}</td>
                      <td className={`${tdr} font-semibold`}>{num(c.addedWeight, 2)}%</td>
                      <td className={`${td} text-xs capitalize`}>{c.activity}</td>
                      <td className={`${td} text-[11px] text-muted-foreground`}>Period {c.reportPeriod}<br />Filed {date(c.filedOn)} <a href={c.filingSource} target="_blank" rel="noreferrer" className="underline text-primary">source</a></td>
                    </tr>
                  ))}
                  {picks.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No qualifying purchases in the available filings.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {p && p.coverage.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-900 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="list-cloning-coverage">
              {p.coverage.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Live({ p }: { p: CloningPortfolio }) {
  const r = p.result;
  const totalCost = p.holdings.reduce((s, h) => s + (h.costBasis ?? 0), 0);
  const cash = r.performance.length ? r.performance[r.performance.length - 1].cash : r.allocations.length ? r.allocations[r.allocations.length - 1].cash : null;
  const cashW = r.finalValue && cash != null ? (cash / r.finalValue) * 100 : null;
  return (
    <>
      <StatusNote b={r} id="cloning-live" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 mb-5">
        <Stat id="cloning-inception" k="Inception" v={date(p.inceptionDate)} sub={`first trade ${date(r.actualStartDate)}`} />
        <Stat id="cloning-value" k="Current total" v={r.finalValue == null ? "Unavailable" : usd(r.finalValue)} sub={`as of ${date(r.actualEndDate)}`} />
        <Stat id="cloning-gain" k="Return ($)" v={signedUsd(r.gain)} cls={tone(r.gain)} />
        <Stat id="cloning-return" k="Return (%)" v={pct(r.returnPercent)} cls={tone(r.returnPercent)} sub="since inception, cumulative" />
        <Stat id="cloning-initial" k="Starting capital" v={usd(r.initialCapital, 0)} />
        <Stat id="cloning-next" k="Next rebalance" v={date(p.nextRebalanceDate)} sub="scheduled; executes next trading close" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card mb-6">
        <table className="w-full text-sm" data-testid="table-cloning-holdings">
          <caption className="sr-only">Current cloning holdings</caption>
          <thead className="bg-muted/50"><tr>
            <th className={th}>Holding</th><th className={th}>Manager</th><th className={th}>Entry date</th><th className={thr}>Entry PPS</th><th className={thr}>Shares</th><th className={thr}>Cost basis</th><th className={thr}>Current PPS</th><th className={thr}>Value</th><th className={thr}>Weight</th><th className={thr}>Gain</th>
          </tr></thead>
          <tbody>
            {p.holdings.map((h) => {
              const gp = h.gain != null && h.costBasis ? (h.gain / h.costBasis) * 100 : null;
              return (
                <tr key={h.ticker} className="border-t border-border" data-testid={`row-cloning-holding-${h.ticker}`}>
                  <td className={td}><Link href={`/stock/${h.ticker}`} className="font-mono font-semibold hover:text-primary">{h.ticker}</Link><div className="text-xs text-muted-foreground max-w-[160px] truncate">{h.name}</div></td>
                  <td className={`${td} text-xs max-w-[160px] truncate`} title={h.manager}>{h.manager ?? NA}{h.addedWeight != null && <div className="text-[10px] text-muted-foreground">added {num(h.addedWeight, 2)}%</div>}</td>
                  <td className={td}>{date(h.entryDate)}</td>
                  <td className={tdr}>{usd(h.entryPrice)}</td>
                  <td className={tdr}>{num(h.shares, 6)}</td>
                  <td className={tdr}>{usd(h.costBasis)}</td>
                  <td className={tdr}>{h.price == null ? <span className="text-muted-foreground">Unavailable</span> : usd(h.price)}</td>
                  <td className={tdr}>{usd(h.value)}</td>
                  <td className={tdr}>{num(h.weight, 1)}%</td>
                  <td className={`${tdr} ${tone(h.gain)}`}>{signedUsd(h.gain)}<div className="text-[10px]">{pct(gp)}</div></td>
                </tr>
              );
            })}
            {p.holdings.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">{r.status === "unavailable" ? "Allocation is blocked by unverified data. See the coverage notice; no holdings or returns are invented." : "No stock positions. See cash and the allocation history."}</td></tr>}
            <tr className="border-t border-border bg-muted/30"><td className={`${td} font-semibold`} colSpan={7}>Cash</td><td className={tdr}>{usd(cash)}</td><td className={tdr}>{cashW == null ? NA : `${num(cashW, 1)}%`}</td><td className={tdr} /></tr>
            <tr className="border-t-2 border-foreground/30 font-semibold"><td className={td} colSpan={5}>Total</td><td className={tdr}>{usd(totalCost)}</td><td className={tdr} /><td className={tdr}>{r.finalValue == null ? "Unavailable" : usd(r.finalValue)}</td><td className={tdr} /><td className={`${tdr} ${tone(r.gain)}`}>{signedUsd(r.gain)}</td></tr>
          </tbody>
        </table>
      </div>
      <h3 className="text-sm font-semibold mb-2">Performance since inception</h3>
      <PerformanceChart p={{ performance: r.performance }} />
      <p className="mt-3 text-xs text-muted-foreground">Cash includes distributions and verified cash acquisition proceeds, held until the next quarterly rebalance. Holdings can therefore fall below ten between reviews; the allocation history preserves the original purchases.</p>
      {r.allocations.length > 0 && <div className="mt-6"><h3 className="text-sm font-semibold mb-2">Allocation history</h3><CloningAllocationTable allocations={r.allocations} testId="cloning-live-allocations" /></div>}
      <div className="mt-6" data-testid="cloning-transaction-ledger">
        {r.ledger ? <TransactionLedger ledger={r.ledger} /> : <p className="text-sm text-muted-foreground">Transaction ledger unavailable in this stored snapshot. Refresh to load verified transactions.</p>}
      </div>
      <details className="mt-4 rounded-lg border border-border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold">Accounting, pricing sources and model assumptions</summary><ul className="mt-3 space-y-2">{r.assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul></details>
      {r.omittedDates.length > 0 && <p className="mt-3 text-xs text-amber-800">Omitted valuation sessions (insufficient data): {r.omittedDates.map(date).join(", ")}.</p>}
    </>
  );
}

export function CloningView({ enabled }: { enabled: boolean }) {
  const q = useGetCloningPortfolio({ query: { queryKey: getGetCloningPortfolioQueryKey(), enabled, staleTime: 60_000, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false } });
  const p = q.data;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{p?.title ?? "Cloning"}</h2>
          <p className="text-xs text-muted-foreground font-mono">cloning · USD{p ? ` · computed ${dateTime(p.result.refreshedAt)}` : ""}</p>
        </div>
        <button onClick={() => q.refetch()} disabled={q.isFetching} className={btn} data-testid="button-refresh-cloning"><RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />Refresh</button>
      </div>
      <Intro p={p} loading={q.isLoading} />
      <section>
        <SectionTitle n="02" title="Model portfolio" sub={`Since inception (${date(p?.inceptionDate ?? "2026-08-15")}), reconstructed through the latest close`} />
        {q.isLoading ? <div className="space-y-3"><div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /></div>
          : q.isError || !p ? <ErrorBox what="the live Cloning portfolio" onRetry={() => q.refetch()} id="cloning" />
          : <Live p={p} />}
      </section>
      <p className="text-xs leading-5 text-muted-foreground border-t border-border pt-4">Hypothetical, concentrated equity model for education only. Not investment advice. No outperformance or absolute return is promised. 13F data is delayed and incomplete. Excludes taxes, commissions, and slippage.</p>
    </>
  );
}
