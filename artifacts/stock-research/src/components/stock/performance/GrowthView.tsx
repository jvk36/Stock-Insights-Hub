import { useMemo, useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";
import type { PricePoint } from "@/lib/performance-calculations";
import { annualizedReturn, formatPct, growthOfInvestment } from "@/lib/performance-calculations";
import { Methodology, Notice, PanelCard, SERIES_COLORS, SegButtons, axisProps, fmtDate, fmtMoney, fmtYearTick, signClass, tooltipStyle } from "./perf-shared";

const YEARS = [1, 3, 5, 10, 15, 20] as const;

export default function GrowthView({ symbol, currency, prices, benchmark }: { symbol: string; currency: string | null; prices: PricePoint[]; benchmark: PricePoint[] | null }) {
  const [years, setYears] = useState<number>(10);
  const cur = currency ?? "listing currency";
  const nonUsd = currency !== null && currency.toUpperCase() !== "USD";
  const out = useMemo(() => growthOfInvestment(prices, benchmark, years), [prices, benchmark, years]);
  const last = out.ok ? out.points[out.points.length - 1] : null;

  const summary = (label: string, v: number | null, unit: string, testId: string) => {
    const cagr = out.ok && v !== null ? annualizedReturn(out.start, 10000, out.end, v) : null;
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2" data-testid={testId}>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="mt-0.5 font-mono text-lg font-semibold">{fmtMoney(v, unit)}</div>
        <div className={`font-mono text-xs ${signClass(cagr)}`}>{v === null ? "N/A" : `${formatPct(v / 10000 - 1)} total, ${formatPct(cagr, 2)} CAGR`}</div>
      </div>
    );
  };

  return (
    <PanelCard
      title="Growth of 10,000"
      testId="panel-growth"
      subtitle={out.ok ? <>Invested {fmtDate(out.start)}, valued {fmtDate(out.end)}</> : "Select a horizon"}
      actions={<SegButtons label="Horizon" testPrefix="button-growth-years" value={years} onChange={(value) => setYears(Number(value))} options={YEARS.map((y) => ({ value: y, label: `${y}Y` }))} />}
    >
      <div className="space-y-3">
        {nonUsd && <Notice tone="warn" testId="status-growth-currency">{symbol} trades in {currency}. Its line is 10,000 normalized in {currency}; SPY is 10,000 in USD. No FX adjustment is applied, so the lines compare local-currency returns.</Notice>}
        {!benchmark && <Notice tone="warn" testId="status-growth-no-benchmark">S&P 500 (SPY) benchmark history is unavailable right now. Showing {symbol} only.</Notice>}
        {!out.ok ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center" data-testid="status-growth-unavailable">
            <p className="font-mono text-2xl font-semibold text-muted-foreground">N/A</p>
            <p className="max-w-md text-sm text-muted-foreground">{out.reason}</p>
          </div>
        ) : (<>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {summary(symbol, last?.stock ?? null, cur, "text-growth-stock")}
            {out.benchmarkIncluded && summary("S&P 500 (SPY proxy)", last?.benchmark ?? null, "USD", "text-growth-spy")}
          </div>
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={out.points} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="date" tickFormatter={years <= 1 ? (d: string) => d.slice(0, 7) : fmtYearTick} minTickGap={40} {...axisProps} />
                <YAxis orientation="right" width={64} domain={["auto", "auto"]} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : String(Math.round(v))} {...axisProps} />
                <ReferenceLine y={10000} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDate(String(l))} formatter={(v: number, n: string) => n === "stock" ? [fmtMoney(v, cur), symbol] : [fmtMoney(v, "USD"), "SPY"]} />
                <Legend verticalAlign="top" align="left" iconType="line" wrapperStyle={{ fontSize: 11, fontFamily: "monospace", paddingBottom: 6 }} formatter={(v) => (v === "stock" ? `${symbol} (${cur})` : "S&P 500 via SPY (USD)")} />
                <Line type="monotone" dataKey="stock" stroke={SERIES_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                {out.benchmarkIncluded && <Line type="monotone" dataKey="benchmark" stroke={SERIES_COLORS[1]} strokeWidth={1.75} dot={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>)}
      </div>
      <Methodology>
        <p>Both series are normalized to 10,000 on the same first common trading session on or after exactly {years} calendar year{years > 1 ? "s" : ""} before the latest common session, and only dates present in both histories are used.</p>
        <p>Values use adjusted closes, estimating reinvested dividends with no taxes, fees or slippage. The S&P 500 comparison uses the SPY ETF as a proxy; its costs and tracking differ from the index.</p>
        <p>If either series lacks the full requested history, the horizon shows N/A rather than a shorter period.</p>
      </Methodology>
    </PanelCard>
  );
}
