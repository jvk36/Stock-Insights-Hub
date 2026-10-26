import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import type { BlindTrustPerformance, BlindTrustAllocation, BlindTrustLedgerEvent } from "@workspace/api-client-react";

export const NA = "N/A";
export const usd = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? NA : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
export const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? NA : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? NA : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
export const signedUsd = (v: number | null | undefined) => (v == null ? NA : `${v > 0 ? "+" : v < 0 ? "-" : ""}${usd(Math.abs(v))}`);
export const date = (s: string | null | undefined) => {
  if (!s) return NA;
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: s.length === 10 ? "UTC" : undefined });
};
export const dateTime = (s: string | null | undefined) => (!s ? NA : s.length === 10 ? date(s) : new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));
export const tone = (v: number | null | undefined) => (v == null ? "text-muted-foreground" : v > 0 ? "text-emerald-700" : v < 0 ? "text-red-700" : "");
export const label = (t: string) => t.replace(/_/g, " ");
export const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap";
export const thr = th.replace("text-left", "text-right");
export const td = "px-3 py-2 whitespace-nowrap";
export const tdr = `${td} text-right font-mono tabular-nums`;

export function Stat({ k, v, sub, cls = "", id }: { k: string; v: string; sub?: string; cls?: string; id: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3" data-testid={`stat-${id}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{k}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${cls}`}>{v}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-2 mb-4">
      <span className="font-mono text-xs text-primary font-semibold">{n}</span>
      <div><h2 className="text-lg font-bold tracking-tight">{title}</h2><p className="text-xs text-muted-foreground">{sub}</p></div>
    </div>
  );
}

export function PerformanceChart({ p }: { p: { performance: BlindTrustPerformance[] } }) {
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

export function History({ p }: { p: { allocations: BlindTrustAllocation[]; ledger: BlindTrustLedgerEvent[] } }) {
  return (
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
              <div className="mt-1 font-mono text-xs">Equity {usd(a.equity)} · {usd(a.amountPerPosition)} each → {a.tickers.join(", ") || "Cash"}</div>
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
  );
}
