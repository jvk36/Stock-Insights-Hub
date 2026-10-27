import type { BlindTrustAllocation, BlindTrustLedgerEvent, BlindTrustPerformance, MagicFormulaCandidate, MagicFormulaCohort, MagicFormulaRanking } from "@workspace/api-zod";
import type { MomentumMarket } from "./momentum-engine";

export const MAGIC_INCEPTION = "2026-10-27";
export const MAGIC_CAPITAL = 30000;
export type MagicPosition = { ticker: string; name: string; cohort: number; rank: number; shares: number; entryDate: string; entryPrice: number; costBasis: number };
export type MagicState = {
  version: 1; cash: number; reservedCash: number; dividendCash: number; cohortCash: number[];
  inceptionPriceBasis?: "session-open";
  rankings: MagicFormulaRanking[]; cohorts: MagicFormulaCohort[]; positions: MagicPosition[];
  ledger: BlindTrustLedgerEvent[]; allocations: BlindTrustAllocation[]; performance: BlindTrustPerformance[];
  prices: Record<string, number>; processedThrough: string | null; refreshedAt: string | null; message: string | null;
};
export function cohortDate(cohort: number, year = 2026): string {
  const month = 9 + cohort * 3;
  return new Date(Date.UTC(year, month, 27)).toISOString().slice(0, 10);
}
export function rankingYear(date: string): number {
  return Number(date.slice(0, 4)) - (date.slice(5) < "10-27" ? 1 : 0);
}
export function initialMagicState(): MagicState {
  return {
    version: 1, cash: MAGIC_CAPITAL, reservedCash: MAGIC_CAPITAL, dividendCash: 0, cohortCash: [0, 0, 0, 0],
    rankings: [], positions: [], ledger: [], allocations: [], performance: [], prices: {},
    processedThrough: null, refreshedAt: null, message: null,
    cohorts: [0, 1, 2, 3].map((i) => ({
      cohort: i + 1, scheduledDate: cohortDate(i), nextDate: cohortDate(i), lastTradeDate: null, rankingYear: null, tickers: [],
    })),
  };
}

/** Competition ranks for equal ratios; final score ties resolve by ticker. */
export function rankMagicCandidates(input: MagicFormulaCandidate[]): MagicFormulaCandidate[] {
  const rows = input.map((c) => ({ ...c, earningsRank: null, capitalRank: null, score: null, rank: null } as MagicFormulaCandidate));
  const eligible = rows.filter((c) => !c.reason && c.earningsYield != null && c.returnOnCapital != null);
  for (const [metric, rank] of [["earningsYield", "earningsRank"], ["returnOnCapital", "capitalRank"]] as const) {
    const ordered = [...eligible].sort((a, b) => b[metric]! - a[metric]! || a.ticker.localeCompare(b.ticker));
    ordered.forEach((c, i) => { c[rank] = i && c[metric] === ordered[i - 1][metric] ? ordered[i - 1][rank] : i + 1; });
  }
  eligible.forEach((c) => { c.score = c.earningsRank! + c.capitalRank!; });
  eligible.sort((a, b) => a.score! - b.score! || a.ticker.localeCompare(b.ticker))
    .forEach((c, i) => { c.rank = i + 1; });
  return rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.ticker.localeCompare(b.ticker));
}

export function advanceMagic(input: MagicState, market: MomentumMarket): MagicState {
  const s: MagicState = structuredClone(input);
  s.refreshedAt = market.observedAt;
  s.message = null;
  // Correct only the original, same-session simulated purchases. Never rewrite
  // later dividends, splits or annual replacements as though they had not occurred.
  if (!s.inceptionPriceBasis && s.positions.length) {
    const initial = s.positions.filter((p) => p.cohort === 1);
    const safe = initial.length === 5 && s.positions.length === 5 && s.processedThrough === MAGIC_INCEPTION
      && initial.every((p) => p.entryDate === MAGIC_INCEPTION)
      && s.ledger.length === 6 && s.ledger.every((e) => e.type === "deposit" || e.type === "buy");
    if (!safe) { s.message = "Opening-price correction requires review of later transactions; existing history is preserved."; return s; }
    if (initial.some((p) => !((market.opens?.[p.ticker]?.[MAGIC_INCEPTION] ?? 0) > 0))) {
      s.message = "Awaiting verified inception opening prices; stored positions are preserved without substituting current quotes.";
      return s;
    }
    for (const p of initial) {
      p.entryPrice = market.opens![p.ticker][MAGIC_INCEPTION];
      p.shares = p.costBasis / p.entryPrice;
      const buy = s.ledger.find((e) => e.type === "buy" && e.ticker === p.ticker)!;
      buy.price = p.entryPrice; buy.shares = p.shares;
    }
    s.inceptionPriceBasis = "session-open";
    s.allocations.forEach((a) => {
      if (a.date === MAGIC_INCEPTION) a.note = `Cohort 1; frozen 2026 ranking, ranks 1–5. $1,500 per stock at verified ${MAGIC_INCEPTION} USD session opening prices. Original intraday entry quotes corrected to opening prices.`;
    });
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(market.observedAt));
  // Live prices are allowed only for today's initial deployment, never historical fills.
  const sessions = new Set(Object.keys(market.prices.SPY ?? {}).filter((d) => d >= MAGIC_INCEPTION && d <= market.targetDate));
  for (const date of Object.keys(market.opens?.SPY ?? {})) {
    if (date >= MAGIC_INCEPTION && date <= today) sessions.add(date);
  }
  if (market.live.SPY?.at && market.live.SPY.at.slice(0, 10) === today && today >= MAGIC_INCEPTION) sessions.add(today);
  const record = (date: string, type: string, ticker: string | null, shares: number, price: number, cashChange: number) =>
    s.ledger.push({ id: `magic:${date}:${type}:${ticker ?? "cash"}:${s.ledger.length}`, date, type, ticker, shares, price, cashChange });
  for (const date of [...sessions].sort().filter((d) => !s.processedThrough || d >= s.processedThrough)) {
    const through = s.processedThrough;
    const actions = market.actions.filter((a) => a.date > (through ?? MAGIC_INCEPTION) && a.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.type === "split" ? -1 : 1));
    const unsupported = actions.find((a) => a.type === "split" && s.positions.some((p) => p.ticker === a.ticker)
      && !(a.value > 0 && (Math.abs(a.value - Math.round(a.value)) < 1e-7 || Math.abs(1 / a.value - Math.round(1 / a.value)) < 1e-7)));
    if (unsupported) { s.message = `${unsupported.ticker}: unsupported stock distribution on ${unsupported.date}; existing state preserved before unverified accounting.`; return s; }
    for (const a of actions) {
      const positions = s.positions.filter((p) => p.ticker === a.ticker);
      if (!positions.length) continue;
      if (a.type === "split") {
        for (const p of positions) { p.shares *= a.value; p.entryPrice /= a.value; }
        record(a.date, "split", a.ticker, positions.reduce((n, p) => n + p.shares, 0), a.value, 0);
      } else {
        const shares = positions.reduce((n, p) => n + p.shares, 0), amount = shares * a.value;
        s.cash += amount; s.dividendCash += amount;
        record(a.date, "dividend", a.ticker, shares, a.value, amount);
      }
    }
    s.processedThrough = date;
    const price = (ticker: string, initial = false) => {
      const close = market.prices[ticker]?.[date];
      if (close > 0) return close;
      const live = market.live[ticker];
      return initial && date === today && live?.at.slice(0, 10) === today && live.price > 0 ? live.price : null;
    };
    for (const cohort of s.cohorts) {
      if (date < cohort.nextDate) continue;
      const year = rankingYear(cohort.nextDate);
      const ranking = s.rankings.find((r) => r.year === year && r.availableOn <= date);
      if (!ranking) { s.message = `Awaiting a verified ${year} ranking for cohort ${cohort.cohort}. No future ranking or estimated trade is substituted.`; continue; }
      const picks = ranking.candidates.filter((c) => c.rank != null && c.rank > (cohort.cohort - 1) * 5 && c.rank <= cohort.cohort * 5)
        .sort((a, b) => a.rank! - b.rank!);
      const outgoing = s.positions.filter((p) => p.cohort === cohort.cohort);
      const initial = cohort.lastTradeDate == null;
      const executionPrice = (ticker: string) => initial ? market.opens?.[ticker]?.[date] ?? null : price(ticker);
      // Anniversary replacements use completed closes, not intraday quotes.
      if (!initial && date > market.targetDate) continue;
      if (picks.length !== 5 || picks.some((p) => !(executionPrice(p.ticker)! > 0))
        || (!initial && s.positions.some((p) => price(p.ticker) == null))) {
        s.message = `Cohort ${cohort.cohort}: five ranked stocks and verified execution prices (${initial ? "session opening prices" : "closing prices"}) are required. Holdings and reserved cash are preserved.`; continue;
      }
      if (!s.ledger.length) record(date, "deposit", null, 0, 0, MAGIC_CAPITAL);
      const proceeds = outgoing.reduce((n, p) => n + p.shares * price(p.ticker, initial)!, 0);
      const budget = initial ? 7500 : proceeds + s.cohortCash[cohort.cohort - 1] + s.dividendCash;
      if (!(budget > 0)) { s.message = `Cohort ${cohort.cohort} has no verified reinvestment cash.`; continue; }
      outgoing.forEach((p) => record(date, "sell", p.ticker, p.shares, price(p.ticker)!, p.shares * price(p.ticker)!));
      s.cash += proceeds;
      if (initial) s.reservedCash -= 7500;
      else { s.dividendCash = 0; s.cohortCash[cohort.cohort - 1] = 0; }
      s.positions = s.positions.filter((p) => p.cohort !== cohort.cohort);
      for (const c of picks) {
        const pps = executionPrice(c.ticker)!, amount = budget / 5, shares = amount / pps;
        s.positions.push({ ticker: c.ticker, name: c.name, cohort: cohort.cohort, rank: c.rank!, shares, entryDate: date, entryPrice: pps, costBasis: amount });
        record(date, "buy", c.ticker, shares, pps, -amount);
      }
      s.cash -= budget;
      if (initial && cohort.cohort === 1) s.inceptionPriceBasis = "session-open";
      if (Math.abs(s.cash) < 1e-8) s.cash = 0;
      const scheduled = cohort.nextDate;
      cohort.lastTradeDate = date; cohort.rankingYear = year; cohort.tickers = picks.map((p) => p.ticker);
      // Exactly a year from execution, moved to next trading session by the loop.
      cohort.nextDate = `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;
      const allPrices = s.positions.map((p) => price(p.ticker, initial));
      const quoteSources = picks.map((p) => `${p.ticker}: ${date} ${initial ? "session open" : "close"}`).join("; ");
      s.allocations.push({
        id: `magic:${date}:cohort:${cohort.cohort}`, date, scheduledDate: scheduled, type: initial ? "inception" : "rebalance",
        equity: allPrices.every((p) => p != null) ? s.cash + s.positions.reduce((n, p, i) => n + p.shares * allPrices[i]!, 0) : budget,
        amountPerPosition: budget / 5, tickers: cohort.tickers,
        note: `Cohort ${cohort.cohort}; frozen ${year} ranking, ranks ${(cohort.cohort - 1) * 5 + 1}–${cohort.cohort * 5}. ${initial ? "Reserved initial capital." : "Full cohort sale proceeds plus accumulated dividends; other cohorts untouched."}${date !== scheduled ? ` Execution moved from ${scheduled} to the next available verified trading session.` : ""} USD prices: ${quoteSources}.`,
      });
    }
    if (!s.ledger.length) continue;
    const prices = Object.fromEntries(s.positions.map((p) => [p.ticker, price(p.ticker, date === today)]));
    if (Object.values(prices).some((p) => p == null)) { s.message = `Valuation for ${date} is unavailable: a holding has no verified price. No missing price is estimated.`; continue; }
    const value = s.cash + s.positions.reduce((n, p) => n + p.shares * prices[p.ticker]!, 0);
    s.prices = prices as Record<string, number>;
    s.performance = s.performance.filter((p) => p.date !== date);
    s.performance.push({ date, value, cash: s.cash, returnPercent: (value / MAGIC_CAPITAL - 1) * 100 });
    const allocation = s.allocations.find((a) => a.date === date && a.type === "inception");
    if (allocation) allocation.equity = value;
  }
  const last = s.performance.at(-1);
  if (s.ledger.length && (!last || last.date < market.targetDate)) {
    s.message = s.message ?? "Latest portfolio valuation is incomplete; last verified performance is preserved.";
  }
  return s;
}
