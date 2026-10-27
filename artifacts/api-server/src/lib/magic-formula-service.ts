import { db, modelPortfoliosTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { GetMagicFormulaPortfolioResponse, type MagicFormulaPortfolio, type MagicFormulaCandidate, type MagicFormulaRanking } from "@workspace/api-zod";
import { scrapeSp500, type IndexStock } from "../routes/indexes";
import { fetchMagicCandidate } from "./magic-formula-data";
import { advanceMagic, initialMagicState, rankMagicCandidates, rankingYear, MAGIC_CAPITAL, MAGIC_INCEPTION, type MagicState } from "./magic-formula-engine";
import { fetchMomentumMarket } from "./momentum-market";
import { completedThrough, marketDate } from "./model-portfolio-market";
import { logger } from "./logger";

const SLUG = "magic-formula", REFRESH_MS = 15 * 60_000;
let running: Promise<void> | null = null;
let progress = "Waiting to scan the S&P 500 universe.";
type Scan = { version: 2; year: number; scheduledDate: string; startedAt: string; stocks: IndexStock[]; candidates: MagicFormulaCandidate[] };
export const MAGIC_ASSUMPTIONS = [
  "Joel Greenblatt-inspired mechanical model, not an investment recommendation. S&P 500 membership is captured when each annual ranking is generated; this is not a historical backtest.",
  "Earnings yield = trailing-twelve-month EBIT / enterprise value. Return on capital = EBIT / (current assets minus current liabilities plus net PP&E). Net PP&E is already after accumulated depreciation; depreciation is not deducted twice.",
  "Financials and utilities are excluded under the standard operating-business comparison. Missing/stale financial statements, nonpositive EBIT/EV/total operating capital and unverified currency conversions are excluded with a reason. Negative working capital alone is allowed if total operating capital remains positive.",
  "All monetary inputs are USD-normalized using verified financial-reporting currency conversion. Financial inputs and EV are Yahoo Finance observations captured for the annual snapshot, not reconstructed as earlier point-in-time filings.",
  "Both ratios rank highest first using equal ranks for equal ratios. Add the two ranks; lowest sum wins. Combined-score ties are resolved alphabetically by ticker. A scan processes the entire available index roster before freezing a ranking. Data-source exclusions may reduce the eligible universe and affect the result.",
  "Four $7,500 groups deploy five stocks each ($1,500 per stock) on October 27, 2026; January 27, April 27 and July 27, 2027. Uninvested initial capital remains reserved cash without interest. Fractional shares are permitted.",
  "Ranking refreshes once per year on or after October 27. The next three quarterly groups use ranks 6–10, 11–15 and 16–20 of the same frozen ranking, not newly recomputed quarterly lists.",
  "Each group is sold one year after its actual purchase date, at the next trading session's close if markets are closed. Replacement uses that group's sale proceeds plus all accumulated cash dividends, not the reserves for untouched groups. Stocks selected again are sold and repurchased; other groups are not liquidated.",
  "Initial groups buy at verified USD opening prices for their execution session; annual replacements use completed closing prices. The first five stocks use October 27, 2026 opening prices, as requested. Current quotes value holdings but never replace an opening-price cost basis. Delayed ranking/price availability delays later execution and is disclosed in rebalance history.",
  "Dividends accrue as cash on ex-date (an idealization of payment timing) and are used at the next annual group replacement; known ordinary splits adjust quantities. Unsupported corporate actions or missing prices stop valuation/trades rather than inventing proceeds.",
  "This is a long-only equity/value strategy, not market-neutral or guaranteed absolute/uncorrelated returns. It can suffer significant losses and prolonged underperformance. Taxes, fees, spreads, slippage and cash interest are excluded. Performance includes undeployed cash.",
];
async function ensure() {
  await db.insert(modelPortfoliosTable).values({ slug: SLUG, state: initialMagicState() }).onConflictDoNothing();
}
async function readState(): Promise<MagicState> {
  const [row] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
  return row.state as MagicState;
}
async function annualRanking(year: number): Promise<MagicFormulaRanking | null> {
  const slug = `magic-formula-scan:${year}`;
  const [row] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
  let scan = row?.state as Scan | undefined;
  if (scan?.version !== 2) scan = undefined;
  if (!scan) {
    const stocks = await scrapeSp500();
    if (stocks.length < 450 || new Set(stocks.map((s) => s.symbol)).size !== stocks.length) throw new Error("S&P 500 roster verification failed");
    scan = { version: 2, year, scheduledDate: `${year}-10-27`, startedAt: new Date().toISOString(), stocks, candidates: [] };
  }
  const today = marketDate();
  // Only scan the present annual window; never label today's financials as a missed earlier year's snapshot.
  if (year !== rankingYear(today)) return null;
  const seen = new Set(scan.candidates.map((c) => c.ticker));
  const remaining = scan.stocks.filter((s) => !seen.has(s.symbol.replace(/\./g, "-")));
  for (let i = 0; i < remaining.length; i += 3) {
    scan.candidates.push(...await Promise.all(remaining.slice(i, i + 3).map((stock) => fetchMagicCandidate(stock, today))));
    progress = `Scanning S&P 500: ${scan.candidates.length} / ${scan.stocks.length} companies processed.`;
    await db.insert(modelPortfoliosTable).values({ slug, state: scan })
      .onConflictDoUpdate({ target: modelPortfoliosTable.slug, set: { state: scan, updatedAt: new Date() } });
  }
  const candidates = rankMagicCandidates(scan.candidates);
  if (candidates.filter((c) => c.rank != null).length < 20) {
    // Permit a later refresh to retry failed provider requests, never freeze a bogus short list.
    scan.candidates = scan.candidates.filter((c) => !c.reason?.startsWith("Provider request failed"));
    await db.update(modelPortfoliosTable).set({ state: scan }).where(eq(modelPortfoliosTable.slug, slug));
    throw new Error("Fewer than twenty verified eligible stocks; ranking is not frozen");
  }
  return { year, scheduledDate: scan.scheduledDate, capturedAt: new Date().toISOString(), availableOn: marketDate(), universeCount: scan.stocks.length, candidates };
}
export function refreshMagicFormula(): Promise<void> {
  if (running) return running;
  running = (async () => {
    await ensure();
    let state = await readState();
    const needsOpeningCorrection = state.positions.length > 0 && !state.inceptionPriceBasis;
    if (!needsOpeningCorrection && state.positions.length > 0 && state.refreshedAt && Date.now() - Date.parse(state.refreshedAt) < REFRESH_MS) return;
    const today = marketDate(), year = rankingYear(today);
    if (today < MAGIC_INCEPTION) return;
    if (!state.rankings.some((r) => r.year === year)) {
      progress = `Preparing annual ${year} S&P 500 ranking.`;
      const ranking = await annualRanking(year);
      if (ranking) await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SLUG}))`);
        const [row] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
        const latest = row.state as MagicState;
        if (!latest.rankings.some((r) => r.year === year)) {
          latest.rankings.push(ranking);
          await tx.update(modelPortfoliosTable).set({ state: latest, updatedAt: new Date() }).where(eq(modelPortfoliosTable.slug, SLUG));
        }
      });
    }
    state = await readState();
    const tickers = [...new Set(["SPY", ...state.positions.map((p) => p.ticker),
      ...state.rankings.flatMap((r) => r.candidates.filter((c) => c.rank != null && c.rank <= 20).map((c) => c.ticker))])];
    const market = await fetchMomentumMarket(state.processedThrough ?? MAGIC_INCEPTION, new Date(), tickers.map((ticker) => ({ ticker })));
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SLUG}))`);
      const [row] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
      const latest = row.state as MagicState;
      if (latest.refreshedAt && latest.refreshedAt >= market.observedAt) return;
      const next = advanceMagic(latest, market);
      await tx.update(modelPortfoliosTable).set({ state: next, updatedAt: new Date() }).where(eq(modelPortfoliosTable.slug, SLUG));
    });
    progress = `Annual ${year} ranking frozen; daily portfolio updates enabled.`;
  })().catch((error) => {
    progress = "Refresh could not finish. Stored trades are preserved; the next automatic refresh will retry.";
    logger.error({ err: error }, "Magic Formula refresh failed");
  }).finally(() => { running = null; });
  return running;
}
export function startMagicFormulaScheduler() {
  void refreshMagicFormula();
  setInterval(() => void refreshMagicFormula(), REFRESH_MS).unref();
}
export async function getMagicFormulaPortfolio(): Promise<MagicFormulaPortfolio> {
  await ensure();
  void refreshMagicFormula();
  const state = await readState(), last = state.performance.at(-1);
  const priceStale = !last || Date.parse(completedThrough()) - Date.parse(last.date) > 4 * 864e5;
  const stale = !state.refreshedAt || Date.now() - Date.parse(state.refreshedAt) > REFRESH_MS * 3 || !!state.message || priceStale;
  const latestRanking = state.rankings.at(-1);
  const rankingProgress = latestRanking && latestRanking.year === rankingYear(marketDate())
    ? `Annual ${latestRanking.year} ranking frozen; ${latestRanking.candidates.filter((c) => c.rank != null).length} eligible securities from ${latestRanking.universeCount} scanned.`
    : progress;
  const excluded = latestRanking?.candidates.filter((c) => c.reason).length ?? 0;
  return GetMagicFormulaPortfolioResponse.parse({
    slug: SLUG, title: "Magic Formula", currency: "USD", status: !last ? "pending" : stale ? "stale" : "active",
    message: [state.message, !last ? progress : stale ? "Showing the last verified portfolio; market-data refresh is delayed or incomplete." : null,
      latestRanking ? `${latestRanking.universeCount} index securities scanned; ${excluded} excluded. The eligible subset and all exclusion reasons are shown in the annual ranking.` : null].filter(Boolean).join(" ") || null,
    inceptionDate: MAGIC_INCEPTION, initialCapital: MAGIC_CAPITAL, currentValue: last?.value ?? null,
    cash: state.cash, reservedCash: state.reservedCash, dividendCash: state.dividendCash,
    gain: last ? last.value - MAGIC_CAPITAL : null, returnPercent: last?.returnPercent ?? null,
    valuedAt: last?.date ?? null, refreshedAt: state.refreshedAt, rankingProgress,
    rankings: state.rankings, cohorts: state.cohorts,
    holdings: state.positions.map((p) => {
      // Actions may have changed quantities on an omitted valuation day.
      // Never combine those new quantities with an older pre-action quote.
      const currentPrice = last?.date === state.processedThrough ? state.prices[p.ticker] ?? null : null;
      const currentValue = currentPrice == null ? null : p.shares * currentPrice;
      return { ...p, targetWeight: 5, currentPrice, priceDate: last?.date ?? null, currentValue,
        weight: currentValue != null && last ? currentValue / last.value * 100 : null,
        gain: currentValue == null ? null : currentValue - p.costBasis,
        gainPercent: currentValue == null ? null : (currentValue / p.costBasis - 1) * 100, stale };
    }),
    performance: state.performance, allocations: state.allocations, ledger: state.ledger, assumptions: MAGIC_ASSUMPTIONS,
  });
}
