import YahooFinance from "yahoo-finance2";

export const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type FxQuote = { regularMarketPrice?: number | null };
export type FxFetcher = (pair: string) => Promise<FxQuote>;
export type Clock = () => number;

const yahooFinance = new YahooFinance();
const defaultFetcher: FxFetcher = async (pair) =>
  yahooFinance.quote(pair) as unknown as FxQuote;

type CacheEntry = { rate: number; fetchedAt: number };
const rateCache = new Map<string, CacheEntry>();

/** Prefer Yahoo's explicit financial reporting currency; USD is only a fallback. */
export function resolveFinancialCurrency(
  financialData: { financialCurrency?: string | null } | null | undefined,
  fallbackCurrency = "USD",
): string | null {
  const explicit = financialData?.financialCurrency;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().toUpperCase();
  return fallbackCurrency?.trim() ? fallbackCurrency.trim().toUpperCase() : null;
}

/** Pure conversion helper. Returns null when the rate is unavailable/invalid. */
export function convertToUsd(value: number | null | undefined, rate: number | null | undefined): number | null {
  if (value == null || rate == null || !Number.isFinite(value) || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  return value * rate;
}

/** Statement totals that are reported in the issuer's financial currency.
 * Per-share values, shares, and ratios are deliberately excluded. */
export const MONETARY_AGGREGATE_KEYS = new Set([
  "totalRevenue", "revenue", "grossProfit", "operatingIncome", "operatingIncomeAsReported",
  "netIncome", "netIncomeCommonStockholders", "taxProvision", "pretaxIncome",
  "interestExpense", "interestExpenseNonOperating", "totalDebt", "longTermDebt",
  "currentDebt", "cashAndCashEquivalents", "cashCashEquivalentsAndShortTermInvestments",
  "minorityInterest", "minorityInterestAndOther", "commonStockEquity", "stockholdersEquity",
  "grossPPE", "grossPropertyPlantEquipment", "netPPE", "investmentProperties",
  "investmentProperty", "investmentsAndAdvances", "totalAssets", "totalLiabilitiesNetMinorityInterest",
  "totalLiabilities", "capitalExpenditure", "capitalExpenditures", "depreciation",
  "depreciationAndAmortization", "depreciationAmortizationDepletion", "deferredTax",
  "deferredIncomeTax", "deferredTaxAssetsLiabilities",
  "workingCapital", "changeInWorkingCapital", "operatingCashFlow", "freeCashFlow",
  "investingCashFlow", "financingCashFlow", "netDebt", "enterpriseValue",
]);

/** Normalize only explicit aggregate monetary inputs, leaving all other fields intact. */
export function normalizeFinancialAggregates<T extends Record<string, unknown>>(
  row: T,
  usdRate: number | null | undefined,
): T {
  const normalized = { ...row };
  for (const key of MONETARY_AGGREGATE_KEYS) {
    if (!(key in normalized)) continue;
    const value = normalized[key];
    if (value == null) continue;
    (normalized as Record<string, unknown>)[key] =
      typeof value === "number" ? convertToUsd(value, usdRate) : null;
  }
  return normalized;
}

/** Return the USD rate for a currency, retaining a last successful value on errors. */
export async function getUsdRate(
  currency: string | null | undefined,
  options: { fetcher?: FxFetcher; now?: Clock; ttlMs?: number } = {},
): Promise<number | null> {
  const ccy = currency?.trim().toUpperCase();
  if (!ccy) return null;
  if (ccy === "USD") return 1;
  const now = options.now ?? Date.now;
  const key = `${ccy}USD=X`;
  const cached = rateCache.get(ccy);
  const ttl = options.ttlMs ?? FX_CACHE_TTL_MS;
  if (cached && now() - cached.fetchedAt < ttl) return cached.rate;
  try {
    const quote = await (options.fetcher ?? defaultFetcher)(key);
    const rate = quote?.regularMarketPrice;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) throw new Error("invalid FX quote");
    rateCache.set(ccy, { rate, fetchedAt: now() });
    return rate;
  } catch {
    return cached?.rate ?? null;
  }
}

/** Test-only cache reset; no network calls are made by this helper. */
export function clearFxCache(): void {
  rateCache.clear();
}