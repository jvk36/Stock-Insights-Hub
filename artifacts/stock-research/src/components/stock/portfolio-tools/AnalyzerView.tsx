import type { PortfolioResult } from "@/lib/portfolio-tools-calculations";
import { Methodology, PanelCard, Notice, fmtDate, signClass } from "@/components/stock/performance/perf-shared";
import { StatTile, fmtNum, fmtPlainPct } from "@/components/stock/risk/risk-shared";
import { REBALANCE_LABELS } from "./portfolio-shared";
import type { Submission } from "./portfolio-shared";

export default function AnalyzerView({ result, sub }: { result: PortfolioResult; sub: Submission }) {
  const s = result.stats;
  return (
    <PanelCard title="Portfolio Analyzer" testId="panel-portfolio-analyzer" subtitle={<>Simulated portfolio, {fmtDate(result.start)} to {fmtDate(result.end)}, rebalancing: {REBALANCE_LABELS[sub.rebalance]}</>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="CAGR" value={fmtPlainPct(s.cagr, 2)} tone={signClass(s.cagr)} testId="text-portfolio-cagr" sub="Annualized growth" />
        <StatTile label="Volatility" value={fmtPlainPct(s.volatility, 2)} testId="text-portfolio-volatility" sub="Annualized, daily returns" />
        <StatTile label="Max drawdown" value={s.maxDrawdown === null ? "\u2014" : `-${fmtPlainPct(s.maxDrawdown, 2)}`} tone="text-destructive" testId="text-portfolio-maxdd" sub="Worst peak to trough" />
        <StatTile label="Sharpe" value={fmtNum(s.sharpe)} testId="text-portfolio-sharpe" sub={`Risk-free ${(sub.annualRiskFree * 100).toFixed(2)}%/yr`} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground" data-testid="text-portfolio-observations">{s.observations.toLocaleString()} daily returns on common trading sessions.{result.omittedSessions > 0 && ` ${result.omittedSessions.toLocaleString()} sessions where not every holding traded were excluded; no prices were filled in.`}</p>
      {s.observations < 252 && <div className="mt-3"><Notice tone="warn">Fewer than 252 daily returns (about one year). These statistics are statistically weak.</Notice></div>}
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <p className="rounded-md bg-muted/40 p-3 text-muted-foreground"><span className="font-semibold text-foreground">How to read it.</span> These numbers describe the combined portfolio path, not an average of each holding. Diversification can make portfolio volatility and drawdown lower than the weighted average of the parts.</p>
        <p className="rounded-md bg-muted/40 p-3 text-muted-foreground"><span className="font-semibold text-foreground">Sharpe</span> is annualized excess return over the risk-free rate divided by annualized volatility. A higher value means more excess return was earned per unit of volatility in this period. It depends on the dates chosen and does not guarantee future risk-adjusted returns.</p>
      </div>
      <Methodology>
        <p>1. Each holding buys fractional units at the first common adjusted close: units = initial value x target weight / price. Adjusted closes assume dividends and distributions are reinvested.</p>
        <p>2. The portfolio is marked to market on every session where all positive-weight holdings have a price. Rebalancing (if chosen) resets units to target weights at the first common close of each new calendar month, quarter or year, after that close is recorded.</p>
        <p>3. CAGR = (ending value / starting value)^(365.2425 / calendar days) - 1.</p>
        <p>4. Volatility = sample standard deviation of daily portfolio returns x sqrt(252).</p>
        <p>5. Max drawdown = largest percentage fall from a running peak of portfolio value to a later low.</p>
        <p>6. Sharpe = mean daily excess return / sample daily standard deviation x sqrt(252), using your annual risk-free rate converted to a daily rate.</p>
        <p>Zero-weight holdings are excluded from the simulation. Only USD-listed holdings are supported because no currency conversion is applied. No fees, taxes, slippage or contributions.</p>
      </Methodology>
    </PanelCard>
  );
}
