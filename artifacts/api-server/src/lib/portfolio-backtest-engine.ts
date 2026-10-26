import type { BacktestAllocation, ModelPortfolioBacktest } from "@workspace/api-zod";
import { ETF_UNIVERSE, momentumSignals, nextQuarter, type MomentumMarket } from "./momentum-engine";
import { LAZY_UNIVERSE } from "./lazy-engine";

export const BACKTEST_START = "2016-10-26";
export const BACKTEST_END_EXCLUSIVE = "2026-10-26";
export const BACKTEST_CAPITAL = 30_000;
export type BacktestStrategy = "momentum" | "lazy";
type Position = { ticker: string; shares: number };

// Pure historical accounting. This never invokes or writes a live strategy.
export function runPortfolioBacktest(strategy: BacktestStrategy, market: MomentumMarket): ModelPortfolioBacktest {
  const universe = strategy === "momentum" ? ETF_UNIVERSE : LAZY_UNIVERSE;
  const performance: ModelPortfolioBacktest["performance"] = [];
  const allocations: BacktestAllocation[] = [];
  const omittedDates: string[] = [];
  const deferred: string[] = [];
  const dates = [...new Set(Object.values(market.prices).flatMap((p) => Object.keys(p)))]
    .filter((d) => d >= BACKTEST_START && d < BACKTEST_END_EXCLUSIVE && d <= market.targetDate).sort();
  let positions: Position[] = [];
  let cash = BACKTEST_CAPITAL;
  let processed: string | null = null;
  let inception: string | null = null;
  let due = BACKTEST_START;
  const valueAt = (prices: Record<string, number>) => cash + positions.reduce((s, p) => s + p.shares * prices[p.ticker], 0);

  for (const date of dates) {
    const prices = Object.fromEntries(universe.map((e) => [e.ticker, market.prices[e.ticker]?.[date]]));
    if (universe.some((e) => !Number.isFinite(prices[e.ticker]) || prices[e.ticker] <= 0)) {
      omittedDates.push(date);
      continue;
    }
    // Carry actions across omitted sessions, exactly once. Purchases made at
    // the close do not earn distributions with that same day's ex-date.
    if (inception) {
      const actions = market.actions.filter((a) => a.date > processed! && a.date <= date && a.date > inception!)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.type === "split" ? -1 : 1));
      for (const action of actions) {
        if (!Number.isFinite(action.value) || action.value <= 0) throw new Error("Invalid historical corporate action");
        const position = positions.find((p) => p.ticker === action.ticker);
        if (!position) continue;
        if (action.type === "split") position.shares *= action.value;
        else cash += position.shares * action.value;
      }
    }
    if (date >= due) {
      const signals = strategy === "momentum" ? momentumSignals(market, date) : null;
      if (signals?.some((s) => s.status !== "ready")) {
        deferred.push(date);
      } else {
        const equity = valueAt(prices);
        if (!Number.isFinite(equity) || equity <= 0) throw new Error("Invalid historical portfolio equity");
        const selected = signals ? signals.filter((s) => s.aboveSma).map((s) => s.ticker) : universe.map((e) => e.ticker);
        const targets = Object.fromEntries(universe.map((e) => [e.ticker,
          strategy === "lazy" ? LAZY_UNIVERSE.find((l) => l.ticker === e.ticker)!.targetWeight :
            selected.includes(e.ticker) ? 100 / selected.length : 0]));
        positions = universe.filter((e) => targets[e.ticker] > 0).map((e) => ({
          ticker: e.ticker, shares: equity * targets[e.ticker] / 100 / prices[e.ticker],
        }));
        cash = selected.length ? 0 : equity;
        allocations.push({
          date, scheduledDate: due, equity, cash,
          positions: universe.map((e) => {
            const position = positions.find((p) => p.ticker === e.ticker);
            const shares = position?.shares ?? 0;
            return { ticker: e.ticker, name: e.name, price: prices[e.ticker], shares,
              value: shares * prices[e.ticker], weight: targets[e.ticker],
              sma200: signals?.find((s) => s.ticker === e.ticker)?.sma200 ?? null, selected: targets[e.ticker] > 0 };
          }),
        });
        inception ??= date;
        // Original calendar anniversaries, not calendar quarter ends and not
        // three months after a holiday-delayed execution.
        due = nextQuarter(BACKTEST_START, date);
      }
    }
    processed = date;
    if (inception) {
      const value = valueAt(prices);
      performance.push({ date, value, cash, returnPercent: (value / BACKTEST_CAPITAL - 1) * 100 });
    }
  }
  const last = performance.at(-1);
  const warnings: string[] = [];
  if (!inception) warnings.push("No complete initial allocation could be verified. No historical returns are fabricated.");
  if (inception && inception !== dates[0]) warnings.push(`Initial allocation was delayed until ${inception} by incomplete data.`);
  if (omittedDates.length) warnings.push(`${omittedDates.length} incomplete sessions omitted; intervening corporate actions carry forward.`);
  if (deferred.length) warnings.push(`${deferred.length} rebalance attempts deferred for incomplete 200-session SMA data; holdings retained until complete data returned.`);
  // A truncated provider response must never masquerade as the full decade.
  if (!dates.length || dates[0] > "2016-10-28") warnings.push("The requested start of the historical window is missing.");
  if (!last || last.date < "2026-10-23") warnings.push("The historical window does not reach the last session before live inception.");
  return {
    strategy, status: !inception ? "unavailable" : warnings.length ? "partial" : "complete",
    message: warnings.join(" ") || null,
    startDate: BACKTEST_START, endDateExclusive: BACKTEST_END_EXCLUSIVE,
    actualStartDate: inception, actualEndDate: last?.date ?? null,
    initialCapital: BACKTEST_CAPITAL, finalValue: last?.value ?? null,
    gain: last ? last.value - BACKTEST_CAPITAL : null, returnPercent: last?.returnPercent ?? null,
    refreshedAt: market.observedAt,
    assumptions: [
      "Hypothetical historical simulation, separate from the live portfolio. Start October 26, 2016; end strictly before live inception on October 26, 2026 (last trading session October 23).",
      "USD prices from Yahoo Finance daily closes and reported distributions/splits. Fractional shares; no new contributions.",
      "Full-portfolio quarterly rebalancing on three-calendar-month anniversaries of October 26, 2016. Nontrading dates use the next complete session.",
      strategy === "momentum"
        ? "Same-close simulation: strictly above the trailing 200-session split-adjusted (not dividend-adjusted) SMA including the signal session. Equal weights across all qualifiers; otherwise non-interest-bearing cash. Same-close execution is an idealized assumption, not a tradeable fill guarantee."
        : "Fixed weights: VTI 30%, VNQ 20%, VEU 15%, VWO 5%, TIP 15%, IEI 15%. VEU includes emerging markets and overlaps VWO.",
      "Dividends credited as cash on ex-date and reinvested only at quarterly rebalance; no launch-day dividend entitlement. Splits adjust shares without changing equity.",
      "No fees, taxes, slippage or cash interest. Uses today's chosen ETF universe retrospectively (selection/survivorship bias). Historical data may be revised. Past performance does not predict future returns.",
    ],
    performance, allocations, omittedDates,
  };
}
