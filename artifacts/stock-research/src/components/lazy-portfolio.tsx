import { Link } from "wouter";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { PortfolioBacktest } from "@/components/portfolio-backtest";
import type { LazyPortfolio } from "@workspace/api-client-react";
import { NA, usd, num, pct, signedUsd, date, dateTime, tone, Stat, SectionTitle, PerformanceChart, History, th, thr, td, tdr } from "@/components/model-portfolio-shared";

const priceStamp = (s: string | null | undefined) => (!s ? NA : s.length === 10 ? `close ${date(s)}` : `quote ${dateTime(s)}`);

const ROLE: Record<string, string> = {
  VTI: "US total stock market: the domestic equity core.",
  VNQ: "US real estate investment trusts: real-asset exposure with equity-like risk.",
  VEU: "All-world ex-US equity. Includes emerging markets, so it overlaps with VWO; it is not developed-only.",
  VWO: "Emerging-markets equity. Also partly held inside VEU, so emerging markets are doubled up.",
  TIP: "US Treasury inflation-protected securities: protection against unexpected inflation.",
  IEI: "Intermediate (3-7 year) US Treasuries: protection against deflation and equity stress.",
};

const MIX = [
  { k: "Stocks", w: 50, cls: "bg-primary" },
  { k: "REITs", w: 20, cls: "bg-primary/60" },
  { k: "Bonds", w: 30, cls: "bg-primary/30" },
];

function Intro({ p }: { p: LazyPortfolio }) {
  const totalTarget = p.assets.reduce((s, a) => s + a.targetWeight, 0);
  return (
    <section>
      <SectionTitle n="01" title="Intro: six fixed weights, rebalanced and left alone" sub="Inspired by David Swensen, Unconventional Success: A Fundamental Approach" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-3 text-sm leading-6 text-foreground/85">
          <h3 className="font-semibold text-foreground">Strategy and investment rationale</h3>
          <p>Lazy is a <strong>long-term, fixed-weight asset-allocation</strong> strategy inspired by David Swensen's <em>Unconventional Success: A Fundamental Approach</em>. Its emphasis is broad diversification, low-cost funds, and disciplined rebalancing rather than stock picking, market timing, or economic forecasts. “Lazy” describes the low-maintenance decision process, not an absence of investment risk.</p>
          <p>Stocks provide exposure to business growth; REITs provide listed real-estate exposure and distributions; inflation-protected Treasuries add inflation-linked principal exposure; and intermediate Treasuries provide a government-bond allocation that may help during some equity downturns. The intent is to combine assets with different economic drivers, not to assume that one will always rise when another falls.</p>
          <h3 className="font-semibold text-foreground">Exactly how the portfolio operates</h3>
          <p>The portfolio starts with <strong>{usd(p.initialCapital, 0)}</strong> allocated to six fixed targets: <strong>VTI 30%, VNQ 20%, VEU 15%, VWO 5%, TIP 15%, and IEI 15%</strong>. Together these represent 50% stocks, 20% real estate, and 30% bonds. There is no momentum screen: all six funds remain part of the allocation even when their prices decline.</p>
          <p>Every three months, the entire then-current portfolio, including accumulated cash, is restored to these weights. This normally means trimming assets that have grown above target and adding to those that have fallen below target; it does not reset the account to its original capital. Between reviews, market movements cause weights to drift. Rebalancing controls the intended risk mix but does not guarantee extra returns or prevent losses.</p>
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900" data-testid="text-implementation-note">
            <strong>Implementation note:</strong> this is the requested 50% stocks / 20% REITs / 30% bonds implementation, not an exact replication of the book. VEU is all-world ex-US (it includes emerging markets) rather than developed-only, so it overlaps with VWO.
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            <li>Started with {usd(p.initialCapital, 0)} at the target weights, using contemporaneous time-stamped quotes{p.inceptionAt ? ` (${dateTime(p.inceptionAt)})` : ""}. After inception, valuations use dated closing prices; the ledger keeps the original inception trades.</li>
            <li>Full rebalance to target weights every three calendar months, anchored to the inception anniversary. If that date is not a trading day, the next completed session is used.</li>
            <li>Dividends are held as cash until the next rebalance. Cash earns no interest.</li>
            <li>Fractional shares; no taxes, fees, or slippage.</li>
          </ul>
          <h3 className="font-semibold text-foreground">Return expectations and principal risks</h3>
          <p>The primary objective is <strong>long-term total-return growth with purchasing-power preservation</strong>: capital gains plus distributions, with returns exceeding inflation over time. Positive absolute returns through varied economic conditions are an aspiration, not a market-independent outcome. This is a strategic, market-exposed allocation—not a market-neutral or guaranteed absolute-return fund. Diversification may reduce dependence on any single asset class, but does not establish that portfolio returns are uncorrelated with stocks.</p>
          <p>With 70% in stocks and REITs, substantial equity-like drawdowns are possible. Stocks and REITs can decline together; international holdings add currency and geopolitical risk; and both nominal Treasuries and TIPS can lose market value as yields rise. TIPS' inflation adjustment does not prevent short-term ETF losses. Inflation can erode cash and nominal-bond purchasing power, and bonds may fail to offset stock losses. A multi-year holding horizon is appropriate to the strategy's objective, but even a long horizon cannot guarantee a profit or any particular annual return. Historical backtests are illustrative, not forecasts.</p>
        </div>
        <div>
          <div className="mb-3" data-testid="bar-mix">
            <div className="flex h-3 overflow-hidden rounded border border-border">{MIX.map((m) => <div key={m.k} className={m.cls} style={{ width: `${m.w}%` }} />)}</div>
            <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-muted-foreground">{MIX.map((m) => <span key={m.k} className="flex items-center gap-1.5"><span className={`inline-block h-2 w-2 rounded-sm ${m.cls}`} />{m.k} <span className="font-mono text-foreground">{m.w}%</span></span>)}</div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm" data-testid="table-lazy-assets">
              <caption className="sr-only">Six ETFs and their fixed target weights</caption>
              <thead className="bg-muted/50"><tr><th className={th}>ETF</th><th className={th}>Role</th><th className={thr}>Target</th><th className={thr}>Price</th><th className={th}>Data</th></tr></thead>
              <tbody>
                {p.assets.map((a) => (
                  <tr key={a.ticker} className="border-t border-border align-top" data-testid={`row-asset-${a.ticker}`}>
                    <td className={td}><Link href={`/stock/${a.ticker}`} className="font-mono font-semibold hover:text-primary">{a.ticker}</Link><div className="text-xs text-muted-foreground">{a.assetClass}</div></td>
                    <td className={`${td} text-[11px] text-muted-foreground`}><div className="max-w-[260px] whitespace-normal">{ROLE[a.ticker] ?? a.name}</div></td>
                    <td className={`${tdr} font-semibold`}>{num(a.targetWeight, 0)}%</td>
                    <td className={tdr}>{usd(a.price)}</td>
                    <td className={`${td} text-[11px] text-muted-foreground`}>{priceStamp(a.priceDate)}</td>
                  </tr>
                ))}
                {p.assets.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Asset data not available yet.</td></tr>}
                {p.assets.length > 0 && <tr className="border-t-2 border-foreground/30 font-semibold"><td className={td} colSpan={2}>Total</td><td className={tdr}>{num(totalTarget, 0)}%</td><td className={tdr} /><td className={td} /></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function Portfolio({ p }: { p: LazyPortfolio }) {
  const totalCost = p.holdings.reduce((s, h) => s + h.costBasis, 0);
  const cashWeight = p.currentValue ? (p.cash / p.currentValue) * 100 : null;
  const basis = p.valuationBasis === "quote" ? "a live quote" : "closing prices";
  return (
    <section>
      <SectionTitle n="02" title="Model portfolio" sub={`Positions held since the last rebalance (${date(p.lastRebalanceDate)}), valued at ${basis} as of ${dateTime(p.valuedAt)}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 mb-5">
        <Stat id="inception" k="Inception" v={date(p.inceptionDate)} sub={p.inceptionAt ? `quote ${dateTime(p.inceptionAt)}` : `Original ${usd(p.initialCapital, 0)}`} />
        <Stat id="current-value" k="Current total" v={p.currentValue == null ? "Unavailable" : usd(p.currentValue)} sub={`incl. cash ${usd(p.cash)}`} />
        <Stat id="gain" k="Return ($)" v={signedUsd(p.gain)} cls={tone(p.gain)} />
        <Stat id="return" k="Return (%)" v={pct(p.returnPercent)} cls={tone(p.returnPercent)} sub="since inception" />
        <Stat id="last-rebalance" k="Last rebalance" v={date(p.lastRebalanceDate)} />
        <Stat id="next-rebalance" k="Next rebalance" v={date(p.nextRebalanceDate)} sub="quarterly, full" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card mb-6">
        <table className="w-full text-sm" data-testid="table-lazy-holdings">
          <caption className="sr-only">Current Lazy model holdings</caption>
          <thead className="bg-muted/50"><tr><th className={th}>Holding</th><th className={th}>Entry date</th><th className={thr}>Entry PPS</th><th className={thr}>Shares</th><th className={thr}>Cost basis</th><th className={thr}>Current PPS</th><th className={thr}>Value</th><th className={thr}>Target</th><th className={thr}>Weight</th><th className={thr}>Drift</th><th className={thr}>Gain</th></tr></thead>
          <tbody>
            {p.holdings.map((h) => {
              const drift = h.weight == null ? null : h.weight - h.targetWeight;
              return (
                <tr key={h.ticker} className="border-t border-border" data-testid={`row-holding-${h.ticker}`}>
                  <td className={td}><Link href={`/stock/${h.ticker}`} className="font-mono font-semibold hover:text-primary">{h.ticker}</Link><div className="text-xs text-muted-foreground max-w-[160px] truncate">{h.name}</div></td>
                  <td className={td}>{date(h.entryDate)}</td>
                  <td className={tdr}>{usd(h.entryPrice)}</td>
                  <td className={tdr}>{num(h.shares, 8)}</td>
                  <td className={tdr}>{usd(h.costBasis)}</td>
                  <td className={tdr}>{usd(h.currentPrice)}<div className={`text-[10px] ${h.stale ? "text-amber-700" : "text-muted-foreground"}`}>{h.stale ? "stale · " : ""}{priceStamp(h.priceDate)}</div></td>
                  <td className={tdr}>{h.currentValue == null ? <span className="text-muted-foreground">Unavailable</span> : usd(h.currentValue)}</td>
                  <td className={tdr}>{num(h.targetWeight, 1)}%</td>
                  <td className={tdr}>{h.weight == null ? NA : `${num(h.weight, 1)}%`}</td>
                  <td className={`${tdr} text-muted-foreground`}>{drift == null ? NA : `${drift > 0 ? "+" : ""}${drift.toFixed(1)} pp`}</td>
                  <td className={`${tdr} ${tone(h.gain)}`}>{signedUsd(h.gain)}<div className="text-[10px]">{pct(h.gainPercent)}</div></td>
                </tr>
              );
            })}
            {p.holdings.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No positions recorded yet.</td></tr>}
            <tr className="border-t border-border bg-muted/30" data-testid="row-cash">
              <td className={`${td} font-semibold`} colSpan={6}>Cash <span className="text-xs font-normal text-muted-foreground">no interest; dividends held until rebalance</span></td>
              <td className={tdr}>{usd(p.cash)}</td><td className={tdr}>0.0%</td><td className={tdr}>{cashWeight == null ? NA : `${num(cashWeight, 1)}%`}</td><td className={tdr} /><td className={tdr} />
            </tr>
            <tr className="border-t-2 border-foreground/30 font-semibold" data-testid="row-total">
              <td className={td} colSpan={4}>Total</td>
              <td className={tdr}>{usd(totalCost)}</td><td className={tdr} />
              <td className={tdr}>{p.currentValue == null ? "Unavailable" : usd(p.currentValue)}</td>
              <td className={tdr}>100.0%</td>
              <td className={tdr}>{p.currentValue == null ? NA : "100.0%"}</td><td className={tdr} />
              <td className={`${tdr} ${tone(p.gain)}`}>{signedUsd(p.gain)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3 className="text-sm font-semibold mb-2">Performance since inception</h3>
      <PerformanceChart p={p} />
      <History p={p} />
    </section>
  );
}

export function LazyView({ q }: { q: UseQueryResult<LazyPortfolio, unknown> }) {
  const p = q.data;
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /></div>;
  if (q.isError || !p) return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm" data-testid="status-error">
      <div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle className="w-4 h-4" />Could not load the Lazy portfolio.</div>
      <button onClick={() => q.refetch()} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-xs font-medium hover:bg-muted" data-testid="button-retry"><RefreshCw className="w-3.5 h-3.5" />Retry</button>
    </div>
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{p.title}</h2>
          <p className="text-xs text-muted-foreground font-mono">{p.slug} · {p.currency} · refreshed {dateTime(p.refreshedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase ${p.status === "active" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : p.status === "stale" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-border bg-muted text-muted-foreground"}`} data-testid="status-portfolio">{p.status}</span>
          <button onClick={() => q.refetch()} disabled={q.isFetching} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-xs font-medium hover:bg-muted disabled:opacity-50" data-testid="button-refresh"><RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />Refresh</button>
        </div>
      </div>
      {(p.message || p.status !== "active") && (
        <div className={`flex gap-2 rounded-lg border p-3 text-sm ${p.status === "stale" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border bg-muted/40"}`} data-testid="text-portfolio-message">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{p.message ?? (p.status === "pending" ? "The portfolio has not been funded yet. Inception and returns appear once the first allocation is recorded." : `Some prices are stale. Values as of ${dateTime(p.valuedAt)}.`)}</span>
        </div>
      )}
      <Intro p={p} />
      {p.status === "pending" ? (
        <section><SectionTitle n="02" title="Model portfolio" sub="Awaiting inception" />
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No inception date, holdings, or returns yet. Original capital will be {usd(p.initialCapital, 0)}. Nothing here is estimated in the meantime.</div>
        </section>
      ) : <Portfolio p={p} />}
      <PortfolioBacktest strategy="lazy" />
      <p className="text-xs leading-5 text-muted-foreground border-t border-border pt-4">Hypothetical fixed-weight ETF model inspired by, but not an exact replication of, David Swensen's Unconventional Success. For education only; not investment advice and not a guarantee of positive returns. Excludes taxes, fees, and slippage; cash earns no interest. Simulated performance can differ materially from real-world outcomes.</p>
    </>
  );
}
