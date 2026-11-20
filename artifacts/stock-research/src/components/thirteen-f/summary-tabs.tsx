import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { TickerOwnershipLink } from "@/components/thirteen-f/ticker-link";
import { AlertTriangle, ChevronDown, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useGet13fSummary,
  getGet13fSummaryQueryKey,
  type ThirteenFSummary,
  type ThirteenFSummaryPosition,
  type ThirteenFSummaryStock,
} from "@workspace/api-client-react";

// ─── Formatting ────────────────────────────────────────────────────────────────
const DASH = "\u2014";
export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
export function fmtP(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${v.toFixed(d)}%`;
}
const label = (s: { ticker: string | null; name: string; securityKey: string }) => s.ticker ?? s.name ?? s.securityKey;
const tieKey = (s: { ticker: string | null; securityKey: string }) => s.ticker ?? `~${s.securityKey}`;

const ACTIVITY: Record<string, { text: string; cls: string }> = {
  buy: { text: "New buy", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  increase: { text: "Added", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  decrease: { text: "Trimmed", cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  sell: { text: "Sold out", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  unchanged: { text: "Unchanged", cls: "bg-muted text-muted-foreground border-border" },
  unavailable: { text: DASH, cls: "bg-transparent text-muted-foreground border-border" },
};
function ActivityBadge({ a }: { a: string }) {
  const s = ACTIVITY[a] ?? ACTIVITY.unavailable;
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${s.cls}`}
      title={a === "unavailable" ? "Comparable quarter or retained top-100 position is unavailable." : undefined}
    >
      {s.text}
    </span>
  );
}

const triggerCls =
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm";

// ─── Shared shell ──────────────────────────────────────────────────────────────
type Ctx = { data: ThirteenFSummary; openTicker: (key: string) => void };

function useSummary() {
  return useGet13fSummary({
    query: { queryKey: getGet13fSummaryQueryKey(), refetchInterval: 60000, refetchOnWindowFocus: true },
  });
}

function SummaryShell({ children }: { children: (ctx: Ctx) => ReactNode }) {
  const q = useSummary();
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-destructive font-medium">
          <AlertTriangle className="h-4 w-4" /> Could not load the hedge fund summary.
        </div>
        <button
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }
  const data = q.data;
  return (
    <div className="space-y-5">
      <CoverageBanner data={data} />
      {data.quarter == null || data.positions.length === 0 ? (
        <EmptyState text="Latest-quarter holdings are not available yet. Summary statistics appear once filings have finished loading." />
      ) : (
        children({ data, openTicker: setOpenKey })
      )}
      <TickerDetailDialog data={data} securityKey={openKey} onClose={() => setOpenKey(null)} />
      <Methodology />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function CoverageBanner({ data }: { data: ThirteenFSummary }) {
  const [open, setOpen] = useState(false);
  const stats: [string, ReactNode][] = [
    ["Latest quarter", data.quarter ?? DASH],
    ["Reporting", <>{data.reportingFundCount}<span className="text-muted-foreground text-sm"> of {data.trackedFundCount}</span></>],
    ["Comparable vs " + (data.previousQuarter ?? DASH), data.comparisonFundCount],
    ["Retained positions", data.retainedPositionCount],
    ["Combined value", fmtUsd(data.totalValue)],
  ];
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map(([k, v]) => (
          <div key={k}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="text-xl font-semibold font-mono tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Only managers with loaded {data.quarter ?? DASH} filings are included; older quarters are not substituted.</span>
        {data.unresolvedPositionCount > 0 && <span>{data.unresolvedPositionCount} positions shown by CUSIP/name (no ticker).</span>}
        <span>Updated {new Date(data.generatedAt).toLocaleString()}</span>
      </div>
      {data.pendingFunds.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            {data.pendingFunds.length} funds awaiting {data.quarter ?? "latest-quarter"} data
          </button>
          {open && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {data.pendingFunds.map((f) => (
                <li key={f} className="rounded border border-border bg-card px-2 py-0.5 text-xs">{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Methodology() {
  return (
    <details className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
      <summary className="cursor-pointer text-sm font-medium text-foreground">Methodology</summary>
      <ul className="mt-3 list-disc pl-5 space-y-1.5">
        <li>Rankings use up to 100 verified stock positions per manager. ETFs, warrants, other non-stock instruments, and unverified ticker matches are grouped under Miscellaneous and excluded here.</li>
        <li>Biggest Bets weights use each fund's full reported portfolio value. The combined Summary Portfolio denominator is the sum of retained top-100 positions only.</li>
        <li>Buys as % = added shares valued at the current quarter-end per-share value, divided by the current full fund value, times 100.</li>
        <li>Sells as % = reduced shares valued at the prior quarter-end per-share value, divided by the prior full fund value, times 100.</li>
        <li>Activity is estimated from reported share changes, not trade executions. Splits and reorganizations may affect counts.</li>
        <li>No comparison is shown when the exact preceding quarter is missing or an unmatched position could sit outside either quarter's top 100. Unknown values show {DASH}.</li>
      </ul>
    </details>
  );
}

// ─── Table helpers ─────────────────────────────────────────────────────────────
const PAGE = 50;
function useSearchPaged<T>(rows: T[], text: (r: T) => string) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => text(r).toLowerCase().includes(s)) : rows;
  }, [rows, q, text]);
  return { q, setQ: (v: string) => { setQ(v); setLimit(PAGE); }, filtered, shown: filtered.slice(0, limit), more: () => setLimit((l) => l + PAGE) };
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8 bg-card" aria-label={placeholder} />
    </div>
  );
}

function LoadMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
      <span>Showing {Math.min(shown, total)} of {total}</span>
      {shown < total && (
        <button onClick={onMore} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted">
          Load {Math.min(PAGE, total - shown)} more
        </button>
      )}
    </div>
  );
}

function TickerButton({ s, onOpen }: { s: { ticker: string | null; name: string; securityKey: string }; onOpen: (k: string) => void }) {
  return (
    <div className="text-left">
      {s.ticker ? (
        <TickerOwnershipLink ticker={s.ticker} className="font-mono font-semibold hover:text-primary hover:underline" />
      ) : (
        <span className="font-mono font-semibold text-amber-500">{s.securityKey}</span>
      )}
      <span className="block text-xs text-muted-foreground truncate max-w-[220px]">{s.name}</span>
      <button type="button" onClick={() => onOpen(s.securityKey)} className="mt-1 text-[11px] text-muted-foreground hover:text-primary hover:underline" aria-label={`View managers holding ${label(s)}`}>Fund activity</button>
    </div>
  );
}

function FundLink({ p }: { p: ThirteenFSummaryPosition }) {
  return (
    <Link href={`/13f/${p.fundSlug}`} className="hover:text-primary hover:underline">
      {p.fundName}
    </Link>
  );
}

const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground";
const td = "px-3 py-2 align-top";

// ─── Position ranking tabs (Biggest Bets / Top Buys) ──────────────────────────
function PositionRanking({ ctx, mode }: { ctx: Ctx; mode: "bets" | "buys" }) {
  const rows = useMemo(() => {
    const base = ctx.data.positions.filter((p) =>
      mode === "bets" ? p.activity !== "sell" && p.marketValue > 0 : p.buyPct != null && p.buyPct > 0,
    );
    const val = (p: ThirteenFSummaryPosition) => (mode === "bets" ? p.portfolioPct : p.buyPct ?? 0);
    return [...base].sort((a, b) => val(b) - val(a) || tieKey(a).localeCompare(tieKey(b)) || a.fundName.localeCompare(b.fundName));
  }, [ctx.data.positions, mode]);
  const textFn = useMemo(() => (p: ThirteenFSummaryPosition) => `${p.ticker ?? ""} ${p.name} ${p.fundName} ${p.securityKey}`, []);
  const t = useSearchPaged(rows, textFn);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {mode === "bets"
          ? "Individual fund positions ranked by weight in that fund's full reported portfolio."
          : "Individual fund purchases ranked by estimated buy size as a share of that fund's current portfolio."}
      </p>
      <SearchBox value={t.q} onChange={t.setQ} placeholder="Search ticker, company or fund" />
      {t.filtered.length === 0 ? (
        <EmptyState text={rows.length === 0 ? (mode === "buys" ? "No measurable buys this quarter." : "No current positions.") : "No matches for that search."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Security</th>
                <th className={th}>Fund</th>
                <th className={`${th} text-right`}>{mode === "bets" ? "% of portfolio" : "Buy as % of portfolio"}</th>
                <th className={`${th} text-right hidden sm:table-cell`}>{mode === "bets" ? "Value" : "% of portfolio"}</th>
                <th className={`${th} hidden md:table-cell`}>Activity</th>
              </tr>
            </thead>
            <tbody>
              {t.shown.map((p, i) => (
                <tr key={`${p.fundCik}-${p.securityKey}`} className="border-b border-border/50 hover:bg-muted/20">
                  <td className={`${td} text-muted-foreground font-mono text-xs`}>{i + 1}</td>
                  <td className={td}><TickerButton s={p} onOpen={ctx.openTicker} /></td>
                  <td className={td}><FundLink p={p} /></td>
                  <td className={`${td} text-right font-mono tabular-nums font-semibold`}>{fmtP(mode === "bets" ? p.portfolioPct : p.buyPct)}</td>
                  <td className={`${td} text-right font-mono tabular-nums hidden sm:table-cell`}>{mode === "bets" ? fmtUsd(p.marketValue) : fmtP(p.portfolioPct)}</td>
                  <td className={`${td} hidden md:table-cell`}><ActivityBadge a={p.activity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore shown={t.shown.length} total={t.filtered.length} onMore={t.more} />
    </div>
  );
}

// ─── Summary Stats heat grids ─────────────────────────────────────────────────
type CountField = "ownershipCount" | "buyCount" | "sellCount";
const GRID_META: Record<CountField, { title: string; noun: string; hue: string }> = {
  ownershipCount: { title: "Ownership Count", noun: "managers own", hue: "217 80% 55%" },
  buyCount: { title: "Qtr Buys Count", noun: "managers bought", hue: "152 60% 42%" },
  sellCount: { title: "Qtr Sells Count", noun: "managers sold", hue: "350 72% 55%" },
};

function CountGrid({ ctx, field }: { ctx: Ctx; field: CountField }) {
  const meta = GRID_META[field];
  const top = useMemo(
    () =>
      ctx.data.stocks
        .filter((s) => s[field] > 0)
        .sort((a, b) => b[field] - a[field] || tieKey(a).localeCompare(tieKey(b)))
        .slice(0, 100),
    [ctx.data.stocks, field],
  );
  if (top.length === 0) return <EmptyState text={`No securities with a ${meta.title.toLowerCase()} this quarter.`} />;
  const max = top[0][field];
  const min = top[top.length - 1][field];
  const alpha = (n: number) => (max === min ? 0.85 : 0.15 + 0.75 * ((n - min) / (max - min)));
  const steps = max === min ? [max] : Array.from(new Set([min, Math.round(min + (max - min) / 3), Math.round(min + (2 * (max - min)) / 3), max]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Top {top.length} by {meta.title.toLowerCase()}. Darker = more managers.</span>
        <div className="flex items-center gap-1" aria-label="Color intensity legend">
          {steps.map((n) => (
            <span key={n} className="flex items-center gap-1">
              <span className="h-3 w-5 rounded-sm border border-border" style={{ background: `hsl(${meta.hue} / ${alpha(n)})` }} />
              <span className="font-mono">{n}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-1.5" role="list">
        {top.map((s: ThirteenFSummaryStock, i) => {
          const a = alpha(s[field]);
          return (
            <div
              key={s.securityKey}
              role="listitem"
              title={`${s.name} - ${s[field]} ${meta.noun}`}
              className="rounded-md border border-border/60 p-2 text-left transition-transform hover:scale-[1.04]"
              style={{ background: `hsl(${meta.hue} / ${a})` }}
            >
              <div className={`font-mono text-xs font-bold truncate ${a > 0.55 ? "text-white" : "text-foreground"}`}>
                {s.ticker ? <TickerOwnershipLink ticker={s.ticker} className="hover:underline" /> : s.name}
              </div>
              <button type="button" onClick={() => ctx.openTicker(s.securityKey)} className={`font-mono text-lg tabular-nums leading-tight hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded ${a > 0.55 ? "text-white" : "text-foreground"}`} aria-label={`Rank ${i + 1}: ${label(s)}, ${s[field]} ${meta.noun}. Open manager detail.`}>{s[field]}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStats({ ctx }: { ctx: Ctx }) {
  return (
    <Tabs defaultValue="ownershipCount">
      <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
        {(Object.keys(GRID_META) as CountField[]).map((f) => (
          <TabsTrigger key={f} value={f} className={triggerCls}>{GRID_META[f].title}</TabsTrigger>
        ))}
      </TabsList>
      {(Object.keys(GRID_META) as CountField[]).map((f) => (
        <TabsContent key={f} value={f} className="mt-4"><CountGrid ctx={ctx} field={f} /></TabsContent>
      ))}
    </Tabs>
  );
}

// ─── Summary Portfolio ────────────────────────────────────────────────────────
function SummaryPortfolio({ ctx }: { ctx: Ctx }) {
  const rows = useMemo(
    () => ctx.data.stocks.filter((s) => s.marketValue > 0).sort((a, b) => b.marketValue - a.marketValue || tieKey(a).localeCompare(tieKey(b))),
    [ctx.data.stocks],
  );
  const textFn = useMemo(() => (s: ThirteenFSummaryStock) => `${s.ticker ?? ""} ${s.name} ${s.securityKey}`, []);
  const t = useSearchPaged(rows, textFn);
  const maxPct = rows[0]?.portfolioPct ?? 1;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Combined retained holdings across all {ctx.data.reportingFundCount} managers reporting {ctx.data.quarter}.</p>
      <SearchBox value={t.q} onChange={t.setQ} placeholder="Search ticker or company" />
      {t.filtered.length === 0 ? (
        <EmptyState text="No matches for that search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Security</th>
                <th className={`${th} text-right`}>Value</th>
                <th className={`${th} text-right`}>% of combined</th>
                <th className={`${th} text-right hidden sm:table-cell`}>Owners</th>
                <th className={`${th} text-right hidden md:table-cell`}>Buys</th>
                <th className={`${th} text-right hidden md:table-cell`}>Sells</th>
              </tr>
            </thead>
            <tbody>
              {t.shown.map((s, i) => (
                <tr key={s.securityKey} className="border-b border-border/50 hover:bg-muted/20">
                  <td className={`${td} text-muted-foreground font-mono text-xs`}>{i + 1}</td>
                  <td className={td}><TickerButton s={s} onOpen={ctx.openTicker} /></td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{fmtUsd(s.marketValue)}</td>
                  <td className={`${td} text-right`}>
                    <div className="font-mono tabular-nums font-semibold">{fmtP(s.portfolioPct)}</div>
                    <div className="ml-auto mt-1 h-1 w-20 rounded bg-muted overflow-hidden" aria-hidden>
                      <div className="h-full bg-primary origin-left" style={{ transform: `scaleX(${s.portfolioPct / maxPct})` }} />
                    </div>
                  </td>
                  <td className={`${td} text-right font-mono hidden sm:table-cell`}>{s.ownershipCount}</td>
                  <td className={`${td} text-right font-mono text-emerald-500 hidden md:table-cell`}>{s.buyCount}</td>
                  <td className={`${td} text-right font-mono text-rose-500 hidden md:table-cell`}>{s.sellCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore shown={t.shown.length} total={t.filtered.length} onMore={t.more} />
    </div>
  );
}

// ─── Ticker detail dialog ─────────────────────────────────────────────────────
type SortKey = "portfolioPct" | "buyPct" | "sellPct";
function TickerDetailDialog({ data, securityKey, onClose }: { data: ThirteenFSummary; securityKey: string | null; onClose: () => void }) {
  const stock = data.stocks.find((s) => s.securityKey === securityKey);
  const positions = useMemo(() => data.positions.filter((p) => p.securityKey === securityKey), [data.positions, securityKey]);
  const head = stock ?? positions[0];
  const sorted = (k: SortKey) => {
    // The sub-tabs change sorting, not ownership coverage. Keep unchanged
    // holders and unknown comparisons, plus verified exits for sale activity.
    const list = positions.filter((p) => p.marketValue > 0 || p.activity === "sell");
    return [...list].sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1) || a.fundName.localeCompare(b.fundName));
  };
  const tabs: [SortKey, string][] = [
    ["portfolioPct", "% of Portfolio"],
    ["buyPct", "Buys as % of Portfolio"],
    ["sellPct", "Sells as % of Portfolio"],
  ];
  return (
    <Dialog open={securityKey != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">{head?.ticker ? <TickerOwnershipLink ticker={head.ticker} className="hover:text-primary hover:underline" /> : head ? head.securityKey : securityKey}</DialogTitle>
          <DialogDescription>
            {head?.name ?? "Unknown security"} {DASH} {data.quarter}
            {stock && <> {DASH} {stock.ownershipCount} owners, {stock.buyCount} buys, {stock.sellCount} sells, {fmtUsd(stock.marketValue)} combined</>}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="portfolioPct">
          <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
            {tabs.map(([k, l]) => <TabsTrigger key={k} value={k} className={triggerCls}>{l}</TabsTrigger>)}
          </TabsList>
          {tabs.map(([k]) => {
            const list = sorted(k);
            return (
              <TabsContent key={k} value={k} className="mt-3">
                {list.length === 0 ? (
                  <EmptyState text={k === "portfolioPct" ? "No manager currently holds this security." : k === "buyPct" ? "No measurable buys this quarter." : "No measurable sales this quarter."} />
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted/30">
                        <tr>
                          <th className={th}>Fund</th>
                          <th className={`${th} text-right`}>Value</th>
                          <th className={`${th} text-right`}>% Port.</th>
                          <th className={`${th} text-right`}>Buy %</th>
                          <th className={`${th} text-right`}>Sell %</th>
                          <th className={th}>Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((p) => (
                          <tr key={p.fundCik} className="border-b border-border/50">
                            <td className={td}><FundLink p={p} /></td>
                            <td className={`${td} text-right font-mono tabular-nums`}>{p.activity === "sell" ? DASH : fmtUsd(p.marketValue)}</td>
                            <td className={`${td} text-right font-mono tabular-nums ${k === "portfolioPct" ? "font-semibold" : ""}`}>{p.activity === "sell" ? DASH : fmtP(p.portfolioPct)}</td>
                            <td className={`${td} text-right font-mono tabular-nums text-emerald-500 ${k === "buyPct" ? "font-semibold" : ""}`}>{fmtP(p.buyPct)}</td>
                            <td className={`${td} text-right font-mono tabular-nums text-rose-500 ${k === "sellPct" ? "font-semibold" : ""}`}>{fmtP(p.sellPct)}</td>
                            <td className={td}><ActivityBadge a={p.activity} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Public tab panels ────────────────────────────────────────────────────────
export function BiggestBetsTab() {
  return <SummaryShell>{(ctx) => <PositionRanking ctx={ctx} mode="bets" />}</SummaryShell>;
}
export function TopBuysTab() {
  return <SummaryShell>{(ctx) => <PositionRanking ctx={ctx} mode="buys" />}</SummaryShell>;
}
export function SummaryStatsTab() {
  return <SummaryShell>{(ctx) => <SummaryStats ctx={ctx} />}</SummaryShell>;
}
export function SummaryPortfolioTab() {
  return <SummaryShell>{(ctx) => <SummaryPortfolio ctx={ctx} />}</SummaryShell>;
}
