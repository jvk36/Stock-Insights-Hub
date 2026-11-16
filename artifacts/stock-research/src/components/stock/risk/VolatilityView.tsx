import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TickerPerformance } from "@workspace/api-client-react";
import { annualizedVolatility, betaCorrelation, pairedReturns, rollingVolatility } from "@/lib/risk-calculations";
import type { PricePoint } from "@/lib/performance-calculations";
import { PanelCard, Notice, SegButtons, SERIES_COLORS, axisProps, tooltipStyle, fmtDate, pctTick } from "@/components/stock/performance/perf-shared";
import { StatTile, fmtPlainPct, sliceRange, useComparisonSeries, toTs, tsDate, tsYear } from "./risk-shared";

const ETFS = [
  { value: "SPY", label: "SPY \u00b7 S&P 500" },
  { value: "QQQ", label: "QQQ \u00b7 Nasdaq-100" },
  { value: "IWM", label: "IWM \u00b7 Russell 2000" },
];

export default function VolatilityView({ symbol, data, prices, start, end }: { symbol: string; data: TickerPerformance; prices: PricePoint[]; start: string; end: string }) {
  const [etf, setEtf] = useState("SPY");
  const cmp = useComparisonSeries(etf, data);
  const cmpRange = useMemo(() => (cmp.prices ? sliceRange(cmp.prices, start, end) : null), [cmp.prices, start, end]);
  const vol = useMemo(() => annualizedVolatility(prices), [prices]);
  const matched = useMemo(() => (cmpRange ? betaCorrelation(pairedReturns(prices, cmpRange)) : null), [prices, cmpRange]);
  const chart = useMemo(() => rollingVolatility(prices, 63).map((r) => ({ t: toTs(r.date), stock: r.value })), [prices]);
  const pairSpan = useMemo(() => {
    if (!cmpRange) return "";
    const p = pairedReturns(prices, cmpRange);
    return p.length ? `${fmtDate(p[0].date)} to ${fmtDate(p[p.length - 1].date)}` : "no common dates";
  }, [prices, cmpRange]);
  const stockSpan = prices.length ? `${fmtDate(prices[0].date)} to ${fmtDate(prices[prices.length - 1].date)}` : "";
  const ratio = matched?.stockVolatility && matched.benchmarkVolatility ? matched.stockVolatility / matched.benchmarkVolatility : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Compare with</span>
        <SegButtons options={ETFS} value={etf} onChange={(v) => setEtf(String(v))} label="Comparison ETF" testPrefix="button-risk-etf" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={`${symbol} vol, all returns`} value={fmtPlainPct(vol)} sub="annualized, full range" testId="text-risk-vol" />
        <StatTile label={`${symbol} vol, matched`} value={fmtPlainPct(matched?.stockVolatility)} sub="paired dates only" testId="text-risk-vol-matched" />
        <StatTile label={`${etf} vol, matched`} value={cmp.loading ? "..." : fmtPlainPct(matched?.benchmarkVolatility)} sub="paired dates only" testId="text-risk-vol-etf" />
        <StatTile label="Relative volatility" value={ratio === null ? "\u2014" : `${ratio.toFixed(2)}x`} sub={`${symbol} vs ${etf}`} testId="text-risk-vol-ratio" />
      </div>
      {cmp.error ? (
        <Notice tone="warn" testId="status-risk-etf-error">
          {etf} history could not be loaded; {symbol} volatility above still uses its own data.{" "}
          <button type="button" onClick={cmp.refetch} className="font-semibold underline" data-testid="button-risk-etf-retry">Retry</button>
        </Notice>
      ) : matched && (
        <Notice testId="text-risk-vol-sample">
          Matched comparison: {matched.observations.toLocaleString()} paired daily returns, common return dates {pairSpan} vs {symbol} range {stockSpan}{matched.observations < 252 ? " (under one year, unreliable)" : ""}. {etf} is an ETF proxy, not the index.
        </Notice>
      )}
      <PanelCard title={`${symbol} only: rolling 63-session volatility`} subtitle={`Stock-only chart; ETF comparison is in the matched tiles above. Annualized SD of 63 consecutive daily returns. All ${chart.length.toLocaleString()} windows plotted; windows spanning a data gap are omitted.`} testId="chart-risk-rolling-vol">
        {chart.length === 0 ? <Notice tone="warn">Fewer than 63 consecutive daily returns in range.</Notice> : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} {...axisProps} tickFormatter={(v) => tsYear(Number(v))} minTickGap={40} />
                <YAxis {...axisProps} tickFormatter={pctTick} width={48} />
                <Tooltip {...tooltipStyle} labelFormatter={(v) => tsDate(Number(v))} formatter={(v, n) => [fmtPlainPct(Number(v)), String(n)]} />
                <Line type="linear" dataKey="stock" name={symbol} stroke={SERIES_COLORS[0]} dot={false} strokeWidth={1.4} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
