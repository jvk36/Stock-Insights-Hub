import type { BacktestAllocation, ModelPortfolioBacktest } from "@workspace/api-zod";
import { UNIVERSE } from "./model-portfolio-engine";
import type { MomentumMarket } from "./momentum-engine";
import type { HistoricalBook } from "./blind-trust-history";
import { BACKTEST_START, BACKTEST_END_EXCLUSIVE, BACKTEST_CAPITAL } from "./portfolio-backtest-engine";
import { fetchMomentumMarket } from "./momentum-market";

export async function fetchBlindTrustPriceHistory(): Promise<MomentumMarket> {
  const market = await fetchMomentumMarket(BACKTEST_START, new Date(), UNIVERSE.map((e) => ({ ticker: e.providerSymbol })));
  for (const e of UNIVERSE) {
    if (e.ticker === e.providerSymbol) continue;
    market.prices[e.ticker] = market.prices[e.providerSymbol] ?? {};
    delete market.prices[e.providerSymbol];
    market.actions = market.actions.map((a) => a.ticker === e.providerSymbol ? { ...a, ticker: e.ticker } : a);
  }
  for (const e of UNIVERSE.filter((e) => e.ticker !== "PSUS")) {
    if (!Object.keys(market.prices[e.ticker] ?? {}).length) throw new Error(`${e.ticker} price download failed; no historical ranking is inferred.`);
  }
  await applySpinoffCash(market);
  return market;
}

const SPINOFFS = [
  { parent: "JEF", child: "SPB", date: "2019-09-27", ratio: 0.0250589,
    source: "https://www.sec.gov/Archives/edgar/data/96223/000119312519259224/d809899dex99.htm" },
  { parent: "JEF", child: "VTS", date: "2023-01-17", ratio: 1 / 8.49668,
    source: "https://www.sec.gov/Archives/edgar/data/96223/000119312523008896/d450593d8k.htm" },
  { parent: "HHH", child: "SEG", date: "2024-08-01", ratio: 1 / 9,
    source: "https://www.sec.gov/Archives/edgar/data/2009684/000162828024034173/seaportentertainmentgroups.htm" },
] as const;

export async function applySpinoffCash(market: MomentumMarket, suppliedChildren?: MomentumMarket) {
  // Yahoo encodes these stock distributions as fractional "splits". They
  // must NOT create additional parent shares. Prices have already been
  // restored to the historical nominal basis by the market adapter.
  const children = suppliedChildren ?? await fetchMomentumMarket(BACKTEST_START, new Date(), SPINOFFS.map((s) => ({ ticker: s.child })));
  for (const s of SPINOFFS) {
    const childClose = children.prices[s.child]?.[s.date];
    if (!(childClose > 0)) throw new Error(`Cannot verify ${s.child} spin-off value on ${s.date}.`);
    market.actions = market.actions.filter((a) => !(a.ticker === s.parent && a.date === s.date && a.type === "split"));
    market.actions.push({ ticker: s.parent, date: s.date, type: "dividend", value: childClose * s.ratio });
  }
}

export function historicalCandidates(market: MomentumMarket, books: HistoricalBook[], date: string) {
  return UNIVERSE.map((e) => {
    const price = market.prices[e.ticker]?.[date] ?? null;
    const book = books.filter((b) => b.ticker === e.ticker && b.filed < date && b.date < date)
      .sort((a, b) => b.date.localeCompare(a.date) || b.filed.localeCompare(a.filed))[0];
    const valid = book && book.value != null && Date.parse(date) - Date.parse(book.date) <= 550 * 864e5;
    return {
      ticker: e.ticker, name: e.name, price, shares: 0, value: 0, weight: 0, selected: false, sma200: null,
      bookValue: valid ? book.value : null, bookDate: valid ? book.date : null,
      filedOn: valid ? book.filed : null, bookSource: valid ? book.source : null,
      priceToBook: price != null && price > 0 && valid && book.value! > 0 ? price / book.value! : null,
      reason: price == null ? "No price for this session; excluded." : !valid ? "Historical book value not verified; rebalance blocked." :
        book.value! <= 0 ? "Nonpositive book value; ineligible." : null,
    };
  });
}

export function runBlindTrustBacktest(market: MomentumMarket, books: HistoricalBook[], issues: string[] = []): ModelPortfolioBacktest {
  const performance: ModelPortfolioBacktest["performance"] = [], allocations: BacktestAllocation[] = [];
  const omittedDates: string[] = [], warnings = [...issues];
  const dates = [...new Set(Object.values(market.prices).flatMap(Object.keys))]
    .filter((d) => d >= BACKTEST_START && d < BACKTEST_END_EXCLUSIVE).sort();
  let cash = BACKTEST_CAPITAL, processed = BACKTEST_START, inception: string | null = null;
  let positions: { ticker: string; shares: number }[] = [];
  let year = 2016, due = BACKTEST_START;
  const failed = new Set<string>();
  for (const date of dates) {
    if (inception) {
      for (const action of market.actions.filter((a) => a.date > processed && a.date <= date)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.type === "split" ? -1 : 1))) {
        const p = positions.find((p) => p.ticker === action.ticker);
        if (!p) continue;
        if (action.type === "split") p.shares *= action.value;
        else cash += p.shares * action.value;
      }
    }
    processed = date;
    if (positions.some((p) => !(market.prices[p.ticker]?.[date] > 0))) {
      omittedDates.push(date);
      continue;
    }
    const equity = cash + positions.reduce((s, p) => s + p.shares * market.prices[p.ticker][date], 0);
    if (date >= due) {
      const candidates = historicalCandidates(market, books, date);
      // Before listing, an issuer is excluded. A missing quote inside an
      // existing history is instead a data gap, not permission to change ranks.
      const missingSession = candidates.some((c) => c.price == null &&
        Object.keys(market.prices[c.ticker] ?? {}).some((d) => d < date) &&
        Object.keys(market.prices[c.ticker] ?? {}).some((d) => d > date));
      const priced = candidates.filter((c) => c.price != null);
      const eligible = priced.filter((c) => c.priceToBook != null).sort((a, b) => a.priceToBook! - b.priceToBook! || a.ticker.localeCompare(b.ticker));
      if (missingSession || priced.some((c) => c.bookValue == null) || eligible.length < 3) {
        failed.add(due);
      } else {
        const selected = eligible.slice(0, 3);
        positions = selected.map((c) => ({ ticker: c.ticker, shares: equity / 3 / c.price! }));
        cash = 0;
        allocations.push({ date, scheduledDate: due, equity, cash, positions: candidates.map((c) => {
          const p = positions.find((p) => p.ticker === c.ticker);
          return { ...c, selected: !!p, weight: p ? 100 / 3 : 0, shares: p?.shares ?? 0,
            value: p ? p.shares * c.price! : 0 };
        }) });
        failed.delete(due);
        inception ??= date;
        year = Number(date.slice(0, 4)) + 1;
        due = `${year}-10-26`;
      }
    }
    if (inception) performance.push({ date, value: equity, cash, returnPercent: (equity / BACKTEST_CAPITAL - 1) * 100 });
  }
  const last = performance.at(-1);
  if (!inception || inception !== BACKTEST_START) warnings.push("The complete initial October 26, 2016 allocation could not be verified.");
  if (allocations.length !== 10 || failed.size) warnings.push("Not all ten annual allocations could be verified; incomplete rankings are not estimated.");
  if (!last || last.date < "2026-10-23") warnings.push("Historical prices do not cover the full requested window.");
  if (omittedDates.length) warnings.push(`${omittedDates.length} sessions omitted because a held security lacked a price.`);
  return {
    strategy: "blind-trust", status: !inception ? "unavailable" : warnings.length ? "partial" : "complete",
    message: warnings.join(" ") || null, startDate: BACKTEST_START, endDateExclusive: BACKTEST_END_EXCLUSIVE,
    actualStartDate: inception, actualEndDate: last?.date ?? null, initialCapital: BACKTEST_CAPITAL,
    finalValue: last?.value ?? null, gain: last ? last.value - BACKTEST_CAPITAL : null,
    returnPercent: last?.returnPercent ?? null, refreshedAt: market.observedAt,
    performance, allocations, omittedDates,
    assumptions: [
      "Hypothetical $30,000 portfolio from October 26, 2016 through the last trading session before October 26, 2026. Separate from the live portfolio.",
      "Annual October 26 reviews, next complete trading session when necessary. Select the three lowest positive price-to-book ratios and allocate the entire current equity equally.",
      "USD book values reconstructed from original SEC balance sheets, common equity excluding reported preferred stock, and outstanding shares at the same balance-sheet date. No weighted-average EPS shares. Berkshire A-equivalent shares = A + B/1,500.",
      "Use the latest verified reporting period filed strictly before each trade date, never a later restatement. Fairfax uses its originally published June book value per basic share in USD. Sources, period dates and filing dates are shown with each allocation.",
      "Securities without pricing on a review date, including PSUS before listing and BOC before available trading history, are excluded. Missing book values for priced candidates block the ranking rather than silently excluding a potentially cheaper company.",
      "Historical purchases and valuations use closing prices, not the live portfolio's opening-price inception convention. Same-close ranking/execution is an idealized assumption.",
      "Fractional shares. Reported dividends accumulate as cash until annual rebalancing; no inception-day dividend entitlement. Splits adjust share counts. No taxes, commissions, slippage or cash interest.",
      "Stock distributions are modeled as immediate cash liquidation at the distributed security's ex-date close, held until annual rebalancing: JEF/SPB 0.0250589 on September 27, 2019; JEF/VTS 1/8.49668 on January 17, 2023; HHH/SEG 1/9 on August 1, 2024. Ex-date cash recognition is an idealization, not settlement-date accounting.",
      ...SPINOFFS.map((s) => `${s.parent}/${s.child} distribution terms: ${s.source}`),
      "Today's chosen businesses are applied retrospectively (selection/survivorship bias). Historical sources can have gaps or later revisions; this is not a forecast or an achieved investment return.",
    ],
  };
}
