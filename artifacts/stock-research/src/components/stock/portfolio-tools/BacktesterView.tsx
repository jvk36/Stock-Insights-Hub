import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PortfolioResult } from "@/lib/portfolio-tools-calculations";
import { Methodology, Notice, PanelCard, axisProps, fmtDate, fmtMoney, signClass, tooltipStyle } from "@/components/stock/performance/perf-shared";
import { StatTile, fmtNum, fmtPlainPct, toTs, tsDate, tsYear } from "@/components/stock/risk/risk-shared";
import { REBALANCE_LABELS } from "./portfolio-shared";
import type { Submission } from "./portfolio-shared";

const MAX_POINTS = 1500;

export default function BacktesterView({ result, sub }: { result: PortfolioResult; sub: Submission }) {
  const { points, step } = useMemo(() => {
    const p = result.prices;
    const k = Math.max(1, Math.ceil(p.length / MAX_POINTS));
    const out = p.filter((_, i) => i % k === 0 || i === p.length - 1).map((x) => ({ t: toTs(x.date), v: x.adjustedClose }));
    return { points: out, step: k };
  }, [result.prices]);
  const endValue = result.prices[result.prices.length - 1].adjustedClose;
  const total = endValue / sub.initialValue - 1;
  const s = result.stats;

  return (
    <PanelCard title="Portfolio Backtester" testId="panel-portfolio-backtester" subtitle={<>Growth of {fmtMoney(sub.initialValue, "USD")}, {fmtDate(result.start)} to {fmtDate(result.end)}, rebalancing: {REBALANCE_LABELS[sub.rebalance]}</>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Initial value" value={fmtMoney(sub.initialValue, "USD")} testId="text-backtest-initial" />
        <StatTile label="Ending value" value={fmtMoney(endValue, "USD")} tone={signClass(total)} testId="text-backtest-ending" />
        <StatTile label="Total return" value={fmtPlainPct(total, 2)} tone={signClass(total)} testId="text-backtest-total" />
        <StatTile label="CAGR" value={fmtPlainPct(s.cagr, 2)} tone={signClass(s.cagr)} testId="text-backtest-cagr" />
        <StatTile label="Volatility" value={fmtPlainPct(s.volatility, 2)} testId="text-backtest-vol" />
        <StatTile label="Max drawdown" value={s.maxDrawdown === null ? "\u2014" : `-${fmtPlainPct(s.maxDrawdown, 2)}`} tone="text-destructive" testId="text-backtest-maxdd" />
        <StatTile label="Sharpe" value={fmtNum(s.sharpe)} testId="text-backtest-sharpe" />
        <StatTile label="Rebalances" value={String(result.rebalances.length)} testId="text-backtest-rebalances" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground" data-testid="text-backtest-observations">{s.observations.toLocaleString()} daily returns on common trading sessions.{result.omittedSessions > 0 && ` ${result.omittedSessions.toLocaleString()} sessions where not every holding traded were excluded; no prices were filled in.`}</p>
      {s.observations < 252 && <div className="mt-3"><Notice tone="warn">Fewer than 252 daily returns (about one year). These statistics are statistically weak.</Notice></div>}
      <div className="mt-5 h-[320px] w-full" data-testid="chart-portfolio-growth">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pfGrow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tsYear} {...axisProps} minTickGap={40} />
            <YAxis type="number" domain={[0, "auto"]} tickFormatter={(v: number) => `$${Math.round(v).toLocaleString("en-US")}`} width={78} {...axisProps} />
            <Tooltip {...tooltipStyle} labelFormatter={(v) => tsDate(Number(v))} formatter={(v) => [fmtMoney(Number(v), "USD"), "Portfolio value"]} />
            <Area type="linear" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={1.75} fill="url(#pfGrow)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{step > 1 ? `Chart shows every ${step}th session plus the final session (${points.length.toLocaleString()} of ${result.prices.length.toLocaleString()}); all statistics use every session.` : `All ${result.prices.length.toLocaleString()} sessions plotted.`}</p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-backtest-allocations">
          <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground"><th className="py-2">Holding</th><th className="text-right">Target</th><th className="text-right">Ending</th><th className="text-right">Drift</th><th className="text-right">Ending value</th></tr></thead>
          <tbody>
            {result.allocations.map((a) => {
              const drift = a.endingWeight - a.targetWeight;
              return (
                <tr key={a.symbol} className="border-b border-border/60 font-mono text-xs" data-testid={`row-backtest-allocation-${a.symbol}`}>
                  <td className="py-2 font-semibold">{a.symbol}</td>
                  <td className="text-right">{a.targetWeight.toFixed(2)}%</td>
                  <td className="text-right">{a.endingWeight.toFixed(2)}%</td>
                  <td className="text-right text-muted-foreground">{drift >= 0 ? "+" : ""}{drift.toFixed(2)} pts</td>
                  <td className="text-right">{fmtMoney(a.value, "USD")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted-foreground">Drift is the gap between ending and target weight. With buy and hold, winners grow into larger weights; with rebalancing, the ending weight reflects drift since the last rebalance.</p>
      </div>
      {result.rebalances.length > 0 && (
        <details className="mt-3 text-xs text-muted-foreground" data-testid="details-backtest-rebalances">
          <summary className="cursor-pointer font-semibold text-foreground">Rebalance dates ({result.rebalances.length})</summary>
          <p className="mt-2 font-mono leading-relaxed">{result.rebalances.join(", ")}</p>
        </details>
      )}
      <Methodology>
        <p>The backtest starts with your initial investment split by target weight into fractional units at the first common adjusted close in the range, then values the portfolio on every session where all positive-weight holdings traded.</p>
        <p>Rebalancing resets every position to its target weight at the first common close of a new calendar period, after recording that day's value under the prior holdings. Buy and hold never trades after the start.</p>
        <p>Total return = ending value / initial value - 1. CAGR, volatility, max drawdown and Sharpe use the same formulas as the Portfolio Analyzer.</p>
        <p>Adjusted prices assume dividends are reinvested. No fees, taxes, bid-ask spread, slippage, cash drag or contributions. USD listings only; no FX conversion. A backtest shows what happened, not what will happen.</p>
      </Methodology>
    </PanelCard>
  );
}
