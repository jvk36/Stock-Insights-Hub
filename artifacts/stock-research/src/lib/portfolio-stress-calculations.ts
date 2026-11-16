import { simulatePortfolio } from "./portfolio-tools-calculations.ts";
import type { PortfolioHolding, HoldingHistory, PortfolioOptions, PortfolioOutcome } from "./portfolio-tools-calculations.ts";
import { analyzeDrawdowns } from "./risk-calculations.ts";
import type { DrawdownAnalysis, DrawdownEpisode } from "./risk-calculations.ts";
import type { PricePoint } from "./performance-calculations.ts";

export interface CrisisWindow { id: string; name: string; start: string; end: string; finalSession: string; description: string }
/** Calendar-year scenarios include the preceding year-end close as the initial mark. */
export const CRISIS_WINDOWS: readonly CrisisWindow[] = [
  { id: "dotcom", name: "2000–2002 dot-com crash", start: "1999-12-31", end: "2002-12-31", finalSession: "2002-12-31", description: "Three calendar years, using the preceding year-end close as the starting mark." },
  { id: "financial", name: "2008 financial crisis", start: "2007-12-31", end: "2008-12-31", finalSession: "2008-12-31", description: "Calendar 2008, not the entire 2007–2009 market decline." },
  { id: "covid", name: "2020 COVID crash", start: "2020-02-19", end: "2020-03-23", finalSession: "2020-03-23", description: "The February 19 to March 23 US equity crash window, not the full year." },
  { id: "bear2022", name: "2022 bear market", start: "2021-12-31", end: "2022-12-31", finalSession: "2022-12-30", description: "Calendar 2022, using the preceding year-end close as the starting mark." },
];
export interface CrisisScenario {
  window: CrisisWindow;
  outcome: PortfolioOutcome;
  totalReturn: number | null;
}
/** Reset the SAME initial allocation at each named window; never clip a crisis
 * to a recent ETF's inception, replace a holding, or use a proxy without consent.
 */
export function simulateCrises(
  holdings: PortfolioHolding[], histories: HoldingHistory[],
  options: Omit<PortfolioOptions, "start" | "end">,
): CrisisScenario[] {
  return CRISIS_WINDOWS.map((window) => {
    let outcome = simulatePortfolio(holdings, histories, { ...options, start: window.start, end: window.end });
    // These are fixed US-market scenarios with known anchor sessions. Do not
    // apply the general date-range tool's holiday tolerance to a late IPO or
    // an incomplete feed at either end of a crash.
    if (outcome.ok && (outcome.start !== window.start || outcome.end !== window.finalSession)) {
      outcome = { ok: false, reason: `Incomplete crisis coverage: all positive-weight holdings need prices on ${window.start} and ${window.finalSession}. This window has not been shortened.` };
    }
    return {
      window, outcome,
      totalReturn: outcome.ok ? outcome.prices[outcome.prices.length - 1].adjustedClose / outcome.prices[0].adjustedClose - 1 : null,
    };
  });
}

export interface PortfolioRecovery {
  analysis: DrawdownAnalysis;
  episodes: DrawdownEpisode[];
  minimumLoss: number;
  asOf: string | null;
}
/** Major = non-overlapping running-peak episodes losing AT LEAST the selected
 * threshold. First close >= the old high is recovered (including equality).
 * Trough-to-recovery and peak-to-recovery are different calendar-day measures.
 */
export function portfolioRecovery(prices: PricePoint[], minimumLoss = 0.1): PortfolioRecovery {
  if (!Number.isFinite(minimumLoss) || minimumLoss <= 0 || minimumLoss > 1) {
    throw new Error("Major-drawdown threshold must be above 0% and at most 100%.");
  }
  const analysis = analyzeDrawdowns(prices);
  return {
    analysis,
    episodes: analysis.episodes.filter((episode) => -episode.loss + 1e-12 >= minimumLoss),
    minimumLoss, asOf: prices[prices.length - 1]?.date ?? null,
  };
}
