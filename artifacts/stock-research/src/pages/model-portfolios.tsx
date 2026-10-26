import { useState } from "react";
import { Link } from "wouter";
import { TrendingUp, Briefcase, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetBlindTrustPortfolio,
  getGetBlindTrustPortfolioQueryKey,
  type BlindTrustPortfolio,
  type BlindTrustCandidate,
} from "@workspace/api-client-react";

const NA = "N/A";
const usd = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? NA : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? NA : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? NA : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
const signedUsd = (v: number | null | undefined) => (v == null ? NA : `${v > 0 ? "+" : v < 0 ? "-" : ""}${usd(Math.abs(v))}`);
const date = (s: string | null | undefined) => {
  if (!s) return NA;
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: s.length === 10 ? "UTC" : undefined });
};
const dateTime = (s: string | null | undefined) => (!s ? NA : s.length === 10 ? date(s) : new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));
const tone = (v: number | null | undefined) => (v == null ? "text-muted-foreground" : v > 0 ? "text-emerald-700" : v < 0 ? "text-red-700" : "");
const label = (t: string) => t.replace(/_/g, " ");

const STATUS_STYLE: Record<BlindTrustCandidate["status"], string> = {
  eligible: "border-emerald-300 bg-emerald-50 text-emerald-800",
  ineligible: "border-amber-300 bg-amber-50 text-amber-800",
  unavailable: "border-border bg-muted text-muted-foreground",
  temporary_error: "border-red-300 bg-red-50 text-red-800",
};

function Header() {
  return (
    <header className="border-b border-border bg-card sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
        <div className="flex items-center gap-2 shrink-0">
          <TrendingUp className="w-5 h-5 text-primary" />
          <span className="font-bold text-foreground tracking-tight">Terminal</span>
        </div>
        <nav className="flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]">
          {[["/macro", "Macro Summary"], ["/13f", "Top Hedge Funds - Insights"], ["/indexes", "Stock Screens"], ["/stock", "Stock Insights"], ["/watchlist", "Stock Watch"]].map(([h, t]) => (
            <Link key={h} href={h} className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap shrink-0">{t}</Link>
          ))}
          <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none whitespace-nowrap shrink-0">Model Portfolios</span>
        </nav>
      </div>
    </header>
  );
}

function Stat({ k, v, sub, cls = "", id }: { k: string; v: string; sub?: string; cls?: string; id: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3" data-testid={`stat-${id}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{k}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${cls}`}>{v}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-2 mb-4">
      <span className="font-mono text-xs text-primary font-semibold">{n}</span>
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap";
const thr = th.replace("text-left", "text-right");
const td = "px-3 py-2 whitespace-nowrap";
const tdr = `${td} text-right font-mono tabular-nums`;

function Candidates({ p }: { p: BlindTrustPortfolio }) {
  const rows = [...p.candidates].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.ticker.localeCompare(b.ticker));
  const selected = rows.filter((c) => c.selected);
  return (
    <section>
      <SectionTitle n="01" title="Intro: permanent capital, allocated by the numbers" sub="Why this portfolio exists and how it chooses" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-3 text-sm leading-6 text-foreground/85">
          <p>Blind Trust models the Berkshire Hathaway approach to <strong>permanent capital</strong>: businesses whose capital allocators can invest for the long term without regular fund redemptions. This model keeps its original capital invested and makes one annual <strong>capital allocation</strong> decision. Its value can rise or fall.</p>
          <p>The universe is fixed at nine businesses selected for their permanent-capital and capital-allocation characteristics. Each is ranked by price-to-book using verified USD inputs. The three lowest positive P/Bs receive equal shares of the pool. Missing or invalid figures are flagged, not estimated.</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            <li>Started with {usd(p.initialCapital, 0)}: one third into each of the first three picks.</li>
            <li>Each year the then-total equity (positions plus cash) is re-split equally across the current top three. Nothing is reset to the original amount.</li>
            <li>Fractional shares are allowed (needed for BRK.A). Shares and entry PPS are split-adjusted; dividends are credited as cash on ex-dividend dates and held until rebalance.</li>
            <li>Dividends are held as cash until the next rebalance.</li>
            <li>No taxes, commissions, or slippage are modelled.</li>
          </ul>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Selected today:</span>
            {selected.length ? selected.map((c) => <span key={c.ticker} className="rounded border border-primary bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary" data-testid={`badge-selected-${c.ticker}`}>{c.ticker}</span>) : <span className="text-muted-foreground">{NA}</span>}
            <span className="text-muted-foreground">— a screen of today's data, not necessarily what the portfolio holds until the next rebalance.</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm" data-testid="table-candidates">
              <caption className="sr-only">Nine candidate businesses ranked by price to book</caption>
              <thead className="bg-muted/50"><tr>
                <th className={th}>Rank</th><th className={th}>Business</th><th className={thr}>Price</th><th className={thr}>Book / sh</th><th className={thr}>P/B</th><th className={th}>Status</th><th className={th}>Sources</th>
              </tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.ticker} className={`border-t border-border ${c.selected ? "bg-primary/[0.07]" : ""}`} data-testid={`row-candidate-${c.ticker}`}>
                    <td className={`${td} font-mono`}>{c.rank ?? "—"}{c.selected && <span className="ml-1 text-[10px] font-semibold text-primary">PICK</span>}</td>
                    <td className={td}><Link href={`/stock/${c.ticker}`} className="font-mono font-semibold hover:text-primary">{c.ticker}</Link><div className="text-xs text-muted-foreground max-w-[180px] truncate" title={c.name}>{c.name}{c.providerSymbol !== c.ticker ? ` · ${c.providerSymbol}` : ""}</div></td>
                    <td className={tdr}>{usd(c.price)}</td>
                    <td className={tdr}>{usd(c.bookValue)}</td>
                    <td className={`${tdr} font-semibold`}>{c.priceToBook == null ? NA : `${num(c.priceToBook)}x`}</td>
                    <td className={td}><span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[c.status]}`}>{label(c.status)}</span>{c.reason && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] whitespace-normal">{c.reason}</div>}</td>
                    <td className={`${td} text-[11px] text-muted-foreground`}>Price {date(c.priceDate)}<br />Book {date(c.bookDate)}<br />Seen {dateTime(c.observedAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Candidate data not available yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function PerformanceChart({ p }: { p: BlindTrustPortfolio }) {
  const data = p.performance.map((x) => ({ ...x, t: new Date(x.date.length === 10 ? `${x.date}T00:00:00Z` : x.date).getTime() }));
  if (data.length === 0) return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No valuation history yet.</div>;
  return (
    <div>
      {data.length === 1 && <p className="mb-2 text-xs text-muted-foreground">Only the inception valuation exists so far. A line appears once a second dated valuation is recorded.</p>}
      <div className="h-64 rounded-lg border border-border bg-card p-2" role="img" aria-label="Portfolio value since inception; see table below for exact figures">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={data.length === 1 ? [data[0].t - 864e5 * 15, data[0].t + 864e5 * 15] : ["dataMin", "dataMax"]} tickFormatter={(v: number) => new Date(v).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })} tick={{ fontSize: 11 }} />
            <YAxis domain={["auto", "auto"]} tickFormatter={(v: number) => usd(v, 0)} tick={{ fontSize: 11 }} width={76} />
            <RTooltip labelFormatter={(v) => date(new Date(Number(v)).toISOString().slice(0, 10))} formatter={(v) => [usd(Number(v)), "Value"]} />
            <Line type="linear" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={data.length < 15} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground" data-testid="button-toggle-performance-table">Show data table ({data.length} points)</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm" data-testid="table-performance">
            <thead className="bg-muted/50 sticky top-0"><tr><th className={th}>Date</th><th className={thr}>Value</th><th className={thr}>Cash</th><th className={thr}>Return</th></tr></thead>
            <tbody>{p.performance.map((x) => <tr key={x.date} className="border-t border-border"><td className={td}>{date(x.date)}</td><td className={tdr}>{usd(x.value)}</td><td className={tdr}>{usd(x.cash)}</td><td className={`${tdr} ${tone(x.returnPercent)}`}>{pct(x.returnPercent)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function ModelPortfolio({ p }: { p: BlindTrustPortfolio }) {
  const totalCost = p.holdings.reduce((s, h) => s + h.costBasis, 0);
  const anyMissing = p.holdings.some((h) => h.currentValue == null);
  const cashWeight = p.currentValue ? (p.cash / p.currentValue) * 100 : null;
  return (
    <section>
      <SectionTitle n="02" title="Model portfolio" sub={`Positions actually held since the last rebalance (${date(p.lastRebalanceDate)}), valued ${dateTime(p.valuedAt)}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 mb-5">
        <Stat id="inception" k="Inception" v={date(p.inceptionDate)} sub={`Original ${usd(p.initialCapital, 0)}`} />
        <Stat id="current-value" k="Current total" v={p.currentValue == null ? "Unavailable" : usd(p.currentValue)} sub={`incl. cash ${usd(p.cash)}`} />
        <Stat id="gain" k="Return ($)" v={signedUsd(p.gain)} cls={tone(p.gain)} />
        <Stat id="return" k="Return (%)" v={pct(p.returnPercent)} cls={tone(p.returnPercent)} sub="since inception" />
        <Stat id="last-rebalance" k="Last rebalance" v={date(p.lastRebalanceDate)} />
        <Stat id="next-rebalance" k="Next rebalance" v={date(p.nextRebalanceDate)} sub="annual" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card mb-6">
        <table className="w-full text-sm" data-testid="table-holdings">
          <caption className="sr-only">Current model holdings</caption>
          <thead className="bg-muted/50"><tr>
            <th className={th}>Holding</th><th className={th}>Entry date</th><th className={thr}>Entry PPS</th><th className={thr}>Entry P/B</th><th className={thr}>Shares</th><th className={thr}>Cost basis</th><th className={thr}>Current PPS</th><th className={thr}>Value</th><th className={thr}>Weight</th><th className={thr}>Gain</th>
          </tr></thead>
          <tbody>
            {p.holdings.map((h) => (
              <tr key={h.ticker} className="border-t border-border" data-testid={`row-holding-${h.ticker}`}>
                <td className={td}><Link href={`/stock/${h.ticker}`} className="font-mono font-semibold hover:text-primary">{h.ticker}</Link><div className="text-xs text-muted-foreground max-w-[160px] truncate">{h.name}</div></td>
                <td className={td}>{date(h.entryDate)}</td>
                <td className={tdr}>{usd(h.entryPrice)}</td>
                <td className={tdr}>{num(h.allocationPb)}x</td>
                <td className={tdr}>{num(h.shares, 8)}</td>
                <td className={tdr}>{usd(h.costBasis)}</td>
                <td className={tdr}>{usd(h.currentPrice)}<div className={`text-[10px] ${h.stale ? "text-amber-700" : "text-muted-foreground"}`}>{h.stale ? "stale · " : ""}{date(h.priceDate)}</div></td>
                <td className={tdr}>{h.currentValue == null ? <span className="text-muted-foreground">Unavailable</span> : usd(h.currentValue)}</td>
                <td className={tdr}>{h.weight == null ? NA : `${num(h.weight, 1)}%`}</td>
                <td className={`${tdr} ${tone(h.gain)}`}>{signedUsd(h.gain)}<div className="text-[10px]">{pct(h.gainPercent)}</div></td>
              </tr>
            ))}
            {p.holdings.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">No positions held yet.</td></tr>}
            <tr className="border-t border-border bg-muted/30" data-testid="row-cash">
              <td className={`${td} font-semibold`} colSpan={7}>Cash <span className="text-xs font-normal text-muted-foreground">dividends held until rebalance</span></td>
              <td className={tdr}>{usd(p.cash)}</td><td className={tdr}>{cashWeight == null ? NA : `${num(cashWeight, 1)}%`}</td><td className={tdr} />
            </tr>
            <tr className="border-t-2 border-foreground/30 font-semibold" data-testid="row-total">
              <td className={td} colSpan={5}>Total</td>
              <td className={tdr}>{usd(totalCost)}</td><td className={tdr} />
              <td className={tdr}>{p.currentValue == null ? "Unavailable" : usd(p.currentValue)}{anyMissing && <div className="text-[10px] font-normal text-amber-700">some prices missing</div>}</td>
              <td className={tdr}>{p.currentValue == null ? NA : "100.0%"}</td>
              <td className={`${tdr} ${tone(p.gain)}`}>{signedUsd(p.gain)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-semibold mb-2">Performance since inception</h3>
      <PerformanceChart p={p} />

      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <div>
          <h3 className="text-sm font-semibold mb-2">Rebalance history</h3>
          <div className="space-y-2" data-testid="list-allocations">
            {[...p.allocations].reverse().map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card px-4 py-3 text-sm" data-testid={`card-allocation-${a.id}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold capitalize">{label(a.type)} · {date(a.date)}</span>
                  <span className="text-xs text-muted-foreground">scheduled {date(a.scheduledDate)}</span>
                </div>
                <div className="mt-1 font-mono text-xs">Equity {usd(a.equity)} · {usd(a.amountPerPosition)} each → {a.tickers.join(", ") || NA}</div>
                {a.note && <p className="mt-1 text-xs text-muted-foreground">{a.note}</p>}
              </div>
            ))}
            {p.allocations.length === 0 && <p className="text-sm text-muted-foreground">No allocations recorded.</p>}
          </div>
        </div>
        <div>
          <details open={p.ledger.length <= 12}>
            <summary className="cursor-pointer text-sm font-semibold mb-2" data-testid="button-toggle-ledger">Transaction ledger ({p.ledger.length})</summary>
            <div className="max-h-96 overflow-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm" data-testid="table-ledger">
                <thead className="bg-muted/50 sticky top-0"><tr><th className={th}>Date</th><th className={th}>Type</th><th className={th}>Ticker</th><th className={thr}>Shares</th><th className={thr}>Price</th><th className={thr}>Cash change</th></tr></thead>
                <tbody>{p.ledger.map((e) => (
                  <tr key={e.id} className="border-t border-border"><td className={td}>{date(e.date)}</td><td className={`${td} capitalize`}>{label(e.type)}</td><td className={`${td} font-mono`}>{e.ticker ?? "—"}</td><td className={tdr}>{num(e.shares, 8)}</td><td className={tdr}>{e.type === "split" ? `${num(e.price)}× split` : usd(e.price)}</td><td className={`${tdr} ${tone(e.cashChange)}`}>{signedUsd(e.cashChange)}</td></tr>
                ))}
                {p.ledger.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No transactions yet.</td></tr>}</tbody>
              </table>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

export default function ModelPortfolios() {
  const [tab] = useState("blind-trust");
  const q = useGetBlindTrustPortfolio({ query: { queryKey: getGetBlindTrustPortfolioQueryKey() } });
  const p = q.data;
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-1"><Briefcase className="w-6 h-6 text-primary" /><h1 className="text-2xl font-bold tracking-tight">Model Portfolios</h1></div>
          <p className="text-sm text-muted-foreground">Rules-based, fully auditable hypothetical portfolios. Every number traces to a dated source or ledger entry.</p>
          <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
            <Link href="/model-portfolios/blind-trust" role="tab" aria-selected={tab === "blind-trust"} data-testid="tab-blind-trust" className="-mb-px border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground whitespace-nowrap">Blind Trust</Link>
          </div>
        </div>

        {q.isLoading ? (
          <div className="space-y-4"><Skeleton className="h-40 w-full" /><div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /></div>
        ) : q.isError || !p ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm" data-testid="status-error">
            <div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle className="w-4 h-4" />Could not load the Blind Trust portfolio.</div>
            <button onClick={() => q.refetch()} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-xs font-medium hover:bg-muted" data-testid="button-retry"><RefreshCw className="w-3.5 h-3.5" />Retry</button>
          </div>
        ) : (
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
            <Candidates p={p} />
            {p.status === "pending" ? (
              <section><SectionTitle n="02" title="Model portfolio" sub="Awaiting inception" />
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No inception date, holdings, or returns yet. Original capital will be {usd(p.initialCapital, 0)}. Nothing here is estimated in the meantime.</div>
              </section>
            ) : <ModelPortfolio p={p} />}
            <p className="text-xs leading-5 text-muted-foreground border-t border-border pt-4">Hypothetical, concentrated three-stock model for education only. Not investment advice and not a guarantee of future results. Excludes taxes, commissions, and slippage. Past and simulated performance can differ materially from real-world outcomes.</p>
          </>
        )}
      </main>
    </div>
  );
}
