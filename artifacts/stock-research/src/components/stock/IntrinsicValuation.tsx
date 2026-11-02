import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AlertTriangle, RefreshCw, Sigma } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetIntrinsicValuation,
  getGetIntrinsicValuationQueryKey,
  useGetStockChart,
  getGetStockChartQueryKey,
} from "@workspace/api-client-react";
import type { GetStockChartRange, IntrinsicValuationPoint } from "@workspace/api-client-react";

const RANGES: { label: string; value: GetStockChartRange }[] = [
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
  { label: "5Y", value: "5y" },
  { label: "MAX", value: "max" },
];

const CURVE = "#f59e0b";
const PRICE = "#38bdf8";

const usd = (v: number | null | undefined) => (v == null ? "—" : `$${v.toFixed(2)}`);
const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));
const fmtDate = (t: number | string) =>
  new Date(t).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function IntrinsicValuationIntro() {
  return (
    <Card>
      <CardContent className="p-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Intrinsic Value Curve</p>
          <h2 className="text-xl font-bold tracking-tight">An earnings-based valuation anchor</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The curve estimates fair value from corporate earnings and fundamental growth, multiplying trailing-twelve-month EPS by a
            growth-adjusted P/E. When price trades below the curve, there may be a margin of safety worth investigating.
            Price above the curve can indicate that the market is paying more than recent earnings and growth support, increasing
            valuation risk. When the lines intersect, price equals this model’s fair value and implied target P/E.
            Think of it as a valuation reference, not a forecast: prices need not revert, and no level is automatically a buy or sell signal.
            This is an earnings-based estimate, not a direct cash-flow (DCF) valuation.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Historical quarterly points use reported TTM EPS. The latest point blends reported TTM EPS with projected TTM EPS
            incorporating next quarter’s consensus. Growth is the three-year CAGR of reported TTM EPS.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs space-y-1.5" data-testid="text-formula">
          <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Target P/E, g = 3-yr EPS CAGR (pct. points)</p>
          <p>g &lt; 5 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ MIN(15, 8.5 + 2g)</p>
          <p>5 ≤ g ≤ 15 &nbsp;&nbsp;→ 15</p>
          <p>g &gt; 15 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ g &nbsp;(not capped)</p>
          <p className="pt-1 border-t border-border">Fair value = EPS × target P/E</p>
          <p className="text-muted-foreground">Nonpositive EPS or multiple → unavailable</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface Row {
  t: number;
  close?: number | null;
  curve?: number | null;
  node?: number | null;
  latest?: number | null;
  point?: IntrinsicValuationPoint;
}

export default function IntrinsicValuation({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<GetStockChartRange>("5y");
  const [selected, setSelected] = useState<string | null>(null);

  const val = useGetIntrinsicValuation(symbol, {
    query: { enabled: !!symbol, queryKey: getGetIntrinsicValuationQueryKey(symbol) },
  });
  const chart = useGetStockChart(
    symbol,
    { range },
    { query: { enabled: !!symbol, queryKey: getGetStockChartQueryKey(symbol, { range }) } },
  );

  const history = useMemo(
    () =>
      [...(val.data?.history ?? [])]
        .map((p) => ({ p, t: Date.parse(p.date) }))
        .filter((x) => Number.isFinite(x.t))
        .sort((a, b) => a.t - b.t),
    [val.data],
  );

  const rows = useMemo<Row[]>(() => {
    const prices = (chart.data?.data ?? [])
      .map((d) => ({ t: Date.parse(d.date), close: d.close ?? null }))
      .filter((d) => Number.isFinite(d.t));
    const start = prices.length ? prices[0].t : -Infinity;
    const out: Row[] = prices.map((d) => ({ t: d.t, close: d.close }));
    // Only nodes; curve value null on unavailable nodes creates a genuine gap (connectNulls=false).
    history
      .filter((h) => h.t >= start)
      .forEach(({ p, t }) => {
        out.push({
          t,
          curve: p.fairValue,
          node: !p.isBlended ? p.fairValue : null,
          latest: p.isBlended ? p.fairValue : null,
          point: p,
        });
      });
    return out.sort((a, b) => a.t - b.t);
  }, [chart.data, history]);

  // Curve-only dataset (Line skips undefined values only if separate array, so use a dedicated series)
  const curveRows = useMemo(() => rows.filter((r) => r.point), [rows]);

  const latest = history.length ? history[history.length - 1].p : null;
  const lastClose = [...(chart.data?.data ?? [])].reverse().find((d) => d.close != null)?.close ?? null;
  const gap =
    latest?.fairValue != null && lastClose != null ? ((lastClose - latest.fairValue) / latest.fairValue) * 100 : null;
  const selectedPoint = history.find((h) => h.p.date === selected)?.p ?? latest;

  if (val.isLoading) {
    return (
      <div className="space-y-4" data-testid="status-intrinsic-loading">
        <IntrinsicValuationIntro />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-[420px] w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (val.isError) {
    return (
      <div className="space-y-6">
      <IntrinsicValuationIntro />
      <Card className="border-destructive/40">
        <CardContent className="p-8 text-center space-y-3">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <p className="font-semibold">Intrinsic valuation could not be loaded</p>
          <p className="text-sm text-muted-foreground">The earnings inputs for {symbol} were unavailable from the data source.</p>
          <Button variant="outline" size="sm" onClick={() => val.refetch()} data-testid="button-retry-intrinsic">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </CardContent>
      </Card>
      </div>
    );
  }
  if (!val.data || history.length === 0) {
    return (
      <div className="space-y-6">
      <IntrinsicValuationIntro />
      <Card>
        <CardContent className="p-8 text-center space-y-2" data-testid="status-intrinsic-empty">
          <Sigma className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="font-semibold">No quarterly earnings history to value</p>
          <p className="text-sm text-muted-foreground">{symbol} does not have enough reported EPS to build an intrinsic value curve.</p>
          {val.data?.warnings.map(warning => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
        </CardContent>
      </Card>
      </div>
    );
  }

  const data = val.data;

  return (
    <div className="space-y-6">
      <IntrinsicValuationIntro />

      {/* Summary */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { k: "Latest estimate", v: usd(latest?.fairValue), id: "fair" },
          { k: "Last close", v: usd(lastClose), id: "close" },
          { k: "Price vs curve", v: gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)}%`, id: "gap" },
          { k: "Target P/E", v: latest?.targetPe != null ? `${latest.targetPe.toFixed(1)}x` : "—", id: "pe" },
        ].map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.k}</p>
            <p className="mt-1 text-2xl font-mono font-bold" data-testid={`text-intrinsic-${s.id}`}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Price vs Intrinsic Value ({data.currency})</CardTitle>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button
                key={r.value}
                size="sm"
                variant={range === r.value ? "default" : "ghost"}
                className={`h-7 px-2 text-xs font-mono ${range === r.value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                onClick={() => setRange(r.value)}
                data-testid={`button-iv-range-${r.value}`}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-[11px] font-mono text-muted-foreground mb-2">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: PRICE }} />Price</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: CURVE }} />Intrinsic curve (quarterly nodes)</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 border-2" style={{ borderColor: CURVE }} />Latest blended estimate</span>
          </div>
          <div className="h-[400px]">
            {chart.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : chart.isError ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                Price history unavailable.
                <Button size="sm" variant="outline" onClick={() => chart.refetch()} data-testid="button-retry-chart">Retry</Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={rows}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                  onClick={(e) => {
                    const p = (e?.activePayload?.[0]?.payload as Row | undefined)?.point;
                    if (p) setSelected(p.date);
                  }}
                >
                  <defs>
                    <linearGradient id="ivPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PRICE} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={PRICE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => new Date(v).toLocaleDateString([], { month: "short", year: "2-digit" })}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickMargin={10}
                    minTickGap={40}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => `$${v}`}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                    orientation="right"
                    width={55}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const r = payload[0].payload as Row;
                      const p = r.point;
                      return (
                        <div className="rounded-md border border-border bg-popover p-2.5 font-mono text-xs space-y-0.5">
                          <p className="text-muted-foreground mb-1">{fmtDate(label as number)}</p>
                          {r.close != null && <p>Price {usd(r.close)}</p>}
                          {p && (
                            <>
                              <p style={{ color: CURVE }}>
                                {p.isBlended ? "Latest estimate" : "Fair value"} {usd(p.fairValue)}
                              </p>
                              <p className="text-muted-foreground">Period end {fmtDate(p.periodEnd)}</p>
                              <p>EPS {num(p.isBlended ? p.blendedEps : p.reportedTtmEps)} · g {num(p.growthPercent, 1)}% · P/E {num(p.targetPe, 1)}</p>
                              {p.unavailableReason && <p className="text-destructive max-w-[220px]">{p.unavailableReason}</p>}
                              <p className="text-muted-foreground">Click to inspect</p>
                            </>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Area type="linear" dataKey="close" data={rows.filter((r) => r.close !== undefined)} stroke={PRICE} strokeWidth={1.75} fill="url(#ivPrice)" isAnimationActive={false} dot={false} connectNulls={false} />
                  <Line type="linear" dataKey="curve" data={curveRows} stroke={CURVE} strokeWidth={2.5} isAnimationActive={false} connectNulls={false} dot={false} activeDot={false} />
                  <Scatter dataKey="node" data={curveRows} fill={CURVE} shape="circle" isAnimationActive={false} />
                  <Scatter
                    dataKey="latest"
                    data={curveRows}
                    isAnimationActive={false}
                    shape={(props: { cx?: number; cy?: number }) =>
                      props.cx == null || props.cy == null ? <g /> : (
                        <rect x={props.cx - 5} y={props.cy - 5} width={10} height={10} transform={`rotate(45 ${props.cx} ${props.cy})`} fill="hsl(var(--card))" stroke={CURVE} strokeWidth={2.5} />
                      )
                    }
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground font-mono">
            Straight segments join adjacent quarterly nodes only; breaks mark quarters where fair value is unavailable. Historical nodes use
            restated data and are not a point-in-time backtest.
          </p>
        </CardContent>
      </Card>

      {/* Inspector + warnings */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Node inspector {selectedPoint?.isBlended && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500 uppercase">Latest estimate</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm" data-testid="panel-node-inspector">
            {selectedPoint && (
              <dl className="grid grid-cols-2 gap-y-1.5">
                <dt className="text-muted-foreground">Plot date</dt><dd className="text-right">{fmtDate(selectedPoint.date)}</dd>
                <dt className="text-muted-foreground">Period end</dt><dd className="text-right">{fmtDate(selectedPoint.periodEnd)}</dd>
                <dt className="text-muted-foreground">Reported TTM EPS</dt><dd className="text-right">{num(selectedPoint.reportedTtmEps)}</dd>
                {selectedPoint.isBlended && (
                  <>
                    <dt className="text-muted-foreground">Projected TTM EPS</dt><dd className="text-right">{num(selectedPoint.projectedTtmEps)}</dd>
                    <dt className="text-muted-foreground">Blended EPS (avg)</dt><dd className="text-right">{num(selectedPoint.blendedEps)}</dd>
                    <dt className="text-muted-foreground">Next qtr consensus</dt><dd className="text-right">{num(data.nextQuarterEstimate)}{data.nextQuarterEnd ? ` (${fmtDate(data.nextQuarterEnd)})` : ""}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">3-yr EPS CAGR</dt><dd className="text-right">{selectedPoint.growthPercent == null ? "—" : `${selectedPoint.growthPercent.toFixed(2)}%`}</dd>
                <dt className="text-muted-foreground">Target P/E</dt><dd className="text-right">{selectedPoint.targetPe == null ? "—" : `${selectedPoint.targetPe.toFixed(2)}x`}</dd>
                <dt className="text-muted-foreground border-t border-border pt-1.5">Fair value</dt><dd className="text-right border-t border-border pt-1.5 font-bold" style={{ color: CURVE }}>{usd(selectedPoint.fairValue)}</dd>
                {selectedPoint.unavailableReason && <dd className="col-span-2 text-xs text-destructive pt-1">{selectedPoint.unavailableReason}</dd>}
              </dl>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Methodology & source</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground leading-relaxed">{data.methodology}</p>
            <p className="text-xs font-mono text-muted-foreground">Source: {data.source} · Generated {fmtDate(data.generatedAt)}</p>
            {data.warnings.length > 0 && (
              <ul className="space-y-1.5" data-testid="list-intrinsic-warnings">
                {data.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2 text-xs rounded border border-amber-500/30 bg-amber-500/5 p-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />{w}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Data audit — every quarterly input</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs font-mono" data-testid="table-intrinsic-audit">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border text-right">
                <th className="py-2 text-left font-medium">Period end</th>
                <th className="font-medium">TTM EPS</th>
                <th className="font-medium">Projected</th>
                <th className="font-medium">EPS used</th>
                <th className="font-medium">CAGR</th>
                <th className="font-medium">P/E</th>
                <th className="font-medium">Fair value</th>
                <th className="pl-4 text-left font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map(({ p }) => (
                <tr
                  key={p.date}
                  onClick={() => setSelected(p.date)}
                  className={`border-b border-border/50 text-right cursor-pointer hover:bg-muted/40 ${p.isBlended ? "bg-amber-500/5" : ""} ${selectedPoint?.date === p.date ? "outline outline-1 outline-primary/40" : ""}`}
                  data-testid={`row-intrinsic-${p.date}`}
                >
                  <td className="py-1.5 text-left">{p.isBlended ? `Latest (${fmtDate(p.date)})` : fmtDate(p.periodEnd)}</td>
                  <td>{num(p.reportedTtmEps)}</td>
                  <td>{num(p.projectedTtmEps)}</td>
                  <td>{num(p.isBlended ? p.blendedEps : p.reportedTtmEps)}</td>
                  <td>{p.growthPercent == null ? "—" : `${p.growthPercent.toFixed(1)}%`}</td>
                  <td>{p.targetPe == null ? "—" : `${p.targetPe.toFixed(1)}x`}</td>
                  <td style={{ color: p.fairValue != null ? CURVE : undefined }}>{usd(p.fairValue)}</td>
                  <td className="pl-4 text-left text-muted-foreground max-w-[260px] truncate" title={p.unavailableReason ?? ""}>
                    {p.unavailableReason ?? (p.isBlended ? "Avg of reported & projected TTM" : "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
