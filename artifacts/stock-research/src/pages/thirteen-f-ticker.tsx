import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, ChevronDown, RefreshCw, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import Seo from "@/components/Seo";
import { fmtUsd, fmtP } from "@/components/thirteen-f/summary-tabs";
import {
  useGet13fTickerOwnership,
  getGet13fTickerOwnershipQueryKey,
  type ThirteenFSummaryPosition,
} from "@workspace/api-client-react";

const DASH = "\u2014";
const TICKER_RE = /^[A-Z0-9^][A-Z0-9.^=_-]{0,31}$/;

const ACT: Record<string, { text: string; cls: string; hint?: string }> = {
  buy: { text: "New position", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  increase: { text: "Added", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  decrease: { text: "Trimmed", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  sell: { text: "Sold out", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  unchanged: { text: "Unchanged", cls: "bg-muted text-muted-foreground border-border" },
  unavailable: {
    text: "Change unknown",
    cls: "bg-transparent text-muted-foreground border-dashed border-border",
    hint: "The exact prior quarter is missing or the position fell outside retained data, so new/added/sold cannot be determined.",
  },
};
function Badge({ a }: { a: string }) {
  const s = ACT[a] ?? ACT.unavailable;
  return <span title={s.hint} className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${s.cls}`}>{s.text}</span>;
}

const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground";
const td = "px-3 py-2.5 align-top";

function FundName({ p }: { p: ThirteenFSummaryPosition }) {
  return (
    <Link href={`/13f/${p.fundSlug}`} className="font-medium hover:text-primary hover:underline" data-testid={`link-fund-${p.fundSlug}`}>
      {p.fundName}
    </Link>
  );
}

function Section({ title, sub, children, testId }: { title: string; sub: ReactNode; children: ReactNode; testId: string }) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export default function ThirteenFTicker() {
  const params = useParams();
  let ticker = "";
  try { ticker = decodeURIComponent(params.ticker ?? "").trim().toUpperCase(); }
  catch { /* Malformed percent escapes render the invalid-symbol state, not a crashed page. */ }
  const valid = TICKER_RE.test(ticker);
  const q = useGet13fTickerOwnership(ticker, {
    query: { queryKey: getGet13fTickerOwnershipQueryKey(ticker), staleTime: 60000, refetchInterval: 60000, enabled: valid },
  });
  const [pendingOpen, setPendingOpen] = useState(false);
  const data = q.data;

  const groups = useMemo(() => {
    const ps = data?.positions ?? [];
    const current = ps.filter((p) => p.marketValue > 0).sort((a, b) => b.marketValue - a.marketValue || a.fundName.localeCompare(b.fundName));
    const sold = ps.filter((p) => p.marketValue <= 0 && p.activity === "sell").sort((a, b) => (b.sellPct ?? -1) - (a.sellPct ?? -1) || a.fundName.localeCompare(b.fundName));
    const unknown = ps.filter((p) => p.marketValue <= 0 && p.activity !== "sell").sort((a, b) => (b.priorMarketValue ?? -1) - (a.priorMarketValue ?? -1) || a.fundName.localeCompare(b.fundName));
    const total = current.reduce((s, p) => s + p.marketValue, 0);
    const count = (k: string) => current.filter((p) => p.activity === k).length;
    return { current, sold, unknown, total, newC: count("buy"), addC: count("increase"), trimC: count("decrease"), sameC: count("unchanged"), unkC: count("unavailable") };
  }, [data]);

  const name = data?.positions.find((p) => p.name)?.name;
  const title = `${ticker || "Ticker"} Hedge Fund Ownership (13F)${data?.quarter ? ` ${data.quarter}` : ""}`;
  const desc = `Which tracked hedge funds reported holding ${ticker}${name ? ` (${name})` : ""} in their latest SEC 13F filings, with new buys, adds, trims and exits.`;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <Seo title={title} description={desc} path={`/13f/ticker/${encodeURIComponent(ticker)}`} type="article" schema={{
        "@type": "WebPage", name: title, description: desc,
        breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "13F Holdings", item: "https://diyabsolutereturns.com/13f" },
          { "@type": "ListItem", position: 2, name: ticker },
        ] },
      }} />
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-tight">Terminal</span>
          </div>
          <nav className="flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]">
            <Link href="/13f" className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md whitespace-nowrap">Hedge Fund Blueprint</Link>
            <Link href="/model-portfolios" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md whitespace-nowrap">Algo-Portfolios</Link>
            <Link href="/indexes" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md whitespace-nowrap">Stock Screens</Link>
            <Link href="/stock" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md whitespace-nowrap">Risk &amp; Returns Lab</Link>
            <Link href="/watchlist" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md whitespace-nowrap">Stock Watch</Link>
            <Link href="/macro" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md whitespace-nowrap">Macro Summary</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-8">
        <Link href="/13f" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary" data-testid="link-back-blueprint">
          <ArrowLeft className="h-4 w-4" /> Back to Hedge Fund Blueprint
        </Link>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold">Reported 13F ownership</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono" data-testid="text-ticker">{ticker || DASH}</span>
            {name && <span className="text-lg sm:text-xl font-medium text-muted-foreground">{name}</span>}
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Positions as of each manager's reported {data?.quarter ?? "latest"} quarter-end. 13F filings are delayed up to 45 days and are not live ownership.
          </p>
        </motion.div>

        {!valid ? (
          <Empty text={`"${params.ticker ?? ""}" is not a valid ticker symbol. Return to the Blueprint and choose a security from the tables.`} />
        ) : q.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : q.isError || !data ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 flex flex-col items-start gap-3">
            <div className="flex items-center gap-2 text-destructive font-medium"><AlertTriangle className="h-4 w-4" /> Could not load ownership for {ticker}.</div>
            <button onClick={() => q.refetch()} data-testid="button-retry" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        ) : (
          <>
            {/* Coverage + stats */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {([
                  ["Quarter", data.quarter ?? DASH],
                  ["Current holders", groups.current.length],
                  ["Combined value", fmtUsd(groups.current.length ? groups.total : null)],
                  ["New / Added", `${groups.newC} / ${groups.addC}`],
                  ["Trimmed / Sold out", `${groups.trimC} / ${groups.sold.length}`],
                  ["Reporting", <>{data.reportingFundCount}<span className="text-sm text-muted-foreground"> of {data.trackedFundCount}</span></>],
                ] as [string, ReactNode][]).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
                    <div className="text-xl font-semibold font-mono tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{data.comparisonFundCount} managers comparable vs {data.previousQuarter ?? DASH}; others show change as unknown.</span>
                <span>Only {data.quarter ?? "latest-quarter"} filings count; older quarters are never substituted.</span>
                <span>Updated {new Date(data.generatedAt).toLocaleString()}</span>
              </div>
              {data.pendingFunds.length > 0 && (
                <div>
                  <button onClick={() => setPendingOpen((o) => !o)} aria-expanded={pendingOpen} data-testid="button-pending-funds" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${pendingOpen ? "rotate-180" : ""}`} />
                    {data.pendingFunds.length} funds awaiting {data.quarter ?? "latest-quarter"} data (not counted)
                  </button>
                  {pendingOpen && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {data.pendingFunds.map((f) => <li key={f} className="rounded border border-border bg-card px-2 py-0.5 text-xs">{f}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {data.quarter == null ? (
              <Empty text="Latest-quarter filings have not loaded yet. Ownership appears once filings finish loading." />
            ) : (
              <>
                <Section testId="section-current" title="Current holders" sub={<>Managers reporting {ticker} at {data.quarter} quarter-end, sorted by position value.{groups.unkC > 0 && ` ${groups.unkC} show change as unknown.`}</>}>
                  {groups.current.length === 0 ? (
                    <Empty text={`No tracked manager reported holding ${ticker} in ${data.quarter}.`} />
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border bg-card">
                      <table className="w-full text-sm">
                        <thead className="border-b border-border bg-muted/30">
                          <tr>
                            <th className={th}>#</th><th className={th}>Fund</th>
                            <th className={`${th} text-right`}>Value</th>
                            <th className={`${th} text-right`}>% of fund</th>
                            <th className={`${th} text-right hidden sm:table-cell`}>Buy % / Sell %</th>
                            <th className={th}>Activity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.current.map((p, i) => (
                            <tr key={p.fundCik} className="border-b border-border/50 hover:bg-muted/20" data-testid={`row-holder-${p.fundSlug}`}>
                              <td className={`${td} text-muted-foreground font-mono text-xs`}>{i + 1}</td>
                              <td className={td}><FundName p={p} /></td>
                              <td className={`${td} text-right font-mono tabular-nums`}>{fmtUsd(p.marketValue)}</td>
                              <td className={`${td} text-right font-mono tabular-nums font-semibold`}>{fmtP(p.portfolioPct)}</td>
                              <td className={`${td} text-right font-mono tabular-nums hidden sm:table-cell`}>
                                <span className="text-emerald-600">{fmtP(p.buyPct)}</span> <span className="text-muted-foreground">/</span> <span className="text-rose-600">{fmtP(p.sellPct)}</span>
                              </td>
                              <td className={td}><Badge a={p.activity} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>

                <Section testId="section-sold" title="Sold out this quarter" sub={`Held in ${data.previousQuarter ?? "the prior quarter"}, confirmed absent in ${data.quarter}. Not counted as holders.`}>
                  {groups.sold.length === 0 ? <Empty text="No confirmed exits this quarter." /> : (
                    <div className="overflow-x-auto rounded-lg border border-border bg-card">
                      <table className="w-full text-sm">
                        <thead className="border-b border-border bg-muted/30">
                          <tr><th className={th}>Fund</th><th className={`${th} text-right`}>Prior value</th><th className={`${th} text-right`}>Sell % of fund</th></tr>
                        </thead>
                        <tbody>
                          {groups.sold.map((p) => (
                            <tr key={p.fundCik} className="border-b border-border/50" data-testid={`row-sold-${p.fundSlug}`}>
                              <td className={td}><FundName p={p} /></td>
                              <td className={`${td} text-right font-mono tabular-nums`}>{fmtUsd(p.priorMarketValue)}</td>
                              <td className={`${td} text-right font-mono tabular-nums text-rose-600`}>{fmtP(p.sellPct)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>

                {groups.unknown.length > 0 && (
                  <Section testId="section-unknown" title="Prior positions, current status unknown" sub="These managers held it previously, but available data cannot confirm whether they still do. Not counted as holders or exits.">
                    <ul className="divide-y divide-border/60 rounded-lg border border-dashed border-border bg-card/60">
                      {groups.unknown.map((p) => (
                        <li key={p.fundCik} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                          <FundName p={p} />
                          <span className="font-mono text-xs text-muted-foreground">Prior value {fmtUsd(p.priorMarketValue)}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            )}

            <details className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer text-sm font-medium text-foreground">How to read this</summary>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>Covers only the hedge funds tracked in the Blueprint, not all institutions. Values are reported quarter-end USD, not live prices.</li>
                <li>Uses each manager's stored individual holdings. Where a fund's tail beyond its top 100 was imported only as an aggregated Miscellaneous line, those positions cannot be identified and are not shown.</li>
                <li>Buy % and Sell % estimate shares added or reduced, valued at quarter-end, as a percentage of the fund's portfolio. They are not percentage changes in share count, verified execution prices or actual trading cash flows.</li>
                <li>When the exact preceding quarter is missing or retention limits hide the prior position, activity shows as unknown rather than new or sold.</li>
              </ul>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
