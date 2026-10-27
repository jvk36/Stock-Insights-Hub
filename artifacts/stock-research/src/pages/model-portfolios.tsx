import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { MomentumView } from "@/components/momentum-portfolio";
import { LazyView } from "@/components/lazy-portfolio";
import { CloningView } from "@/components/cloning-portfolio";
import { PortfolioBacktest } from "@/components/portfolio-backtest";
import { TrendingUp, Briefcase, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { NA, usd, num, pct, signedUsd, date, dateTime, tone, label, Stat, SectionTitle, PerformanceChart, History, th, thr, td, tdr } from "@/components/model-portfolio-shared";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetBlindTrustPortfolio,
  getGetBlindTrustPortfolioQueryKey,
  type BlindTrustPortfolio,
  type BlindTrustCandidate,
  useGetMomentumPortfolio,
  getGetMomentumPortfolioQueryKey,
  useGetLazyPortfolio,
  getGetLazyPortfolioQueryKey,
} from "@workspace/api-client-react";

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

function Candidates({ p }: { p: BlindTrustPortfolio }) {
  const rows = [...p.candidates].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.ticker.localeCompare(b.ticker));
  const selected = rows.filter((c) => c.selected);
  return (
    <section>
      <SectionTitle n="01" title="Intro: permanent capital, allocated by the numbers" sub="Why this portfolio exists and how it chooses" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-3 text-sm leading-6 text-foreground/85">
          <h3 className="font-semibold text-foreground">Strategy and investment rationale</h3>
          <p>Blind Trust seeks to participate in the long-term compounding of businesses that broadly resemble Berkshire Hathaway's <strong>permanent-capital and capital-allocation model</strong>. In a listed business, managers can retain and redeploy capital without meeting routine investor redemptions as an open-ended fund would. Depending on the business, capital can be directed toward operating subsidiaries, acquisitions, securities, debt reduction, or share repurchases.</p>
          <p>The investor is effectively delegating ongoing investment decisions to these companies' capital allocators. The premise is that capable managers may compound capital over time, and a lower purchase price relative to net assets may improve the starting valuation. This is a simplified valuation screen, however—not a fresh assessment of management skill or intrinsic value at every rebalance. “Blind Trust” is the strategy's name; it is not a legal trust, a fiduciary arrangement, or an investment in Berkshire alone.</p>
          <h3 className="font-semibold text-foreground">Exactly how the portfolio operates</h3>
          <p>The fixed universe comprises <strong>Berkshire Hathaway (BRK.A), Markel (MKL), Fairfax Financial (FRFHF), Jefferies (JEF), Loews (L), Howard Hughes (HHH), Pershing Square USA (PSUS), and Boston Omaha (BOC)</strong>. Their structures and sources of earnings differ; they are not interchangeable Berkshire replicas. The model ranks eligible businesses by the lowest positive <strong>price-to-book ratio (P/B)</strong>, calculated as share price divided by reported book value per share, using consistent USD inputs. PSUS instead uses its officially published net asset value (NAV) per share.</p>
          <p>The three lowest positive ratios receive equal allocations—initially $10,000 each from a $30,000 portfolio. At the annual review, current P/Bs are recomputed and the entire then-current portfolio value is divided equally among the new top three. Names can enter or leave; there is no discretionary override based on a forecast. Missing or invalid inputs are flagged rather than estimated, and incomplete required data can defer rebalancing. Today's candidate rankings can differ from holdings until the next annual rebalance.</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            <li>Started with {usd(p.initialCapital, 0)}: one third into each of the first three picks.</li>
            <li>Each year the then-total equity (positions plus cash) is re-split equally across the current top three. Nothing is reset to the original amount.</li>
            <li>Inception is October 26, 2026, using that session's opening prices for ranking and purchases. Future annual rebalances use completed-session closing prices.</li>
            <li>Fractional shares are allowed (needed for BRK.A). Shares and entry PPS are split-adjusted; dividends are credited as cash on ex-dividend dates and held until rebalance. Purchases at the open do not receive that day's ex-dividend entitlement.</li>
            <li>Dividends are held as cash until the next rebalance.</li>
            <li>No taxes, commissions, or slippage are modelled.</li>
          </ul>
          <h3 className="font-semibold text-foreground">Return expectations and principal risks</h3>
          <p>The objective is <strong>long-term capital appreciation and compounding</strong>, supported by growth in business value and potentially a narrowing valuation discount. This is a concentrated equity value strategy, not a market-neutral or inherently uncorrelated absolute-return strategy. Its returns will remain exposed to stock-market conditions, the selected businesses, and management decisions. Permanent capital describes the corporate funding structure; it does not mean that an investor's principal is protected.</p>
          <p>A low P/B can reflect genuine undervaluation—or weak profitability, asset impairments, leverage, or poor capital allocation. Book values are reported with a lag, accounting differs across businesses, and book value or NAV need not equal realizable economic value. Insurance losses, credit cycles, real-estate conditions, foreign-currency exposure, and closed-end-fund discounts can affect the candidates differently. Holding only three names creates substantial company and sector concentration, and annual reviews leave the portfolio exposed between rebalances. Returns can be negative for extended periods; neither outperformance nor a fixed annual return is promised.</p>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Selected today:</span>
            {selected.length ? selected.map((c) => <span key={c.ticker} className="rounded border border-primary bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary" data-testid={`badge-selected-${c.ticker}`}>{c.ticker}</span>) : <span className="text-muted-foreground">{NA}</span>}
            <span className="text-muted-foreground">— a screen of today's data, not necessarily what the portfolio holds until the next rebalance.</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm" data-testid="table-candidates">
              <caption className="sr-only">Eight candidate businesses ranked by price to book</caption>
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
                    <td className={`${td} text-[11px] text-muted-foreground`}>Price {date(c.priceDate)}<br />{c.bookValueLabel ?? "Book"} {date(c.bookDate)}<br />{c.bookSource && <><a href={c.bookSource} target="_blank" rel="noreferrer" className="underline text-primary">Official NAV source</a><br /></>}Seen {dateTime(c.observedAt)}</td>
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

function ModelPortfolio({ p }: { p: BlindTrustPortfolio }) {
  const totalCost = p.holdings.reduce((s, h) => s + h.costBasis, 0);
  const anyMissing = p.holdings.some((h) => h.currentValue == null);
  const cashWeight = p.currentValue ? (p.cash / p.currentValue) * 100 : null;
  return (
    <section>
      <SectionTitle n="02" title="Model portfolio" sub={`Positions actually held since the last rebalance (${date(p.lastRebalanceDate)}), valued at ${p.valuationBasis === "open" ? "opening" : "closing"} prices on ${dateTime(p.valuedAt)}`} />
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

      <History p={p} />
    </section>
  );
}

export default function ModelPortfolios() {
  const [location] = useLocation();
  const tab = location.startsWith("/model-portfolios/cloning") ? "cloning" : location.startsWith("/model-portfolios/blind-trust") ? "blind-trust" : location.startsWith("/model-portfolios/lazy") ? "lazy" : "momentum";
  const live = { staleTime: 60_000, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false };
  const q = useGetBlindTrustPortfolio({ query: { queryKey: getGetBlindTrustPortfolioQueryKey(), enabled: tab === "blind-trust", ...live } });
  const mq = useGetMomentumPortfolio({ query: { queryKey: getGetMomentumPortfolioQueryKey(), enabled: tab === "momentum", ...live } });
  const lq = useGetLazyPortfolio({ query: { queryKey: getGetLazyPortfolioQueryKey(), enabled: tab === "lazy", ...live } });
  const p = q.data;
  useEffect(() => {
    const t = tab === "cloning" ? "Cloning Model Portfolio | Terminal" : tab === "lazy" ? "Lazy Model Portfolio | Terminal" : tab === "momentum" ? "Momentum Model Portfolio | Terminal" : "Blind Trust Model Portfolio | Terminal";
    const d = tab === "cloning" ? "Cloning: a quarterly point-in-time 13F model buying each tracked manager's largest new purchase by added weight, with holdings, allocations and a ten-year backtest." : tab === "lazy" ? "Lazy: a Swensen-inspired fixed-weight six-ETF model, rebalanced quarterly, with target vs current weights, ledger and performance since inception." : tab === "momentum" ? "Quarterly 200-day SMA trend model across six Vanguard and iShares ETFs: signals, holdings, ledger and performance since inception." : "Blind Trust: an annual price-to-book model portfolio of permanent-capital businesses, with holdings, ledger and performance.";
    document.title = t;
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content", d);
  }, [tab]);
  const tabCls = (on: boolean) => `-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${on ? "border-primary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground"}`;
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-1"><Briefcase className="w-6 h-6 text-primary" /><h1 className="text-2xl font-bold tracking-tight">Model Portfolios</h1></div>
          <p className="text-sm text-muted-foreground">Rules-based, fully auditable hypothetical portfolios. Every number traces to a dated source or ledger entry.</p>
          <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
            <Link href="/model-portfolios/momentum" role="tab" aria-selected={tab === "momentum"} data-testid="tab-momentum" className={tabCls(tab === "momentum")}>Momentum</Link>
            <Link href="/model-portfolios/lazy" role="tab" aria-selected={tab === "lazy"} data-testid="tab-lazy" className={tabCls(tab === "lazy")}>Lazy</Link>
            <Link href="/model-portfolios/blind-trust" role="tab" aria-selected={tab === "blind-trust"} data-testid="tab-blind-trust" className={tabCls(tab === "blind-trust")}>Blind Trust</Link>
            <Link href="/model-portfolios/cloning" role="tab" aria-selected={tab === "cloning"} data-testid="tab-cloning" className={tabCls(tab === "cloning")}>Cloning</Link>
          </div>
        </div>

        {tab === "cloning" ? <CloningView enabled /> : tab === "lazy" ? <LazyView q={lq} /> : tab === "momentum" ? <MomentumView q={mq} /> : q.isLoading ? (
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
            <PortfolioBacktest strategy="blind-trust" />
            <p className="text-xs leading-5 text-muted-foreground border-t border-border pt-4">Hypothetical, concentrated three-stock model for education only. Not investment advice and not a guarantee of future results. Excludes taxes, commissions, and slippage. Past and simulated performance can differ materially from real-world outcomes.</p>
          </>
        )}
      </main>
    </div>
  );
}
