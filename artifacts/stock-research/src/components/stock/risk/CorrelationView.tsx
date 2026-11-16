import { useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { TickerPerformance } from "@workspace/api-client-react";
import { betaCorrelation, pairedReturns } from "@/lib/risk-calculations";
import type { PricePoint } from "@/lib/performance-calculations";
import TickerSearch from "@/components/stock/TickerSearch";
import { PanelCard, Notice, axisProps, tooltipStyle, pctTick } from "@/components/stock/performance/perf-shared";
import { StatTile, fmtNum, fmtPlainPct, sliceRange, useComparisonSeries } from "./risk-shared";

const MAX_POINTS = 1500;

export default function CorrelationView({ symbol, data, prices, start, end }: { symbol: string; data: TickerPerformance; prices: PricePoint[]; start: string; end: string }) {
  const [other, setOther] = useState("SPY");
  const spyRange = useMemo(() => (data.benchmark?.prices.length ? sliceRange(data.benchmark.prices, start, end) : null), [data.benchmark, start, end]);
  const market = useMemo(() => (spyRange ? betaCorrelation(pairedReturns(prices, spyRange)) : null), [prices, spyRange]);
  const spyPairSpan = useMemo(() => {
    if (!spyRange) return "";
    const p = pairedReturns(prices, spyRange);
    return p.length ? `${p[0].date} to ${p[p.length - 1].date}` : "no common dates";
  }, [prices, spyRange]);
  const cmp = useComparisonSeries(other, data);
  const pairs = useMemo(() => (cmp.prices ? pairedReturns(prices, sliceRange(cmp.prices, start, end)) : null), [prices, cmp.prices, start, end]);
  const pair = useMemo(() => (pairs ? betaCorrelation(pairs) : null), [pairs]);
  const sample = useMemo(() => {
    if (!pairs) return [];
    const step = Math.max(1, Math.ceil(pairs.length / MAX_POINTS));
    return pairs.filter((_, i) => i % step === 0).map((p) => ({ x: p.benchmark, y: p.stock, date: p.date }));
  }, [pairs]);
  const span = pairs && pairs.length ? `${pairs[0].date} to ${pairs[pairs.length - 1].date}` : "";

  return (
    <div className="space-y-4">
      <PanelCard title="Market beta vs SPY" subtitle="Always measured against SPY, the S&P 500 ETF proxy." testId="panel-risk-beta">
        {!market ? <Notice tone="warn">SPY benchmark unavailable; market beta cannot be computed.</Notice> : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Beta to SPY" value={fmtNum(market.beta)} testId="text-risk-beta" />
              <StatTile label="Correlation to SPY" value={fmtNum(market.correlation)} testId="text-risk-beta-corr" />
              <StatTile label="R-squared" value={fmtPlainPct(market.rSquared)} sub="variance explained by SPY" testId="text-risk-r2" />
              <StatTile label="Paired returns" value={market.observations.toLocaleString()} sub={spyPairSpan} testId="text-risk-beta-n" />
            </div>
            {market.observations < 252 && <div className="mt-3"><Notice tone="warn">Under 252 paired returns: beta is unreliable.</Notice></div>}
          </>
        )}
      </PanelCard>

      <PanelCard
        title={`Correlation: ${symbol} and ${other}`}
        subtitle="Pairwise co-movement with any investment. This is not a market beta."
        actions={<div className="w-full sm:w-80"><TickerSearch size="sm" onSelect={(s) => setOther(s)} buttonLabel="Pair" placeholder="Second investment, e.g. GLD" /></div>}
        testId="panel-risk-pair"
      >
        {cmp.loading ? <p className="text-sm text-muted-foreground" data-testid="status-risk-pair-loading">Loading {other} history...</p>
          : cmp.error || !pairs ? (
            <Notice tone="warn" testId="status-risk-pair-error">
              Could not load {other}. Market beta above is unaffected.{" "}
              <button type="button" onClick={cmp.refetch} className="font-semibold underline" data-testid="button-risk-pair-retry">Retry</button>
            </Notice>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile label="Correlation" value={fmtNum(pair?.correlation)} testId="text-risk-pair-corr" />
                <StatTile label="R-squared" value={fmtPlainPct(pair?.rSquared)} testId="text-risk-pair-r2" />
                <StatTile label={`${symbol} vol`} value={fmtPlainPct(pair?.stockVolatility)} sub="paired dates" testId="text-risk-pair-vol-a" />
                <StatTile label={`${other} vol`} value={fmtPlainPct(pair?.benchmarkVolatility)} sub="paired dates" testId="text-risk-pair-vol-b" />
              </div>
              <Notice tone={pairs.length < 252 ? "warn" : "muted"} testId="text-risk-pair-sample">
                {pairs.length.toLocaleString()} paired daily returns on common sessions{span ? ` (${span})` : ""}, vs {symbol} range {prices.length ? `${prices[0].date} to ${prices[prices.length - 1].date}` : ""}. Returns missing in either series are excluded.{pairs.length < 252 ? " Under one year: unreliable." : ""}
                {sample.length < pairs.length ? ` Scatter shows ${sample.length.toLocaleString()} evenly sampled points; statistics use all ${pairs.length.toLocaleString()}.` : " Scatter shows every point."}
              </Notice>
              {sample.length > 0 && (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="x" name={other} {...axisProps} tickFormatter={pctTick} label={{ value: `${other} daily return`, position: "insideBottom", offset: -8, fontSize: 11 }} />
                      <YAxis type="number" dataKey="y" name={symbol} {...axisProps} tickFormatter={pctTick} width={48} />
                      <Tooltip {...tooltipStyle} formatter={(v, n) => [fmtPlainPct(Number(v), 2), String(n)]} />
                      <Scatter data={sample} fill="hsl(var(--primary))" fillOpacity={0.35} isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
      </PanelCard>
    </div>
  );
}
