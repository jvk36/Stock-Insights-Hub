import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetMagicFormulaPortfolio,
  getGetMagicFormulaPortfolioQueryKey,
  type MagicFormulaPortfolio,
  type MagicFormulaRanking,
} from "@workspace/api-client-react";
import { NA, usd, num, pct, signedUsd, date, dateTime, tone, Stat, SectionTitle, PerformanceChart, History, th, thr, td, tdr } from "@/components/model-portfolio-shared";

const btn = "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const big = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return NA;
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a.toFixed(0);
  return `${v < 0 ? "-" : ""}$${s}`;
};
const ratio = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? NA : `${(v * 100).toFixed(2)}%`);
const SCHEDULE = [
  { c: 1, d: "Oct 27, 2026", r: "1-5" },
  { c: 2, d: "Jan 27, 2027", r: "6-10" },
  { c: 3, d: "Apr 27, 2027", r: "11-15" },
  { c: 4, d: "Jul 27, 2027", r: "16-20" },
];

function RankingTable({ rankings }: { rankings: MagicFormulaRanking[] }) {
  const sorted = useMemo(() => [...rankings].sort((a, b) => b.year - a.year), [rankings]);
  const [year, setYear] = useState<number | null>(null);
  const [view, setView] = useState<"ranked" | "excluded">("ranked");
  const r = sorted.find((x) => x.year === year) ?? sorted[0];
  if (!r) return <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="status-ranking-empty">No annual ranking has been frozen yet. Nothing is estimated in the meantime.</div>;
  const ranked = r.candidates.filter((c) => c.rank != null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const excluded = r.candidates.filter((c) => c.rank == null).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const reasons = Object.entries(excluded.reduce<Record<string, number>>((m, c) => { const k = c.reason ?? "Unspecified"; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="text-xs text-muted-foreground" data-testid="text-ranking-meta">
          <span className="font-semibold text-foreground">{r.year} ranking</span> · scheduled {date(r.scheduledDate)} · frozen {dateTime(r.capturedAt)} · usable from {date(r.availableOn)}
        </div>
        {sorted.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Ranking year
            <select value={r.year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" data-testid="select-ranking-year">
              {sorted.map((x) => <option key={x.year} value={x.year}>{x.year}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-border bg-card px-2 py-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Scanned</div><div className="font-mono font-semibold" data-testid="text-universe-count">{r.universeCount}</div></div>
        <div className="rounded-md border border-border bg-card px-2 py-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ranked</div><div className="font-mono font-semibold" data-testid="text-ranked-count">{ranked.length}</div></div>
        <div className="rounded-md border border-border bg-card px-2 py-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Excluded</div><div className="font-mono font-semibold" data-testid="text-excluded-count">{excluded.length}</div></div>
      </div>
      {reasons.length > 0 && (
        <ul className="mb-3 space-y-0.5 rounded-lg border border-border bg-muted/30 p-3 text-xs" data-testid="list-exclusion-coverage">
          {reasons.map(([k, n]) => <li key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="font-mono">{n}</span></li>)}
        </ul>
      )}
      <div className="mb-2 flex gap-1" role="tablist">
        {(["ranked", "excluded"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 h-7 text-xs font-medium capitalize ${view === v ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-muted"}`} data-testid={`button-view-${v}`}>{v} ({v === "ranked" ? ranked.length : excluded.length})</button>
        ))}
      </div>
      <div className="max-h-[620px] overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[980px] text-sm" data-testid={`table-ranking-${view}`}>
          <caption className="sr-only">Magic Formula ranking {r.year}</caption>
          <thead className="bg-muted sticky top-0 z-[1]"><tr>
            <th className={th}>Rank</th><th className={th}>Company</th><th className={thr}>EBIT</th><th className={thr}>EV</th><th className={thr}>Working cap.</th><th className={thr}>Net PP&E</th>
            <th className={thr}>EBIT/EV</th><th className={thr}>EY rank</th><th className={thr}>ROC</th><th className={thr}>ROC rank</th><th className={thr}>Combined</th><th className={th}>{view === "excluded" ? "Reason / source" : "Source"}</th>
          </tr></thead>
          <tbody>
            {(view === "ranked" ? ranked : excluded).map((c) => {
              const cohort = c.rank != null && c.rank <= 20 ? Math.ceil(c.rank / 5) : null;
              return (
                <tr key={c.ticker} className={`border-t border-border ${cohort ? "bg-primary/[0.06]" : ""}`} data-testid={`row-ranking-${c.ticker}`}>
                  <td className={`${td} font-mono`}>{c.rank ?? "—"}{cohort && <span className="ml-1 text-[10px] font-semibold text-primary">C{cohort}</span>}</td>
                  <td className={td}><Link href={`/stock/${c.ticker}`} className="font-mono font-semibold hover:text-primary">{c.ticker}</Link><div className="text-[11px] text-muted-foreground max-w-[180px] truncate" title={`${c.name} · ${c.sector}`}>{c.name} · {c.sector}</div></td>
                  <td className={tdr}>{big(c.ebit)}</td><td className={tdr}>{big(c.enterpriseValue)}</td><td className={tdr}>{big(c.workingCapital)}</td><td className={tdr}>{big(c.netPpe)}</td>
                  <td className={`${tdr} font-semibold`}>{ratio(c.earningsYield)}</td><td className={tdr}>{c.earningsRank ?? NA}</td>
                  <td className={`${tdr} font-semibold`}>{ratio(c.returnOnCapital)}</td><td className={tdr}>{c.capitalRank ?? NA}</td>
                  <td className={`${tdr} font-semibold`}>{c.score ?? NA}</td>
                  <td className={`${td} text-[11px] text-muted-foreground whitespace-normal min-w-[160px]`}>{c.reason && <div className="text-amber-800">{c.reason}</div>}Financials {date(c.financialDate)} · {/^https?:/.test(c.source) ? <a href={c.source} target="_blank" rel="noreferrer" className="underline text-primary">source</a> : c.source}</td>
                </tr>
              );
            })}
            {(view === "ranked" ? ranked : excluded).length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">No {view} companies in this ranking.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Intro({ p, loading }: { p?: MagicFormulaPortfolio; loading: boolean }) {
  return (
    <section>
      <SectionTitle n="01" title="Intro: good businesses at bargain prices, ranked mechanically" sub="Greenblatt's Magic Formula, the exact rules here, and the full ranking audit" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-3 text-sm leading-6 text-foreground/85">
          <h3 className="font-semibold text-foreground">Origin and rationale</h3>
          <p>Joel Greenblatt introduced the Magic Formula in his 2005 book <em>The Little Book That Beats the Market</em>. The idea is simple: buy good businesses when they are cheap, and do it with rules rather than feelings. Two ratios capture those two qualities.</p>
          <p><strong>Cheapness: earnings yield = EBIT / enterprise value.</strong> Operating profit relative to the price of the whole business, debt included, so companies with different leverage compare fairly.</p>
          <p><strong>Quality: return on capital = EBIT / (current assets - current liabilities + net PP&E).</strong> How much operating profit the business earns on the working capital and fixed assets it needs to run. Net PP&E is already net of accumulated depreciation; nothing is deducted again.</p>
          <h3 className="font-semibold text-foreground">Ranking</h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            <li>Every S&P 500 constituent is scanned. Financials and utilities are excluded, as the book prescribes, because their balance sheets make both ratios misleading.</li>
            <li>Companies with missing or non-positive EBIT, enterprise value, or capital are excluded and listed with the reason. Nothing is estimated.</li>
            <li>Each ratio is ranked descending (best = 1). The two ranks are summed; the lowest combined score ranks first. Ties are broken deterministically by ticker.</li>
            <li>The ranking is frozen once a year on October 27 and every cohort that year buys from that same frozen list.</li>
          </ul>
          <h3 className="font-semibold text-foreground">Staggered cohorts</h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            <li>Starts October 27, 2026 with {usd(30000, 0)}, split into four {usd(7500, 0)} cohorts of five stocks at {usd(1500, 0)} each.</li>
            <li>Cohort 1 buys ranks 1-5 at inception; cohort 2 ranks 6-10 on Jan 27, 2027; cohort 3 ranks 11-15 on Apr 27; cohort 4 ranks 16-20 on Jul 27.</li>
            <li>Undeployed cohort money is held as a separate cash reserve until its date, not invested early.</li>
            <li>Each cohort is sold after one year (or the next trading day) at that dated close. Its replacements use only that cohort's proceeds plus accumulated dividends; other cohorts' reserves are never spent and untouched holdings are never sold.</li>
            <li>No taxes, commissions or slippage. There is no backtest for this strategy; only live results since inception are shown.</li>
          </ul>
          <h3 className="font-semibold text-foreground">Expectations and risks</h3>
          <p>This is a long-only equity value strategy. It is not an absolute-return or uncorrelated strategy and can fall with the market. Value approaches can underperform for years, cheap stocks can be cheap for good reason, and trailing EBIT may not persist. No return is guaranteed.</p>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm" data-testid="table-cohort-schedule">
              <thead className="bg-muted/50"><tr><th className={th}>Cohort</th><th className={th}>First buy</th><th className={th}>Ranks</th><th className={thr}>Capital</th></tr></thead>
              <tbody>{SCHEDULE.map((s) => <tr key={s.c} className="border-t border-border"><td className={`${td} font-mono`}>C{s.c}</td><td className={td}>{s.d}</td><td className={`${td} font-mono`}>{s.r}</td><td className={tdr}>{usd(7500, 0)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Ranking universe and formula audit</h3>
          {loading ? <Skeleton className="h-96 w-full" /> : !p ? <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Ranking unavailable while the portfolio cannot be loaded.</div> : <RankingTable rankings={p.rankings} />}
        </div>
      </div>
    </section>
  );
}

function Live({ p }: { p: MagicFormulaPortfolio }) {
  const totalCost = p.holdings.reduce((s, h) => s + h.costBasis, 0);
  const w = (v: number) => (p.currentValue ? `${num((v / p.currentValue) * 100, 1)}%` : NA);
  const holdings = [...p.holdings].sort((a, b) => a.cohort - b.cohort || a.rank - b.rank);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 mb-5">
        <Stat id="mf-inception" k="Inception" v={date(p.inceptionDate)} sub={`Original ${usd(p.initialCapital, 0)}`} />
        <Stat id="mf-value" k="Current total" v={p.currentValue == null ? "Unavailable" : usd(p.currentValue)} sub={`valued ${dateTime(p.valuedAt)}`} />
        <Stat id="mf-gain" k="Return ($)" v={signedUsd(p.gain)} cls={tone(p.gain)} />
        <Stat id="mf-return" k="Return (%)" v={pct(p.returnPercent)} cls={tone(p.returnPercent)} sub="since inception" />
        <Stat id="mf-reserve" k="Reserved cash" v={usd(p.reservedCash)} sub="for undeployed cohorts" />
        <Stat id="mf-dividends" k="Dividend cash" v={usd(p.dividendCash)} sub={`total cash ${usd(p.cash)}`} />
      </div>
      <h3 className="text-sm font-semibold mb-2">Cohorts</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6" data-testid="list-cohorts">
        {[...p.cohorts].sort((a, b) => a.cohort - b.cohort).map((c) => (
          <div key={c.cohort} className="rounded-lg border border-border bg-card px-4 py-3 text-sm" data-testid={`card-cohort-${c.cohort}`}>
            <div className="flex items-baseline justify-between"><span className="font-mono font-semibold text-primary">C{c.cohort}</span><span className={`text-[10px] font-semibold uppercase ${c.lastTradeDate ? "text-emerald-700" : "text-amber-700"}`}>{c.lastTradeDate ? "deployed" : "awaiting"}</span></div>
            <div className="mt-1 text-xs text-muted-foreground">Scheduled {date(c.scheduledDate)} · next {date(c.nextDate)}</div>
            <div className="text-xs text-muted-foreground">Last trade {date(c.lastTradeDate)} · ranking {c.rankingYear ?? NA}</div>
            <div className="mt-1 font-mono text-xs">{c.tickers.join(", ") || "Cash reserve"}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card mb-6">
        <table className="w-full min-w-[980px] text-sm" data-testid="table-mf-holdings">
          <caption className="sr-only">Current Magic Formula holdings</caption>
          <thead className="bg-muted/50"><tr>
            <th className={th}>Holding</th><th className={th}>Cohort</th><th className={thr}>Rank</th><th className={th}>Entry date</th><th className={thr}>Entry PPS</th><th className={thr}>Shares</th><th className={thr}>Cost basis</th><th className={thr}>Current PPS</th><th className={thr}>Value</th><th className={thr}>Weight</th><th className={thr}>Gain</th>
          </tr></thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={`${h.cohort}-${h.ticker}`} className="border-t border-border" data-testid={`row-mf-holding-${h.ticker}`}>
                <td className={td}><Link href={`/stock/${h.ticker}`} className="font-mono font-semibold hover:text-primary">{h.ticker}</Link><div className="text-xs text-muted-foreground max-w-[160px] truncate">{h.name}</div></td>
                <td className={`${td} font-mono`}>C{h.cohort}</td><td className={tdr}>{h.rank}</td>
                <td className={td}>{date(h.entryDate)}</td><td className={tdr}>{usd(h.entryPrice)}</td><td className={tdr}>{num(h.shares, 6)}</td><td className={tdr}>{usd(h.costBasis)}</td>
                <td className={tdr}>{usd(h.currentPrice)}<div className={`text-[10px] ${h.stale ? "text-amber-700" : "text-muted-foreground"}`}>{h.stale ? "stale · " : ""}{date(h.priceDate)}</div></td>
                <td className={tdr}>{h.currentValue == null ? <span className="text-muted-foreground">Unavailable</span> : usd(h.currentValue)}</td>
                <td className={tdr}>{h.weight == null ? NA : `${num(h.weight, 1)}%`}</td>
                <td className={`${tdr} ${tone(h.gain)}`}>{signedUsd(h.gain)}<div className="text-[10px]">{pct(h.gainPercent)}</div></td>
              </tr>
            ))}
            {holdings.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No positions held yet.</td></tr>}
            <tr className="border-t border-border bg-muted/30"><td className={`${td} font-semibold`} colSpan={8}>Reserved cash <span className="text-xs font-normal text-muted-foreground">for cohorts not yet deployed</span></td><td className={tdr}>{usd(p.reservedCash)}</td><td className={tdr}>{w(p.reservedCash)}</td><td className={tdr} /></tr>
            <tr className="border-t border-border bg-muted/30"><td className={`${td} font-semibold`} colSpan={8}>Dividend and residual cash <span className="text-xs font-normal text-muted-foreground">reinvested only by its own cohort</span></td><td className={tdr}>{usd(p.cash - p.reservedCash)}</td><td className={tdr}>{w(p.cash - p.reservedCash)}</td><td className={tdr} /></tr>
            <tr className="border-t-2 border-foreground/30 font-semibold"><td className={td} colSpan={6}>Total</td><td className={tdr}>{usd(totalCost)}</td><td className={tdr} /><td className={tdr}>{p.currentValue == null ? "Unavailable" : usd(p.currentValue)}</td><td className={tdr}>{p.currentValue == null ? NA : "100.0%"}</td><td className={`${tdr} ${tone(p.gain)}`}>{signedUsd(p.gain)}</td></tr>
          </tbody>
        </table>
      </div>
      <h3 className="text-sm font-semibold mb-2">Performance since inception</h3>
      <PerformanceChart p={p} />
      <History p={p} />
      {p.assumptions.length > 0 && <details className="mt-4 rounded-lg border border-border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold">Accounting, pricing sources and model assumptions</summary><ul className="mt-3 space-y-2">{p.assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
    </>
  );
}

export function MagicFormulaView({ enabled }: { enabled: boolean }) {
  const q = useGetMagicFormulaPortfolio({ query: {
    queryKey: getGetMagicFormulaPortfolioQueryKey(), enabled, staleTime: 60_000, refetchIntervalInBackground: false,
    refetchInterval: (query) => (query.state.data?.status === "pending" && query.state.data.rankings.length === 0 ? 15_000 : 5 * 60_000),
  } });
  const p = q.data;
  const scanning = p?.status === "pending" && !!p.rankingProgress;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{p?.title ?? "Magic Formula"}</h2>
          <p className="text-xs text-muted-foreground font-mono">magic-formula · USD{p ? ` · refreshed ${dateTime(p.refreshedAt)}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {p && <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase ${p.status === "active" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : p.status === "stale" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-border bg-muted text-muted-foreground"}`} data-testid="status-mf-portfolio">{p.status}</span>}
          <button onClick={() => q.refetch()} disabled={q.isFetching} className={btn} data-testid="button-refresh-mf"><RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />Refresh</button>
        </div>
      </div>
      {p && (p.message || p.status !== "active" || scanning) && (
        <div className={`flex gap-2 rounded-lg border p-3 text-sm ${p.status === "stale" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border bg-muted/40"}`} data-testid="text-mf-message">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{p.message ?? (p.status === "pending" ? "The portfolio has not been funded yet. Holdings and returns appear once the first cohort is bought." : `Some prices are stale. Values as of ${dateTime(p.valuedAt)}.`)}{p.rankingProgress && <span className="block mt-1 font-mono text-xs text-muted-foreground" data-testid="text-ranking-progress">{p.rankingProgress}{scanning ? " · checking again every 15 seconds" : ""}</span>}</span>
        </div>
      )}
      <Intro p={p} loading={q.isLoading} />
      <section>
        <SectionTitle n="02" title="Model portfolio" sub={`Four staggered cohorts since ${date(p?.inceptionDate ?? "2026-10-27")}`} />
        {q.isLoading ? <div className="space-y-3"><div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /></div>
          : q.isError || !p ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm" data-testid="status-mf-error">
              <div className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle className="w-4 h-4" />Could not load the Magic Formula portfolio.</div>
              <button onClick={() => q.refetch()} className={`mt-3 ${btn}`} data-testid="button-retry-mf"><RefreshCw className="w-3.5 h-3.5" />Retry</button>
            </div>
          ) : p.status === "pending" && p.holdings.length === 0 && p.ledger.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="status-mf-pending">No holdings or returns yet. Original capital will be {usd(p.initialCapital, 0)}, with {usd(p.reservedCash || p.initialCapital, 0)} held as reserve until each cohort date. Nothing here is estimated in the meantime.</div>
          ) : <Live p={p} />}
      </section>
      <p className="text-xs leading-5 text-muted-foreground border-t border-border pt-4">Hypothetical twenty-stock equity value model for education only. Not investment advice. No absolute, uncorrelated, or above-market return is promised; value strategies can underperform for long periods. Excludes taxes, commissions, and slippage.</p>
    </>
  );
}
