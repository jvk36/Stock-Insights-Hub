import { BookOpen } from "lucide-react";
import type { RiskView } from "./risk-shared";

const INFO: Record<RiskView, { what: string; formulas: string[]; limits: string[] }> = {
  drawdown: {
    what: "How far the adjusted price fell from its running high inside the selected range, how long each fall took, and how long it took to get back.",
    formulas: [
      "Drawdown(t) = AdjClose(t) / max(AdjClose from range start to t) - 1.",
      "An episode starts at a peak, bottoms at the lowest close before recovery, and recovers at the first close at or above that peak.",
      "Decline duration = calendar days peak to trough. Recovery duration = calendar days trough to recovery. Underwater = peak to recovery, or to the last session if unrecovered.",
    ],
    limits: [
      "Peaks before the selected start are ignored: a range starting mid-decline treats its first session as the peak.",
      "Recovery is only observed inside the selected window. An episode still underwater at the range end is marked Unrecovered; no future recovery is assumed.",
      "Drawdowns use every available close over the elapsed range, including across data gaps. Daily closes only; intraday lows were deeper. Episodes are ranked by loss; the table shows up to 10 of the total count.",
    ],
  },
  volatility: {
    what: "How widely daily returns swing, annualized, and how that compares with a broad index ETF over exactly the same dates.",
    formulas: [
      "r(t) = AdjClose(t) / AdjClose(t-1) - 1, only when the two sessions are at most 7 calendar days apart.",
      "Annualized volatility = sample standard deviation of r (n-1) x sqrt(252).",
      "Comparison uses paired returns: both start and end dates of each return must exist for both series.",
      "Rolling volatility uses 63 consecutive daily returns (about one quarter); windows spanning a data gap are skipped.",
    ],
    limits: [
      "Volatility treats upside and downside swings alike and says nothing about the size of rare crashes.",
      "SPY, QQQ and IWM are ETF proxies for the S&P 500, Nasdaq-100 and Russell 2000, not the indexes themselves.",
    ],
  },
  ratios: {
    what: "Return earned per unit of risk taken, using your own risk-free / minimum acceptable return assumption.",
    formulas: [
      "Daily rf = (1 + annual rf)^(1/252) - 1. Excess e(t) = r(t) - daily rf.",
      "Sharpe = mean(e) / sample SD(r) x sqrt(252).",
      "Sortino = mean(e) x 252 / downside deviation, where downside deviation = sqrt(sum(min(0, e)^2) / N_all) x sqrt(252), averaging over ALL observations.",
      "Calmar = CAGR / |maximum drawdown| over the selected range (CAGR not reduced by rf).",
    ],
    limits: [
      "The rate is a fixed assumption you enter (default 0%), not a live Treasury yield.",
      "A ratio shows as a dash when undefined (zero deviation or no drawdown). Under 252 returns, estimates are very noisy.",
    ],
  },
  correlation: {
    what: "Market sensitivity to SPY, plus how closely this stock moves with any second investment you choose.",
    formulas: [
      "Beta = Cov(stock, SPY) / Var(SPY) on paired daily returns.",
      "Correlation = Cov(a, b) / (SD(a) x SD(b)); R-squared = correlation^2.",
      "Market beta always uses SPY. The pair correlation uses your chosen ticker and is not a market beta.",
    ],
    limits: [
      "Daily correlations can differ from weekly or monthly ones, especially for thinly traded or non-US listings whose sessions close at different times.",
      "Relationships shift over time; one number summarizes the whole range.",
    ],
  },
};

export default function RiskInfoPanel({ view }: { view: RiskView }) {
  const info = INFO[view];
  return (
    <aside className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4 text-xs leading-relaxed" data-testid={`panel-risk-info-${view}`}>
      <div className="flex items-center gap-2 text-primary">
        <BookOpen className="h-4 w-4" />
        <p className="font-semibold uppercase tracking-[0.18em]">Information</p>
      </div>
      <p className="mt-2 text-sm text-foreground">{info.what}</p>
      <p className="mt-3 font-semibold text-foreground">Formulas</p>
      <ul className="mt-1 space-y-1.5 font-mono text-[11px] text-muted-foreground">
        {info.formulas.map((f) => <li key={f} className="border-l-2 border-primary/30 pl-2">{f}</li>)}
      </ul>
      <p className="mt-3 font-semibold text-foreground">Limits</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
        {info.limits.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">Daily-return statistics (volatility, Sharpe, Sortino, beta, correlation) exclude any return spanning more than 7 calendar days, so data gaps are not counted as one day. CAGR and drawdowns use the available closes over the elapsed range.</p>
      <p className="mt-2 text-[11px] text-muted-foreground">Dividend-adjusted closes in the listing currency, no FX conversion. Historical risk does not guarantee future risk. Not investment advice.</p>
    </aside>
  );
}
