import type { BacktestAllocation, BacktestPosition, BlindTrustLedgerEvent, ModelPortfolioBacktest } from "@workspace/api-zod";
import type { MomentumMarket } from "./momentum-engine";
import { CLONING_CAPITAL, type CloneReview } from "./cloning-selection";
import { WBD_PRICE_SOURCE, WBD_SETTLEMENT_SOURCE, NEBIUS_RENAME_SOURCE, type CashSettlement } from "./cloning-corporate-actions";

export const CLONING_ASSUMPTIONS = [
  "Rule-based hypothetical model in USD, not actual investor execution. Since-inception history before this feature launched is reconstructed from the archived filings; past performance does not predict future returns.",
  "$30,000 starting capital; fractional shares; equal weight across up to ten distinct manager winners. No qualifying buys means cash. Fewer than ten distinct winners means equal allocation among the available winners.",
  "Every quarterly rebalance liquidates all remaining holdings at the execution close, then buys the newly selected stocks with all available cash in equal dollar amounts. Stocks selected again are sold and repurchased, not netted. The transaction ledger records these model trades, distributions, splits and verified cash acquisitions.",
  "For each manager, rank new/increased shares by added portfolio weight: added shares × quarter-end value per share ÷ current filed portfolio value. Prior shares are normalized for known splits. This is an estimate of capital added at quarter-end prices, not actual purchase cost or the change in total position weight.",
  "Take each manager's single highest-ranked purchase, rank those winners together, deduplicate tickers keeping the highest score, and select up to ten. Duplicate managers do not cause extra weight and no runner-up from that same manager is substituted.",
  "Reviews are 45 calendar days after quarter end, next trading day if closed. Requested inception is August 15, 2026 (Saturday), executed at the August 17 close. Historical inception is August 15, 2016. Each later review remains anchored to its quarter end, not the prior execution date.",
  "Only filings dated strictly before the execution day qualify, conservatively excluding same-day filings because the archive has no SEC acceptance times. Missing prior-quarter comparisons are not counted as new buys. Late or missing filings are disclosed. The archive may omit original versions that were replaced by amendments.",
  "Use exact verified closing prices; never substitute survivors for missing/delisted winners or invent acquisition settlement proceeds. An unpriceable selected security blocks that allocation and subsequent performance. A missing held-position session is omitted; corporate actions carry forward.",
  "Known ordinary splits adjust shares. Unsupported fractional stock distributions are flagged, not treated as ordinary splits. Dividends accrue to existing holders as cash on ex-date and are reinvested only at the next rebalance.",
  "No taxes, fees, commissions, bid/ask spreads, slippage or cash interest. Closing-price execution is an idealized assumption. 13Fs lag transactions, omit shorts and many non-US/private assets, and do not reveal a manager's entire investment thesis or hedges.",
  "The currently tracked manager list is used retrospectively (manager-selection and survivorship bias); missing historical disclosures and later ticker mappings limit point-in-time completeness. This is a concentrated equity strategy, not market-neutral, guaranteed absolute-return or uncorrelated-return investing.",
  `Verified exceptions: YNDX became NBIS with unchanged Class A CUSIP (issuer: ${NEBIUS_RENAME_SOURCE}). AJG.MX is mapped to AJG's USD US-listed common shares, never Mexican-peso prices.`,
  `WBD August 17–October 5, 2026 closing prices come from the issuer's historical quote table (${WBD_PRICE_SOURCE}). WBD was redeemed for $31.01666668 cash per share on October 6, 2026, including the ticking fee; model credits cash on completion, before any broker settlement delay (${WBD_SETTLEMENT_SOURCE}). No WBD quotes are forward-filled after delisting.`,
];

export function runCloning(
  market: MomentumMarket & { settlements?: CashSettlement[] }, reviews: CloneReview[], start: string, endExclusive: string,
  locked: BacktestAllocation[] = [],
): ModelPortfolioBacktest {
  const performance: ModelPortfolioBacktest["performance"] = [], allocations: BacktestAllocation[] = [];
  const ledger: BlindTrustLedgerEvent[] = [];
  const record = (date: string, type: string, ticker: string | null, shares: number, price: number, cashChange: number) =>
    ledger.push({ id: `cloning:${date}:${type}:${ticker ?? "cash"}:${ledger.length}`, date, type, ticker, shares, price, cashChange });
  const warnings = new Set<string>(), omittedDates: string[] = [];
  const sessions = Object.keys(market.prices.SPY ?? {}).filter((d) => d >= start && d < endExclusive && d <= market.targetDate).sort();
  let positions: BacktestPosition[] = [], cash = CLONING_CAPITAL, begun = false;
  let previous = start, blocked = false;
  const reviewByDate = new Map(reviews.map((r) => [r.date, r]));
  for (const date of sessions) {
    if (begun) {
      for (const action of market.actions.filter((a) => a.date > previous && a.date <= date)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.type === "split" ? -1 : 1))) {
        const p = positions.find((p) => p.ticker === action.ticker);
        if (!p) continue;
        if (action.type === "split") {
          const ordinary = Math.abs(action.value - Math.round(action.value)) < 1e-7
            || Math.abs(1 / action.value - Math.round(1 / action.value)) < 1e-7;
          if (!ordinary) {
            warnings.add(`${p.ticker}: unsupported stock distribution on ${action.date}; performance stops before unverified accounting.`);
            blocked = true; break;
          }
          p.shares *= action.value;
          if (p.entryPrice != null) p.entryPrice /= action.value;
          record(action.date, "split", p.ticker, p.shares, action.value, 0);
        } else {
          const amount = p.shares * action.value;
          cash += amount;
          record(action.date, "dividend", p.ticker, p.shares, action.value, amount);
        }
      }
    }
    if (blocked) break;
    if (begun) for (const event of market.settlements ?? []) {
      if (event.date <= previous || event.date > date) continue;
      const p = positions.find((p) => p.ticker === event.ticker);
      if (!p) continue;
      cash += p.shares * event.price;
      record(event.date, "cash_acquisition", p.ticker, p.shares, event.price, p.shares * event.price);
      positions = positions.filter((p) => p.ticker !== event.ticker);
    }
    previous = date;
    const review = reviewByDate.get(date);
    if (review) review.issues.forEach((issue) => warnings.add(`${review.reportDate}: ${issue}`));
    if (positions.some((p) => !(market.prices[p.ticker]?.[date] > 0))) {
      omittedDates.push(date);
      if (review) {
        warnings.add(`Cannot value all outgoing holdings at the required ${date} close; no later execution is substituted.`);
        break;
      }
      continue;
    }
    const value = () => cash + positions.reduce((sum, p) => sum + p.shares * market.prices[p.ticker][date], 0);
    if (review) {
      const saved = locked.find((a) => a.scheduledDate === review.scheduledDate);
      const selected = saved ? saved.positions.filter((p) => p.selected) : review.picks.filter((p) => p.selected);
      const missing = selected.filter((p) => !p.ticker || !(market.prices[p.ticker]?.[date] > 0));
      if (missing.length) {
        warnings.add(`${date}: verified USD closing price missing for ${missing.map((p) => p.ticker || p.name).join(", ")}; allocation and subsequent returns are unavailable, not replaced with other stocks.`);
        break;
      }
      if (!selected.length && review.issues.length) {
        warnings.add(`${date}: no verified manager comparisons; cannot infer an all-cash signal.`);
        break;
      }
      const equity = value();
      if (!begun) record(date, "deposit", null, 0, 0, CLONING_CAPITAL);
      for (const p of positions) {
        const price = market.prices[p.ticker][date];
        record(date, "sell", p.ticker, p.shares, price, p.shares * price);
      }
      if (saved) {
        // Trade decisions, share counts and execution prices are immutable once stored.
        positions = saved.positions.filter((p) => p.selected).map((p) => ({ ...p }));
        cash = saved.cash;
        allocations.push(saved);
      } else {
        positions = selected.map((pick) => {
          const price = market.prices[pick.ticker][date], amount = equity / selected.length;
          return {
            ...pick, price, entryPrice: price, entryDate: date, costBasis: amount,
            sma200: null, selected: true, shares: amount / price, value: amount, weight: 100 / selected.length,
          };
        });
        cash = selected.length ? 0 : equity;
        allocations.push({ date, scheduledDate: review.scheduledDate, equity, cash, positions: positions.map((p) => ({ ...p })) });
      }
      for (const p of positions) {
        const price = p.entryPrice ?? p.price!;
        record(date, "buy", p.ticker, p.shares, price, -p.shares * price);
      }
      begun = true;
    }
    if (begun) performance.push({ date, value: value(), cash, returnPercent: (value() / CLONING_CAPITAL - 1) * 100 });
  }
  if (omittedDates.length) warnings.add(`${omittedDates.length} sessions omitted because a held security has no verified price; no forward-filled return is invented.`);
  const last = performance.at(-1);
  const expectedEnd = sessions.at(-1);
  if (!last || last.date !== expectedEnd) warnings.add("Verified performance does not reach the end of the requested window.");
  if (!Object.keys(market.prices.SPY ?? {}).length) warnings.add("The US trading-session calendar is unavailable.");
  const status = !last ? "unavailable" : warnings.size ? "partial" : "complete";
  return {
    strategy: "cloning", status, message: [...warnings].join(" ") || null,
    startDate: start, endDateExclusive: endExclusive, actualStartDate: performance[0]?.date ?? null,
    actualEndDate: last?.date ?? null, initialCapital: CLONING_CAPITAL,
    finalValue: last?.value ?? null, gain: last ? last.value - CLONING_CAPITAL : null,
    returnPercent: last?.returnPercent ?? null, refreshedAt: market.observedAt,
    assumptions: CLONING_ASSUMPTIONS, performance, allocations, omittedDates, ledger,
    reviewAudit: reviews.map((r) => ({
      date: r.date, scheduledDate: r.scheduledDate, reportDate: r.reportDate, issues: r.issues,
      picks: r.picks.filter((p) => p.selected).map((p) => {
        const price = market.prices[p.ticker]?.[r.date] ?? null;
        return { ...p, price, pricingIssue: price == null ? "Verified USD execution close unavailable; not replaced with a different stock." : null };
      }),
    })),
  };
}
