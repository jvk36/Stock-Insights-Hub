import { Link } from "wouter";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import type { MomentumPortfolio, MomentumCandidate } from "@workspace/api-client-react";
import { NA, usd, num, pct, signedUsd, date, dateTime, tone, Stat, SectionTitle, PerformanceChart, History, th, thr, td, tdr } from "@/components/model-portfolio-shared";

const priceStamp = (s: string | null | undefined) => (!s ? NA : s.length === 10 ? `close ${date(s)}` : `quote ${dateTime(s)}`);

const UNIVERSE: Record<string, string> = {
  VTI: "US total stock market: domestic equity.",
  VEU: "All-world ex-US equity. Includes emerging markets, so it overlaps with VWO; it is not a developed-markets-only fund.",
  VWO: "Emerging-markets equity. Also partly held inside VEU, so owning both doubles up on emerging markets.",
  VNQ: "US real estate investment trusts.",
  TLT: "Long-duration (20+ year) US Treasury bonds.",
  TIP: "US Treasury inflation-protected securities.",
};

function SignalBadge({ c }: { c: MomentumCandidate }) {
  if (c.status === "temporary_error") return <span className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-800">Data error</span>;
  return c.aboveSma
    ? <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">Above SMA</span>
    : <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">At / below SMA</span>;
}

function Intro({ p }: { p: MomentumPortfolio }) {
  const above = p.candidates.filter((c) => c.status === "ready" && c.aboveSma);
  return (
    <section>
      <SectionTitle n="01" title="Intro: own what is trending, hold cash when nothing is" sub="Six ETFs, one rule, checked every three months" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-3 text-sm leading-6 text-foreground/85">
          <p>Momentum is a simple <strong>trend-following</strong> model. Each quarter it compares six ETFs to their own <strong>200-day simple moving average</strong> and owns, in equal weights, every fund trading strictly above it. Funds at or below their average are sold; if none qualify, the whole portfolio sits in cash.</p>
          <p>The goal is absolute returns with lower correlation to buy-and-hold equities, using diversification and the ability to move into bonds or cash. Uncorrelated returns are an aim, not an inherent property or a guarantee: correlations change, these assets can fall together, and trend signals can lose money.</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            <li>Started with {usd(p.initialCapital, 0)}, split equally across every ETF strictly above its 200-day SMA. Equal to the SMA does not qualify.</li>
            <li>Inception on October 26, 2026 used a contemporaneous, time-stamped live quote{p.inceptionAt ? ` (${dateTime(p.inceptionAt)})` : ""} compared with the prior 200 completed closes. That quote snapshot is later replaced by the dated close for valuation; the ledger keeps the original inception trades.</li>
            <li>Rebalances every three calendar months, anchored to inception. If that date is not a trading day, the next completed session is used, with the SMA of the trailing 200 closes including the rebalance close.</li>
            <li>Prices are split-adjusted but not dividend-adjusted for the SMA. Dividends are held as cash until the next rebalance. Cash earns no interest.</li>
            <li>Fractional shares; no taxes, fees, or slippage.</li>
          </ul>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Above SMA now:</span>
            {above.length ? above.map((c) => <span key={c.ticker} className="rounded border border-primary bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary" data-testid={`badge-above-${c.ticker}`}>{c.ticker}</span>) : <span className="text-muted-foreground">None (cash signal)</span>}
            <span className="text-muted-foreground">Current signals are not necessarily current holdings until the next rebalance.</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm" data-testid="table-momentum-signals">
              <caption className="sr-only">Six ETF signals versus their 200-day moving averages</caption>
              <thead className="bg-muted/50"><tr><th className={th}>ETF</th><th className={thr}>Price</th><th className={thr}>200-day SMA</th><th className={thr}>Distance</th><th className={th}>Signal</th><th className={th}>Data</th></tr></thead>
              <tbody>
                {p.candidates.map((c) => (
                  <tr key={c.ticker} className={`border-t border-border align-top ${c.aboveSma && c.status === "ready" ? "bg-primary/[0.07]" : ""}`} data-testid={`row-signal-${c.ticker}`}>
                    <td className={td}><Link href={`/stock/${c.ticker}`} className="font-mono font-semibold hover:text-primary">{c.ticker}</Link><div className="text-xs text-muted-foreground">{c.assetClass}</div><div className="text-[11px] text-muted-foreground max-w-[240px] whitespace-normal">{UNIVERSE[c.ticker] ?? c.name}</div></td>
                    <td className={tdr}>{usd(c.price)}</td>
                    <td className={tdr}>{usd(c.sma200)}</td>
                    <td className={`${tdr} ${tone(c.distancePercent)}`}>{pct(c.distancePercent)}</td>
                    <td className={td}><SignalBadge c={c} />{c.reason && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] whitespace-normal">{c.reason}</div>}</td>
                    <td className={`${td} text-[11px] text-muted-foreground`}>Price {priceStamp(c.priceDate)}<br />SMA through {date(c.smaDate)}<br />{c.sessions} sessions</td>
                  </tr>
                ))}
                {p.candidates.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Signal data not available yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function Portfolio({ p }: { p: MomentumPortfolio }) {
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
        <Stat id="next-rebalance" k="Next rebalance" v={date(p.nextRebalanceDate)} sub="quarterly" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card mb-6">
        <table className="w-full text-sm" data-testid="table-momentum-holdings">
          <caption className="sr-only">Current momentum model holdings</caption>
          <thead className="bg-muted/50"><tr><th className={th}>Holding</th><th className={th}>Entry date</th><th className={thr}>Entry PPS</th><th className={thr}>Entry SMA</th><th className={thr}>Shares</th><th className={thr}>Cost basis</th><th className={thr}>Current PPS</th><th className={thr}>Value</th><th className={thr}>Weight</th><th className={thr}>Gain</th></tr></thead>
          <tbody>
            {p.holdings.map((h) => (
              <tr key={h.ticker} className="border-t border-border" data-testid={`row-holding-${h.ticker}`}>
                <td className={td}><Link href={`/stock/${h.ticker}`} className="font-mono font-semibold hover:text-primary">{h.ticker}</Link><div className="text-xs text-muted-foreground max-w-[160px] truncate">{h.name}</div></td>
                <td className={td}>{date(h.entryDate)}</td>
                <td className={tdr}>{usd(h.entryPrice)}</td>
                <td className={tdr}>{usd(h.entrySma)}</td>
                <td className={tdr}>{num(h.shares, 8)}</td>
                <td className={tdr}>{usd(h.costBasis)}</td>
                <td className={tdr}>{usd(h.currentPrice)}<div className={`text-[10px] ${h.stale ? "text-amber-700" : "text-muted-foreground"}`}>{h.stale ? "stale · " : ""}{priceStamp(h.priceDate)}</div></td>
                <td className={tdr}>{h.currentValue == null ? <span className="text-muted-foreground">Unavailable</span> : usd(h.currentValue)}</td>
                <td className={tdr}>{h.weight == null ? NA : `${num(h.weight, 1)}%`}</td>
                <td className={`${tdr} ${tone(h.gain)}`}>{signedUsd(h.gain)}<div className="text-[10px]">{pct(h.gainPercent)}</div></td>
              </tr>
            ))}
            {p.holdings.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground" data-testid="text-all-cash">No ETF was strictly above its 200-day SMA at the last rebalance, so the portfolio is 100% cash until the next one.</td></tr>}
            <tr className="border-t border-border bg-muted/30" data-testid="row-cash">
              <td className={`${td} font-semibold`} colSpan={7}>Cash <span className="text-xs font-normal text-muted-foreground">no interest; dividends held until rebalance</span></td>
              <td className={tdr}>{usd(p.cash)}</td><td className={tdr}>{cashWeight == null ? NA : `${num(cashWeight, 1)}%`}</td><td className={tdr} />
            </tr>
            <tr className="border-t-2 border-foreground/30 font-semibold" data-testid="row-total">
              <td className={td} colSpan={5}>Total</td>
              <td className={tdr}>{usd(totalCost)}</td><td className={tdr} />
              <td className={tdr}>{p.currentValue == null ? "Unavailable" : usd(p.currentValue)}</td>
              <td className={tdr}>{p.currentValue == null ? NA : "100.0%"}</td>
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

export function MomentumView({ q }: { q: UseQueryResult<MomentumPortfolio, unknown> }) {
  const p = q.data;
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /></div>;
  if (q.isError || !p) return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm" data-testid="status-error">
      <div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle className="w-4 h-4" />Could not load the Momentum portfolio.</div>
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
      <p className="text-xs leading-5 text-muted-foreground border-t border-border pt-4">Hypothetical trend-following ETF model for education only. Not investment advice and not a guarantee of positive or uncorrelated returns. Excludes taxes, fees, and slippage; cash earns no interest. Simulated performance can differ materially from real-world outcomes.</p>
    </>
  );
}
