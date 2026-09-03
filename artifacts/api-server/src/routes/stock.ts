import { Router, type IRouter } from "express";
import YahooFinance from "yahoo-finance2";
import { execFile, execSync } from "node:child_process";
import {
  GetStockQuoteParams,
  GetStockChartParams,
  GetStockChartQueryParams,
  GetStockChartResponse,
  GetStockNewsParams,
  GetStockProfileParams,
  GetBoardLeadershipParams,
  GetBoardLeadershipResponse,
  GetStockFinancialsParams,
  GetStockFinancialsQueryParams,
  GetBuybackHistoryParams,
  GetBuybackHistoryResponse,
  GetSecFilingsParams,
  GetEarningsHistoryParams,
  GetInsiderTransactionsParams,
  GetStockFundamentalsParams,
  GetStockAnalysisParams,
  GetStockModelsParams,
  GetStockIndicatorsParams,
  GetStockScreenerRatingsParams,
} from "@workspace/api-zod";
import { getBuybackHistory } from "../lib/buyback-history";
import { getBoardLeadership } from "../lib/board-leadership";

const router: IRouter = Router();
const yahooFinance = new YahooFinance();

// Simple in-process CIK cache (symbol → CIK string) to avoid repeat EDGAR lookups
const cikCache = new Map<string, string>();
let tickerCikMapPromise: Promise<Map<string, string>> | null = null;
const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_USER_AGENT = "Stock Research Platform research@example.com";
const CURL_BIN = (() => {
  try {
    return execSync("which curl", { encoding: "utf8" }).trim();
  } catch {
    return "curl";
  }
})();

function fetchSecTickerMapWithCurl(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      CURL_BIN,
      [
        "-sS",
        "-f",
        "-L",
        "--max-time",
        "30",
        "-A",
        SEC_USER_AGENT,
        "-H",
        "Accept: application/json",
        SEC_TICKER_MAP_URL,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`SEC ticker map curl fallback failed: ${error.message} — ${stderr}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function getTickerCikMap(): Promise<Map<string, string>> {
  if (!tickerCikMapPromise) {
    tickerCikMapPromise = (async () => {
      let raw: string;
      try {
        const response = await fetch(SEC_TICKER_MAP_URL, {
          headers: {
            "User-Agent": SEC_USER_AGENT,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          throw new Error(`SEC ticker map returned ${response.status}`);
        }
        raw = await response.text();
      } catch {
        raw = await fetchSecTickerMapWithCurl();
      }
      const rows = JSON.parse(raw) as Record<
        string,
        { cik_str: number; ticker: string }
      >;
      return new Map(
        Object.values(rows).map((row) => [
          row.ticker.toUpperCase().replace(".", "-"),
          String(row.cik_str),
        ]),
      );
    })();
  }
  return tickerCikMapPromise;
}

async function lookupCik(symbol: string): Promise<string | null> {
  if (cikCache.has(symbol)) return cikCache.get(symbol)!;
  try {
    const exactCik = (await getTickerCikMap()).get(
      symbol.toUpperCase().replace(".", "-"),
    );
    if (exactCik) {
      cikCache.set(symbol, exactCik);
      return exactCik;
    }
  } catch {
    tickerCikMapPromise = null;
  }
  // Never guess from free-text EDGAR search results: returning no match is
  // safer than attaching another registrant's filings to this ticker.
  return null;
}

function getSymbol(param: string | string[]): string {
  return (Array.isArray(param) ? param[0] : param).toUpperCase();
}

type StockSplitSourceEvent = {
  date: Date;
  numerator?: number;
  denominator?: number;
};

function formatSplitRatioPart(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");
}

function mapStockSplitEvents(splits: StockSplitSourceEvent[]) {
  return splits
    .map((split) => {
      const numerator = split.numerator ?? 1;
      const denominator = split.denominator ?? 1;
      return {
        date: split.date.toISOString().slice(0, 10),
        numerator,
        denominator,
        label: `${formatSplitRatioPart(numerator)}:${formatSplitRatioPart(denominator)} split`,
      };
    })
    .filter((split) => split.numerator > 0 && split.denominator > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function epsSplitAdjustmentForDate(
  date: string,
  splits: StockSplitSourceEvent[],
): number {
  const pointDate = Date.parse(date);
  if (!Number.isFinite(pointDate)) return 1;

  return splits.reduce((factor, split) => {
    if (split.date.getTime() <= pointDate) return factor;
    const numerator = split.numerator ?? 1;
    const denominator = split.denominator ?? 1;
    return numerator > 0 && denominator > 0
      ? factor * (denominator / numerator)
      : factor;
  }, 1);
}

function calculateRSI14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  const slice = closes.slice(-15);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0) gains += diff;
    else losses += -diff;
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

router.get("/stock/:symbol/quote", async (req, res): Promise<void> => {
  const params = GetStockQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);

  try {
    const quote = await yahooFinance.quoteSummary(symbol, {
      modules: ["price", "summaryDetail", "financialData", "defaultKeyStatistics"],
    });

    const price = quote.price;
    const summary = quote.summaryDetail;
    const financial = quote.financialData;
    const keyStats = quote.defaultKeyStatistics;

    if (!price) {
      res.status(404).json({ error: "not_found", message: `Symbol ${symbol} not found` });
      return;
    }

    const currentPrice = price.regularMarketPrice ?? null;
    const previousClose = price.regularMarketPreviousClose ?? null;
    const change = currentPrice != null && previousClose != null
      ? currentPrice - previousClose
      : null;
    const changePercent = price.regularMarketChangePercent ?? null;

    const netDebt = (() => {
      const totalDebt = financial?.totalDebt ?? null;
      const totalCash = financial?.totalCash ?? null;
      if (totalDebt != null && totalCash != null) {
        return totalDebt - totalCash;
      }
      return null;
    })();

    res.json({
      symbol,
      shortName: price.shortName ?? symbol,
      longName: price.longName ?? price.shortName ?? symbol,
      currentPrice,
      previousClose,
      open: price.regularMarketOpen ?? null,
      dayHigh: price.regularMarketDayHigh ?? null,
      dayLow: price.regularMarketDayLow ?? null,
      fiftyTwoWeekHigh: summary?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: summary?.fiftyTwoWeekLow ?? null,
      volume: price.regularMarketVolume ?? null,
      averageVolume: summary?.averageVolume ?? null,
      marketCap: price.marketCap ?? null,
      enterpriseValue: keyStats?.enterpriseValue ?? null,
      trailingPE: summary?.trailingPE ?? null,
      forwardPE: summary?.forwardPE ?? null,
      dividendYield: summary?.dividendYield ?? null,
      beta: summary?.beta ?? null,
      priceToBook: keyStats?.priceToBook ?? null,
      netDebt,
      totalDebt: financial?.totalDebt ?? null,
      totalCash: financial?.totalCash ?? null,
      revenueGrowth: financial?.revenueGrowth ?? null,
      earningsGrowth: financial?.earningsGrowth ?? null,
      profitMargins: financial?.profitMargins ?? null,
      changePercent,
      change,
      currency: price.currency ?? null,
      exchange: price.exchangeName ?? null,
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch stock quote");
    if (err instanceof Error && err.message.includes("No fundamentals data found")) {
      res.status(404).json({ error: "not_found", message: `Symbol ${symbol} not found` });
    } else {
      res.status(500).json({ error: "server_error", message: "Failed to fetch stock data" });
    }
  }
});

router.get("/stock/:symbol/chart", async (req, res): Promise<void> => {
  const params = GetStockChartParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const query = GetStockChartQueryParams.safeParse(req.query);
  const range = query.success ? (query.data.range ?? "1y") : "1y";
  const symbol = getSymbol(params.data.symbol);

  const intervalMap: Record<string, string> = {
    "1d": "5m",
    "5d": "15m",
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1d",
    "1y": "1wk",
    "2y": "1wk",
    "5y": "1mo",
    "max": "1mo",
  };

  const interval = intervalMap[range] ?? "1d";

  try {
    const result = await yahooFinance.chart(symbol, {
      period1: getRangeStart(range),
      interval: interval as "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo",
      events: "splits",
    });

    // For intraday ranges (1d/5d) preserve the full timestamp so the frontend
    // can display accurate times. For daily+ ranges return date-only strings.
    const isIntraday = interval === "5m" || interval === "15m";
    const data = (result.quotes ?? []).map((q) => ({
      date: q.date instanceof Date
        ? (isIntraday ? q.date.toISOString() : q.date.toISOString().split("T")[0])
        : String(q.date),
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      close: q.close ?? null,
      volume: q.volume ?? null,
    }));

    const stockSplits = mapStockSplitEvents(result.events?.splits ?? []);
    res.json(GetStockChartResponse.parse({ symbol, range, data, stockSplits }));
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch chart data");
    res.status(500).json({ error: "server_error", message: "Failed to fetch chart data" });
  }
});

function getRangeStart(range: string): Date {
  const now = new Date();
  switch (range) {
    case "1d": return new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    case "5d": return new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    case "1mo": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "3mo": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "6mo": return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    case "1y": return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "2y": return new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
    case "5y": return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
    case "max": return new Date("1970-01-01");
    default: return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
}

router.get("/stock/:symbol/news", async (req, res): Promise<void> => {
  const params = GetStockNewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);

  try {
    const result = await yahooFinance.search(symbol, {
      newsCount: 20,
      quotesCount: 0,
    });

    const news = (result.news ?? []).map((item, idx) => ({
      id: item.uuid ?? String(idx),
      title: item.title ?? "Untitled",
      publisher: item.publisher ?? "Unknown",
      link: item.link ?? "#",
      publishedAt: item.providerPublishTime instanceof Date
        ? item.providerPublishTime.toISOString()
        : new Date(0).toISOString(),
      thumbnail: item.thumbnail?.resolutions?.[0]?.url ?? null,
      summary: null,
    }));

    res.json({ symbol, news });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch news");
    res.status(500).json({ error: "server_error", message: "Failed to fetch news" });
  }
});

router.get("/stock/:symbol/profile", async (req, res): Promise<void> => {
  const params = GetStockProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);

  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ["summaryProfile", "price"],
    });

    const profile = result.summaryProfile;
    const price = result.price;

    if (!price) {
      res.status(404).json({ error: "not_found", message: `Symbol ${symbol} not found` });
      return;
    }

    res.json({
      symbol,
      longName: price.longName ?? price.shortName ?? symbol,
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      country: profile?.country ?? null,
      city: profile?.city ?? null,
      state: profile?.state ?? null,
      address: profile?.address1 ?? null,
      phone: profile?.phone ?? null,
      website: profile?.website ?? null,
      employees: profile?.fullTimeEmployees ?? null,
      description: profile?.longBusinessSummary ?? null,
      logoUrl: profile?.website ? `https://logo.clearbit.com/${profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : null,
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch profile");
    res.status(500).json({ error: "server_error", message: "Failed to fetch profile" });
  }
});

router.get("/stock/:symbol/board-leadership", async (req, res): Promise<void> => {
  const params = GetBoardLeadershipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);
  try {
    const cik = await lookupCik(symbol);
    const data = await getBoardLeadership(symbol, cik);
    res.json(GetBoardLeadershipResponse.parse(data));
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to compile board and leadership data");
    if (err instanceof Error && err.message.includes("not found")) {
      res.status(404).json({ error: "not_found", message: `Symbol ${symbol} not found` });
      return;
    }
    res.status(500).json({
      error: "server_error",
      message: "Failed to compile board and leadership data",
    });
  }
});

// Maps fundamentalsTimeSeries "financials" module keys → display labels
const incomeStatementKeyMap: Record<string, string> = {
  totalRevenue: "Total Revenue",
  reconciledCostOfRevenue: "Cost of Revenue",
  grossProfit: "Gross Profit",
  operatingIncome: "Operating Income",
  EBITDA: "EBITDA",
  EBIT: "EBIT",
  pretaxIncome: "Pre-tax Income",
  taxProvision: "Income Tax",
  netIncome: "Net Income",
  netIncomeCommonStockholders: "Net Income (Common)",
  researchAndDevelopment: "Research & Development",
  totalOperatingIncomeAsReported: "Total Operating Income",
  normalizedEBITDA: "Normalized EBITDA",
};

// Maps fundamentalsTimeSeries "balance-sheet" module keys → display labels
const balanceSheetKeyMap: Record<string, string> = {
  totalAssets: "Total Assets",
  totalLiabilitiesNetMinorityInterest: "Total Liabilities",
  stockholdersEquity: "Stockholder Equity",
  commonStockEquity: "Common Equity",
  cashAndCashEquivalents: "Cash & Equivalents",
  cashCashEquivalentsAndShortTermInvestments: "Cash & ST Investments",
  inventory: "Inventory",
  accountsReceivable: "Accounts Receivable",
  currentAssets: "Current Assets",
  currentLiabilities: "Current Liabilities",
  longTermDebt: "Long-term Debt",
  currentDebt: "Current Debt",
  totalDebt: "Total Debt",
  netDebt: "Net Debt",
  netPPE: "PP&E (Net)",
  retainedEarnings: "Retained Earnings",
  workingCapital: "Working Capital",
};

// Maps fundamentalsTimeSeries "cash-flow" module keys → display labels
const cashFlowKeyMap: Record<string, string> = {
  operatingCashFlow: "Operating Cash Flow",
  capitalExpenditure: "Capital Expenditures",
  freeCashFlow: "Free Cash Flow",
  investingCashFlow: "Investing Cash Flow",
  financingCashFlow: "Financing Cash Flow",
  depreciationAndAmortization: "Depreciation & Amortization",
  stockBasedCompensation: "Stock-based Compensation",
  repurchaseOfCapitalStock: "Stock Repurchases",
  commonStockDividendPaid: "Dividends Paid",
  netIssuancePaymentsOfDebt: "Net Debt Issuance",
  changesInCash: "Change in Cash",
};

function mapKeys(raw: Record<string, unknown>, keyMap: Record<string, string>): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [rawKey, label] of Object.entries(keyMap)) {
    const val = raw[rawKey];
    result[label] = typeof val === "number" ? val : null;
  }
  return result;
}

router.get("/stock/:symbol/financials", async (req, res): Promise<void> => {
  const params = GetStockFinancialsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const query = GetStockFinancialsQueryParams.safeParse(req.query);
  const period = query.success ? (query.data.period ?? "quarterly") : "quarterly";
  const symbol = getSymbol(params.data.symbol);
  const tsType = period === "annual" ? "annual" : "quarterly";
  const period1 = "2019-01-01";

  try {
    // Use fundamentalsTimeSeries — the quoteSummary statement modules have been
    // mostly empty since late 2024 per yahoo-finance2 changelog.
    const [incomeRaw, balanceRaw, cashRaw] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(symbol, { type: tsType, module: "financials", period1 }),
      yahooFinance.fundamentalsTimeSeries(symbol, { type: tsType, module: "balance-sheet", period1 }),
      yahooFinance.fundamentalsTimeSeries(symbol, { type: tsType, module: "cash-flow", period1 }),
    ]);

    // Sort descending (most recent first) and limit to 8 periods
    const toDate = (item: { date?: Date | string }) =>
      item.date instanceof Date ? item.date.toISOString().split("T")[0] : String(item.date ?? "");

    const incomeStatement = [...incomeRaw]
      .sort((a, b) => toDate(b).localeCompare(toDate(a)))
      .slice(0, 8)
      .map((item) => ({
        date: toDate(item),
        data: mapKeys(item as unknown as Record<string, unknown>, incomeStatementKeyMap),
      }));

    const balanceSheet = [...balanceRaw]
      .sort((a, b) => toDate(b).localeCompare(toDate(a)))
      .slice(0, 8)
      .map((item) => ({
        date: toDate(item),
        data: mapKeys(item as unknown as Record<string, unknown>, balanceSheetKeyMap),
      }));

    const cashFlow = [...cashRaw]
      .sort((a, b) => toDate(b).localeCompare(toDate(a)))
      .slice(0, 8)
      .map((item) => ({
        date: toDate(item),
        data: mapKeys(item as unknown as Record<string, unknown>, cashFlowKeyMap),
      }));

    const financialCurrency =
      incomeRaw.length > 0
        ? (
            (incomeRaw[0] as unknown as Record<string, unknown>)
              ?.currencyCode as string | undefined
          ) ?? null
        : null;

    res.json({ symbol, period, financialCurrency, incomeStatement, balanceSheet, cashFlow });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch financials");
    res.status(500).json({ error: "server_error", message: "Failed to fetch financials" });
  }
});

router.get("/stock/:symbol/buyback-history", async (req, res): Promise<void> => {
  const params = GetBuybackHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);
  try {
    const cik = await lookupCik(symbol);
    if (!cik) {
      res.status(404).json({
        error: "not_found",
        message: `Quarterly SEC filing data is not available for ${symbol}`,
      });
      return;
    }
    const history = await getBuybackHistory(symbol, cik);
    res.json(GetBuybackHistoryResponse.parse(history));
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch buyback history");
    res.status(500).json({
      error: "server_error",
      message: "Failed to fetch buyback history",
    });
  }
});

router.get("/stock/:symbol/earnings-history", async (req, res): Promise<void> => {
  const params = GetEarningsHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);
  const PE_MULTIPLE = 15;

  try {
    // 1. Fetch recent quarterly EPS from yahoo-finance earningsHistory (last ~4 quarters)
    const [result, splitChart] = await Promise.all([
      yahooFinance.quoteSummary(symbol, {
        modules: ["earningsHistory", "price"],
      }),
      yahooFinance.chart(symbol, {
        period1: new Date("1970-01-01"),
        interval: "1mo",
        events: "splits",
      }),
    ]);
    const splitEvents = splitChart.events?.splits ?? [];

    const earningsHistoryRaw = result.earningsHistory?.history ?? [];
    // Note: fields are epsActual/epsEstimate on earningsHistory (not actual/estimate)
    const recentEps = earningsHistoryRaw
      .map((item) => ({
        date: item.quarter instanceof Date ? item.quarter.toISOString().split("T")[0] : null,
        epsActual: typeof item.epsActual === "number" ? item.epsActual : null,
        epsEstimate: typeof item.epsEstimate === "number" ? item.epsEstimate : null,
      }))
      .filter((e): e is { date: string; epsActual: number; epsEstimate: number | null } =>
        e.date !== null && e.epsActual !== null
      );

    // 2. Try SEC EDGAR for extended historical quarterly EPS (diluted EPS)
    // Run Yahoo fetch and CIK lookup in parallel for speed
    let secEps: { date: string; epsActual: number; epsEstimate: null }[] = [];
    try {
      const cik = await lookupCik(symbol);
      if (cik) {
        const factsUrl = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik.padStart(10, "0")}/us-gaap/EarningsPerShareDiluted.json`;
        const factsResp = await fetch(factsUrl, { signal: AbortSignal.timeout(8000) });
        if (factsResp.ok) {
          const factsData = await factsResp.json() as {
            units?: {
              "USD/shares"?: Array<{
                end: string;
                val: number;
                form: string;
                frame?: string;
                accn: string;
               filed?: string;
              }>;
            };
          };
          const sharesData = factsData?.units?.["USD/shares"] ?? [];
          // Only take entries with a quarterly frame tag (CY2024Q1, CY2023Q3, etc.)
          const quarterly = sharesData
            .filter((e) => (e.form === "10-Q" || e.form === "10-K") && e.frame && /^CY\d{4}Q\d$/.test(e.frame))
            .map((e) => {
              // SEC comparative facts filed after a split are generally already
              // restated. Using the filing date prevents adjusting those twice.
              const adjustment = epsSplitAdjustmentForDate(
                e.filed ?? e.end,
                splitEvents,
              );
              return {
                date: e.end,
                epsActual: parseFloat((e.val * adjustment).toFixed(6)),
                epsEstimate: null as null,
              };
            });

          const qMap = new Map<string, { date: string; epsActual: number; epsEstimate: null }>();
          for (const q of quarterly) {
            qMap.set(q.date, q);
          }
          secEps = Array.from(qMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        }
      }
    } catch {
      // SEC EDGAR lookup is best-effort; proceed with Yahoo data only
    }

    // 3. Merge: SEC EDGAR provides the base; Yahoo earningsHistory overrides recent quarters
    const dateMap = new Map<string, { date: string; epsActual: number; epsEstimate: number | null }>();
    for (const e of [...secEps, ...recentEps]) {
      dateMap.set(e.date, e);
    }

    const sorted = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // 4. Compute TTM EPS (trailing twelve months = rolling sum of last 4 quarters)
    const history = sorted.map((item, idx) => {
      const windowItems = sorted.slice(Math.max(0, idx - 3), idx + 1);
      const ttmEps = windowItems.length === 4
        ? parseFloat(windowItems.reduce((sum, q) => sum + q.epsActual, 0).toFixed(4))
        : windowItems.length > 0
          // Partial TTM: annualize what we have (useful for early history)
          ? parseFloat((windowItems.reduce((sum, q) => sum + q.epsActual, 0) * (4 / windowItems.length)).toFixed(4))
          : null;
      return {
        date: item.date,
        epsActual: item.epsActual,
        epsEstimate: item.epsEstimate,
        ttmEps,
      };
    });

    res.json({ symbol, peMultiple: PE_MULTIPLE, history });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch earnings history");
    res.status(500).json({ error: "server_error", message: "Failed to fetch earnings history" });
  }
});

// ─── Helpers for Form 4 XML parsing ────────────────────────────────────────

function xmlTagValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>\\s*([^<]*)\\s*<\\/${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

function xmlBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) blocks.push(m[0]);
  return blocks;
}

function isForm4ForIssuer(xml: string, issuerCik: string): boolean {
  const issuerBlock = xml.match(/<issuer>[\s\S]*?<\/issuer>/i)?.[0] ?? "";
  const documentIssuerCik = xmlTagValue(issuerBlock, "issuerCik");
  if (!documentIssuerCik) return false;

  return documentIssuerCik.replace(/^0+/, "") === issuerCik.replace(/^0+/, "");
}

const TX_CODE_MAP: Record<string, { type: string; signal: string }> = {
  P: { type: "Open Market Purchase", signal: "high" },
  S: { type: "Open Market Sale", signal: "moderate" },
  M: { type: "Option Exercise", signal: "low" },
  A: { type: "Grant / Award", signal: "none" },
  G: { type: "Gift", signal: "none" },
  F: { type: "Tax Withholding", signal: "none" },
  D: { type: "Sale Back to Issuer", signal: "low" },
  C: { type: "Conversion", signal: "none" },
  E: { type: "Expiration Short", signal: "none" },
  H: { type: "Expiration Long", signal: "none" },
  I: { type: "Discretionary Transaction", signal: "low" },
  J: { type: "Other Acquisition/Disposition", signal: "none" },
  K: { type: "Equity Swap", signal: "none" },
  L: { type: "Small Acquisition", signal: "none" },
  O: { type: "Option Exercise (OTM)", signal: "low" },
  U: { type: "Tender of Shares", signal: "none" },
  W: { type: "Will/Inheritance", signal: "none" },
  X: { type: "Option Exercise (ITM)", signal: "low" },
  Z: { type: "Deposit/Withdrawal", signal: "none" },
};

const FORM4_SUCCESS_TTL_MS = 60 * 60 * 1000;
const FORM4_FAILURE_TTL_MS = 2 * 60 * 1000;
const SEC_REQUEST_SPACING_MS = 125;
const form4Cache = new Map<
  string,
  { value: string | null; expiresAt: number }
>();
const form4Inflight = new Map<string, Promise<string | null>>();
let secRequestQueue: Promise<void> = Promise.resolve();
let lastSecRequestAt = 0;

function scheduleSecRequest<T>(request: () => Promise<T>): Promise<T> {
  const run = secRequestQueue.then(async () => {
    const waitMs = Math.max(
      0,
      SEC_REQUEST_SPACING_MS - (Date.now() - lastSecRequestAt),
    );
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    try {
      return await request();
    } finally {
      lastSecRequestAt = Date.now();
    }
  });
  secRequestQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function fetchSec(url: string): Promise<Response> {
  return scheduleSecRequest(() =>
    fetch(url, {
      headers: { "User-Agent": "research-tool admin@example.com" },
      signal: AbortSignal.timeout(8000),
    }),
  );
}

async function fetchForm4(
  cik: string,
  accession: string,
  primaryDocument?: string,
): Promise<string | null> {
  const cacheKey = `${cik}:${accession}`;
  const cached = form4Cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) form4Cache.delete(cacheKey);
  const inflight = form4Inflight.get(cacheKey);
  if (inflight) return inflight;

  const pending = (async () => {
    const accFormatted = accession.replace(/-/g, "");
    const documentPath = encodeURIComponent(
      primaryDocument?.split("/").at(-1) || "form4.xml",
    );
    const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accFormatted}/${documentPath}`;

    try {
      let resp = await fetchSec(url);
      if (resp.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        resp = await fetchSec(url);
      }
      if (!resp.ok) {
        form4Cache.set(cacheKey, {
          value: null,
          expiresAt: Date.now() + FORM4_FAILURE_TTL_MS,
        });
        return null;
      }
      const text = await resp.text();
      const value = text.includes("<ownershipDocument>") ? text : null;
      form4Cache.set(cacheKey, {
        value,
        expiresAt:
          Date.now() +
          (value ? FORM4_SUCCESS_TTL_MS : FORM4_FAILURE_TTL_MS),
      });
      return value;
    } catch {
      form4Cache.set(cacheKey, {
        value: null,
        expiresAt: Date.now() + FORM4_FAILURE_TTL_MS,
      });
      return null;
    } finally {
      form4Inflight.delete(cacheKey);
    }
  })();
  form4Inflight.set(cacheKey, pending);
  return pending;
}

function parseFootnotes(xml: string): Map<string, string> {
  const footnotes = new Map<string, string>();
  const regex = /<footnote\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/footnote>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    footnotes.set(match[1], match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }
  return footnotes;
}

function transactionFootnoteText(
  block: string,
  footnotes: Map<string, string>,
): string {
  const ids = [...block.matchAll(/<footnoteId\b[^>]*\bid=["']([^"']+)["'][^>]*\/?>/gi)];
  return ids.map((match) => footnotes.get(match[1]) ?? "").filter(Boolean).join(" ");
}

function parseNumericTag(block: string, tag: string): number | null {
  const taggedBlock =
    block.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "i"))?.[0] ??
    block;
  const value = xmlTagValue(taggedBlock, "value") ?? xmlTagValue(taggedBlock, tag);
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseForm4Transaction(
  block: string,
  index: number,
  kind: "nd" | "d",
  owner: {
    insiderName: string;
    isDirector: boolean;
    isOfficer: boolean;
    isTenPercentOwner: boolean;
    officerTitle: string | null;
  },
  footnotes: Map<string, string>,
  accession: string,
  formUrl: string,
  documentPlan: boolean,
) {
  const dateBlock = block.match(/<transactionDate>[^]*?<\/transactionDate>/i)?.[0] ?? "";
  const date = xmlTagValue(dateBlock, "value") ?? "";
  const codeBlock = block.match(/<transactionCoding>[^]*?<\/transactionCoding>/i)?.[0] ?? "";
  const transactionCode = xmlTagValue(codeBlock, "transactionCode") || "?";
  const amountsBlock = block.match(/<transactionAmounts>[^]*?<\/transactionAmounts>/i)?.[0] ?? "";
  const shares = parseNumericTag(amountsBlock, "transactionShares");
  const pricePerShare = parseNumericTag(amountsBlock, "transactionPricePerShare");
  const acquiredDisposedBlock =
    amountsBlock.match(/<transactionAcquiredDisposedCode>[^]*?<\/transactionAcquiredDisposedCode>/i)?.[0] ?? "";
  const acquiredDisposedCode = xmlTagValue(acquiredDisposedBlock, "value");
  const postAmountsBlock =
    block.match(/<postTransactionAmounts>[^]*?<\/postTransactionAmounts>/i)?.[0] ?? "";
  const holdingSharesAfter = parseNumericTag(
    postAmountsBlock,
    "sharesOwnedFollowingTransaction",
  );
  const ownershipBlock = block.match(/<ownershipNature>[^]*?<\/ownershipNature>/i)?.[0] ?? "";
  const ownershipTypeBlock =
    ownershipBlock.match(/<directOrIndirectOwnership>[^]*?<\/directOrIndirectOwnership>/i)?.[0] ?? "";
  const ownership = xmlTagValue(ownershipTypeBlock, "value") ?? "D";
  const natureBlock =
    ownershipBlock.match(/<natureOfOwnership>[^]*?<\/natureOfOwnership>/i)?.[0] ?? "";
  const natureOfOwnership = xmlTagValue(natureBlock, "value") || null;
  const footnoteText = transactionFootnoteText(block, footnotes);
  const contextText = `${natureOfOwnership ?? ""} ${footnoteText}`;
  const is10b51Plan =
    xmlTagValue(codeBlock, "aff10b5One") === "true" ||
    xmlTagValue(codeBlock, "aff10b5One") === "1" ||
    documentPlan;
  const hasCompensationContext =
    /\b(?:equity award|stock award|restricted stock units?|rsus?|vested|vesting|compensation|tax withholding|withheld for taxes|sell[- ]to[- ]cover)\b/i.test(
      contextText,
    );
  const isCompensationRelated =
    ["A", "M", "F"].includes(transactionCode) ||
    (["S", "D"].includes(transactionCode) && hasCompensationContext);
  const compensationReason = isCompensationRelated
    ? transactionCode === "A"
      ? "Grant or award"
      : transactionCode === "M"
        ? "Option or derivative exercise"
        : transactionCode === "F"
          ? "Tax withholding"
          : transactionCode === "D"
            ? "Compensation-linked disposition to issuer"
            : "Compensation-linked sale"
    : null;
  const contextFlags = [
    ownership === "I" ? "Indirect / trust ownership" : null,
    is10b51Plan ? "10b5-1 automated plan" : null,
    isCompensationRelated ? compensationReason : null,
  ].filter((flag): flag is string => Boolean(flag));
  const priorHolding =
    holdingSharesAfter != null && shares != null
      ? acquiredDisposedCode === "A"
        ? holdingSharesAfter - shares
        : acquiredDisposedCode === "D"
          ? holdingSharesAfter + shares
          : null
      : null;
  const activityPctOfHoldings =
    shares != null && priorHolding != null && priorHolding > 0
      ? (Math.abs(shares) / priorHolding) * 100
      : null;
  const info = TX_CODE_MAP[transactionCode] ?? {
    type: `Code ${transactionCode}`,
    signal: "none",
  };

  return {
    id: `${accession}-${kind}-${index}`,
    date,
    insiderName: owner.insiderName,
    beneficialOwner: owner.insiderName,
    title: owner.officerTitle,
    isDirector: owner.isDirector,
    isOfficer: owner.isOfficer,
    isTenPercentOwner: owner.isTenPercentOwner,
    transactionCode,
    transactionType: info.type,
    signalLevel: info.signal,
    shares,
    pricePerShare,
    totalValue: shares != null && pricePerShare != null ? shares * pricePerShare : null,
    ownership,
    natureOfOwnership,
    ownershipRelationship:
      ownership === "I"
        ? natureOfOwnership || "Indirect / trust ownership"
        : "Direct ownership",
    holdingSharesAfter,
    activityPctOfHoldings,
    is10b51Plan,
    isCompensationRelated,
    compensationReason,
    contextFlags,
    accessionNumber: accession,
    formUrl,
  };
}

function parseForm4(xml: string, accession: string, cik: string) {
  const accFormatted = accession.replace(/-/g, "");
  const formUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accFormatted}/`;
  const insiderName = xmlTagValue(xml, "rptOwnerName") ?? "Unknown";
  const owner = {
    insiderName,
    isDirector: xmlTagValue(xml, "isDirector") === "true" || xmlTagValue(xml, "isDirector") === "1",
    isOfficer: xmlTagValue(xml, "isOfficer") === "true" || xmlTagValue(xml, "isOfficer") === "1",
    isTenPercentOwner:
      xmlTagValue(xml, "isTenPercentOwner") === "true" ||
      xmlTagValue(xml, "isTenPercentOwner") === "1",
    officerTitle: xmlTagValue(xml, "officerTitle") || null,
  };
  const footnotes = parseFootnotes(xml);
  const filingPlan =
    xmlTagValue(xml, "aff10b5One") === "true" || xmlTagValue(xml, "aff10b5One") === "1";
  const nonDerivativeBlocks = xmlBlocks(xml, "nonDerivativeTransaction");
  const derivativeBlocks = xmlBlocks(xml, "derivativeTransaction");
  const unambiguousFilingPlan =
    filingPlan && nonDerivativeBlocks.length + derivativeBlocks.length === 1;
  return [
    ...nonDerivativeBlocks.map((block, index) =>
      parseForm4Transaction(
        block,
        index,
        "nd",
        owner,
        footnotes,
        accession,
        formUrl,
        unambiguousFilingPlan,
      ),
    ),
    ...derivativeBlocks.map((block, index) =>
      parseForm4Transaction(
        block,
        index,
        "d",
        owner,
        footnotes,
        accession,
        formUrl,
        unambiguousFilingPlan,
      ),
    ),
  ];
}

// ─── Yahoo Finance → transaction code inference ──────────────────────────────

function inferTxCode(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("option exercise")) return "M";
  if (t.includes("automatic sale") || (t.includes("sale") && t.includes("automatic"))) return "S";
  if (t.includes("sale") || t.includes("sold")) return "S";
  if (t.includes("purchase") || t.includes("bought") || t.includes("buy")) return "P";
  if (t.includes("award") || t.includes("grant") || t.includes("rsu") || t.includes("restricted")) return "A";
  if (t.includes("gift")) return "G";
  if (t.includes("tax") || t.includes("withholding")) return "F";
  if (t.includes("conversion")) return "C";
  return "J";
}

function parseRelation(rel: string): { isDirector: boolean; isOfficer: boolean; isTenPercentOwner: boolean } {
  const r = rel.toLowerCase();
  return {
    isDirector: r.includes("director"),
    isOfficer: r.includes("officer"),
    isTenPercentOwner: r.includes("10%") || r.includes("10 percent"),
  };
}

router.get("/stock/:symbol/insider-transactions", async (req, res): Promise<void> => {
  const params = GetInsiderTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);
  const requestedPage = Number(req.query.page ?? 0);
  const page =
    Number.isInteger(requestedPage) && requestedPage >= 0
      ? Math.min(requestedPage, 40)
      : 0;

  const shiftMonths = (dateValue: string, months: number): string => {
    const date = new Date(`${dateValue}T00:00:00Z`);
    const targetDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDayOfTargetMonth = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(targetDay, lastDayOfTargetMonth));
    return date.toISOString().slice(0, 10);
  };

  try {
    // ── Step 1: Resolve the SEC registrant; Yahoo is a degraded fallback only ──
    const cik = await lookupCik(symbol);
    // SEC Form 4 XML is the authoritative source for ownership, holdings,
    // plan-affiliation, and compensation context. Yahoo is only a degraded
    // fallback for symbols without an SEC registrant mapping.
    const yfResult = cik
      ? null
      : await yahooFinance
          .quoteSummary(symbol, { modules: ["insiderTransactions"] })
          .catch(() => null);

    const yfTxs = yfResult?.insiderTransactions?.transactions ?? [];

    // ── Step 2: If Yahoo returns fallback data, transform it ─────────────────
    if (yfTxs.length > 0) {
      const edgarSearchBase = cik
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=40`
        : `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&forms=4`;

      const transactions = yfTxs
        .map((tx, idx) => {
          const txText = String(tx.transactionText ?? "");
          const relation = String(tx.filerRelation ?? "");
          const { isDirector, isOfficer, isTenPercentOwner } = parseRelation(relation);

          const transactionCode = inferTxCode(txText);
          const info = TX_CODE_MAP[transactionCode] ?? { type: txText || "Unknown", signal: "none" };

          // Parse price per share from transactionText ("at price X.XX per share")
          const priceMatch = txText.match(/at price\s+([\d,]+(?:\.\d+)?)/i);
          const pricePerShare = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null;

          const shares = typeof tx.shares === "number" ? tx.shares : null;
          const totalValue = typeof tx.value === "number" && tx.value !== 0 ? tx.value :
            (shares && pricePerShare ? shares * pricePerShare : null);

          // Date — Yahoo Finance returns a Date object
          let date = "";
          if (tx.startDate) {
            const d = new Date(tx.startDate as unknown as string | Date);
            if (!isNaN(d.getTime())) {
              date = d.toISOString().slice(0, 10);
            }
          }

          // Title: Yahoo Finance gives role in filerRelation; extract a clean title
          const title = relation || null;

          // EDGAR link for this filer (filerUrl is their CIK search page)
          const formUrl = (tx as unknown as { filerUrl?: string }).filerUrl || edgarSearchBase;

          return {
            id: `yf-${idx}-${date}`,
            date,
            insiderName: String(tx.filerName ?? "Unknown"),
             beneficialOwner: String(tx.filerName ?? "Unknown"),
            title,
            isDirector,
            isOfficer,
            isTenPercentOwner,
            transactionCode,
            transactionType: info.type,
            signalLevel: info.signal,
            shares,
            pricePerShare,
            totalValue,
            ownership: "D",
            natureOfOwnership: null,
             ownershipRelationship: "Direct ownership (Yahoo fallback)",
             holdingSharesAfter: null,
             activityPctOfHoldings: null,
            is10b51Plan: false,
             isCompensationRelated: ["A", "M", "F", "D"].includes(transactionCode),
             compensationReason: ["A", "M", "F", "D"].includes(transactionCode)
               ? (TX_CODE_MAP[transactionCode]?.type ?? "Compensation-related activity")
               : null,
             contextFlags: [],
            accessionNumber: "",
            formUrl,
          };
        })
        .filter(Boolean);

      res.json({
        symbol,
        cik,
        transactions,
        coverage: {
          source: "yahoo",
          availableFilings: 0,
          requestedFilings: 0,
          fetchedFilings: 0,
          failedFilings: 0,
          isPartial: true,
          truncated: false,
          page,
          windowStart: null,
          windowEnd: null,
          hasOlder: false,
          hasNewer: false,
        },
      });
      return;
    }

    // ── Step 3: Fetch and parse SEC EDGAR Form 4 XML ─────────────────────────
    if (!cik) {
      res.json({
        symbol,
        cik: null,
        transactions: [],
        coverage: {
          source: "yahoo",
          availableFilings: 0,
          requestedFilings: 0,
          fetchedFilings: 0,
          failedFilings: 0,
          isPartial: true,
          truncated: false,
          page,
          windowStart: null,
          windowEnd: null,
          hasOlder: false,
          hasNewer: false,
        },
      });
      return;
    }

    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
    const submResp = await fetchSec(submissionsUrl);
    if (!submResp.ok) {
      res.status(502).json({
        error: "upstream_error",
        message: "SEC submissions data is temporarily unavailable",
      });
      return;
    }

    const submData = await submResp.json() as {
      filings?: {
        recent?: {
          form?: string[];
          accessionNumber?: string[];
          filingDate?: string[];
           primaryDocument?: string[];
           fileNumber?: string[];
        };
      };
    };

    const recent = submData?.filings?.recent ?? {};
    const forms = recent.form ?? [];
    const accessions = recent.accessionNumber ?? [];
    const filingDates = recent.filingDate ?? [];
    const primaryDocuments = recent.primaryDocument ?? [];
    const fileNumbers = recent.fileNumber ?? [];

    const allForm4Entries: Array<{
      accession: string;
      date: string;
      primaryDocument?: string;
      form: "4" | "4/A";
    }> = [];
    for (let i = 0; i < forms.length; i++) {
      // A registrant's submissions feed can also contain Forms 4 it filed as a
      // reporting owner of another issuer. Those entries carry the other
      // issuer's Exchange Act file number; issuer-side insider filings do not.
      const isIssuerSideFiling = !fileNumbers[i]?.trim();
      if (
        (forms[i] === "4" || forms[i] === "4/A") &&
        accessions[i] &&
        isIssuerSideFiling
      ) {
        allForm4Entries.push({
          accession: accessions[i],
          date: filingDates[i] ?? "",
          primaryDocument: primaryDocuments[i] || undefined,
          form: forms[i] as "4" | "4/A",
        });
      }
    }
    const latestFilingDate =
      allForm4Entries[0]?.date || new Date().toISOString().slice(0, 10);
    const windowEnd = shiftMonths(latestFilingDate, -page * 3);
    const windowStart = shiftMonths(latestFilingDate, -(page + 1) * 3);
    const form4Entries = allForm4Entries.filter(
      (entry) => entry.date <= windowEnd && entry.date > windowStart,
    );
    const hasOlder = allForm4Entries.some((entry) => entry.date <= windowStart);
    const hasNewer =
      page > 0 && allForm4Entries.some((entry) => entry.date > windowEnd);

    const CONCURRENCY = 3;
    const parsedFilings: Array<{
      form: "4" | "4/A";
      key: string;
      transactions: ReturnType<typeof parseForm4>;
    }> = [];
    let fetchedFilings = 0;
    for (let i = 0; i < form4Entries.length; i += CONCURRENCY) {
      const batch = form4Entries.slice(i, i + CONCURRENCY);
      const xmls = await Promise.all(
        batch.map((entry) =>
          fetchForm4(cik, entry.accession, entry.primaryDocument),
        ),
      );
      for (let j = 0; j < batch.length; j++) {
        const xml = xmls[j];
        if (!xml) continue;
        // Defense in depth: never display a transaction unless the ownership
        // document identifies the stock being viewed as the issuer.
        if (!isForm4ForIssuer(xml, cik)) continue;
        fetchedFilings += 1;
        const ownerName = xmlTagValue(xml, "rptOwnerName") ?? "unknown";
        const period = xmlTagValue(xml, "periodOfReport") ?? batch[j].date;
        parsedFilings.push({
          form: batch[j].form,
          key: `${period}|${ownerName.toLowerCase()}`,
          transactions: parseForm4(xml, batch[j].accession, cik),
        });
      }
    }

    const amendedKeys = new Set(
      parsedFilings
        .filter((filing) => filing.form === "4/A")
        .map((filing) => filing.key),
    );
    const allTransactions = parsedFilings.flatMap((filing) =>
      filing.form === "4" && amendedKeys.has(filing.key)
        ? []
        : filing.transactions,
    );
    allTransactions.sort((a, b) =>
      b.date.localeCompare(a.date)
    );

    const failedFilings = form4Entries.length - fetchedFilings;
    res.json({
      symbol,
      cik,
      transactions: allTransactions,
      coverage: {
        source: "sec",
        availableFilings: allForm4Entries.length,
        requestedFilings: form4Entries.length,
        fetchedFilings,
        failedFilings,
        isPartial: failedFilings > 0,
        truncated: false,
        page,
        windowStart,
        windowEnd,
        hasOlder,
        hasNewer,
      },
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch insider transactions");
    res.status(500).json({ error: "server_error", message: "Failed to fetch insider transactions" });
  }
});

router.get("/stock/:symbol/screener-ratings", async (req, res): Promise<void> => {
  const params = GetStockScreenerRatingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);

  try {
    const [quoteData, chartResult] = await Promise.all([
      yahooFinance.quoteSummary(symbol, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        modules: ["price", "summaryDetail", "financialData", "defaultKeyStatistics", "earningsTrend"] as any,
      }),
      yahooFinance
        .chart(symbol, {
          period1: new Date(Date.now() - 380 * 24 * 60 * 60 * 1000),
          interval: "1d",
        })
        .catch(() => null),
    ]);

    const price = quoteData.price;
    if (!price) {
      res.status(404).json({ error: "not_found", message: `Symbol ${symbol} not found` });
      return;
    }

    const summary = quoteData.summaryDetail;
    const financial = quoteData.financialData;
    const keyStats = quoteData.defaultKeyStatistics;

    // ── GARP ──────────────────────────────────────────────────────────────────

    // earningsTrend module: analyst consensus growth estimates by period
    const earningsTrendModule = (
      quoteData as unknown as {
        earningsTrend?: {
          trend?: Array<{
            period: string; // "0q", "+1q", "0y", "+1y", "+5y"
            growth?: number | null;
            revenueEstimate?: { growth?: number | null };
          }>;
        };
      }
    ).earningsTrend;

    const trendEntries = earningsTrendModule?.trend ?? [];

    // Forward 1-yr analyst consensus estimates ("+1y" period has real data)
    const oneYrTrend = trendEntries.find((t) => t.period === "+1y");

    // Forward EPS growth estimate — primary source: earningsTrend "+1y" growth
    // fallback: financialData.earningsGrowth (YoY trailing)
    const epsGrowth5yr =
      oneYrTrend?.growth != null
        ? parseFloat((oneYrTrend.growth * 100).toFixed(1))
        : financial?.earningsGrowth != null
        ? parseFloat((financial.earningsGrowth * 100).toFixed(1))
        : null;

    // Forward 1-yr revenue growth estimate
    const revenueGrowth3yr =
      oneYrTrend?.revenueEstimate?.growth != null
        ? parseFloat((oneYrTrend.revenueEstimate.growth * 100).toFixed(1))
        : financial?.revenueGrowth != null
        ? parseFloat((financial.revenueGrowth * 100).toFixed(1))
        : null;

    const pegRatio = keyStats?.pegRatio ?? null;
    const forwardPE = summary?.forwardPE ?? null;

    // ── Deep Value ────────────────────────────────────────────────────────────

    const priceToBook = keyStats?.priceToBook ?? null;
    const evToEbitda = keyStats?.enterpriseToEbitda ?? null;
    const fcf = financial?.freeCashflow;
    const mktCap = price.marketCap;
    const fcfYield = fcf != null && mktCap != null && mktCap > 0
      ? parseFloat(((fcf / mktCap) * 100).toFixed(2))
      : null;
    const trailingPE = summary?.trailingPE ?? null;

    // ── Momentum ──────────────────────────────────────────────────────────────

    const sp52wChange =
      keyStats?.SandP52WeekChange != null
        ? parseFloat((Number(keyStats.SandP52WeekChange) * 100).toFixed(2))
        : null;

    const quotes = (chartResult?.quotes ?? []).filter(
      (q): q is typeof q & { close: number } => q.close != null
    );
    const currentClose = quotes.at(-1)?.close ?? null;

    let return52w: number | null = null;
    let return1m: number | null = null;
    let return3m: number | null = null;
    if (currentClose != null && quotes.length >= 2) {
      // 52w ≈ 252 trading days; chart spans ~380 calendar days, so index ~252 from end
      const idx52w = Math.max(0, quotes.length - 253);
      const close52w = quotes[idx52w]?.close;
      if (close52w) return52w = parseFloat((((currentClose / close52w) - 1) * 100).toFixed(2));

      const idx1m = Math.max(0, quotes.length - 22);
      const close1m = quotes[idx1m]?.close;
      if (close1m) return1m = parseFloat((((currentClose / close1m) - 1) * 100).toFixed(2));

      const idx3m = Math.max(0, quotes.length - 64);
      const close3m = quotes[idx3m]?.close;
      if (close3m) return3m = parseFloat((((currentClose / close3m) - 1) * 100).toFixed(2));
    }

    // ── Quality ───────────────────────────────────────────────────────────────

    const returnOnEquity =
      financial?.returnOnEquity != null ? parseFloat((financial.returnOnEquity * 100).toFixed(1)) : null;
    const grossMargin =
      financial?.grossMargins != null ? parseFloat((financial.grossMargins * 100).toFixed(1)) : null;
    const operatingMargin =
      financial?.operatingMargins != null ? parseFloat((financial.operatingMargins * 100).toFixed(1)) : null;
    // debtToEquity from yahoo is percentage (163 = 1.63x), divide by 100
    const debtToEquity =
      financial?.debtToEquity != null ? parseFloat((financial.debtToEquity / 100).toFixed(3)) : null;

    // ── Dividend Growth ───────────────────────────────────────────────────────

    // dividendYield: summaryDetail.dividendYield (decimal) → %
    //   fallback 1: summaryDetail.trailingAnnualDividendYield (decimal)
    //   fallback 2: compute from summaryDetail.dividendRate / market price
    const mktPrice = price?.regularMarketPrice;
    const dividendYield =
      summary?.dividendYield != null && summary.dividendYield > 0
        ? parseFloat((summary.dividendYield * 100).toFixed(2))
        : summary?.trailingAnnualDividendYield != null && summary.trailingAnnualDividendYield > 0
        ? parseFloat((summary.trailingAnnualDividendYield * 100).toFixed(2))
        : summary?.dividendRate != null && summary.dividendRate > 0 && mktPrice != null && mktPrice > 0
        ? parseFloat(((summary.dividendRate / mktPrice) * 100).toFixed(2))
        : null;

    // payoutRatio: summaryDetail (decimal) → %
    //   fallback: annualDividendRate / EPS, where EPS = keyStats.trailingEps or price/trailingPE
    const trailingEps =
      keyStats?.trailingEps != null && keyStats.trailingEps > 0 ? keyStats.trailingEps
      : mktPrice != null && summary?.trailingPE != null && summary.trailingPE > 0
        ? mktPrice / summary.trailingPE
        : null;
    // annualDivPerShare: prefer summaryDetail.dividendRate (when present),
    // else back-compute from yield × price (Yahoo Finance sometimes omits dividendRate)
    const divRate = summary?.dividendRate;
    const annualDivPerShare =
      divRate != null && divRate > 0
        ? divRate
        : dividendYield != null && dividendYield > 0 && mktPrice != null && mktPrice > 0
        ? (dividendYield / 100) * mktPrice
        : null;
    const payoutRatio =
      summary?.payoutRatio != null && summary.payoutRatio > 0
        ? parseFloat((summary.payoutRatio * 100).toFixed(1))
        : annualDivPerShare != null && annualDivPerShare > 0 && trailingEps != null && trailingEps > 0
        ? parseFloat(((annualDivPerShare / trailingEps) * 100).toFixed(1))
        : null;

    // fiveYearAvgDividendYield: already a % in summaryDetail
    const fiveYearAvgDividendYield = summary?.fiveYearAvgDividendYield ?? null;

    res.json({
      symbol,
      epsGrowth5yr,
      pegRatio,
      forwardPE,
      revenueGrowth3yr,
      priceToBook,
      evToEbitda,
      fcfYield,
      trailingPE,
      return52w,
      sp52wChange,
      return1m,
      return3m,
      returnOnEquity,
      grossMargin,
      debtToEquity,
      operatingMargin,
      dividendYield,
      payoutRatio,
      fiveYearAvgDividendYield,
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch screener ratings");
    res.status(500).json({ error: "server_error", message: "Failed to fetch screener ratings" });
  }
});

router.get("/stock/:symbol/indicators", async (req, res): Promise<void> => {
  const params = GetStockIndicatorsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);

  try {
    const [quoteData, chartResult, optionsData] = await Promise.all([
      yahooFinance.quoteSummary(symbol, {
        modules: ["price", "summaryDetail", "financialData", "defaultKeyStatistics"],
      }),
      yahooFinance.chart(symbol, { period1: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), interval: "1d" }).catch(() => null),
      yahooFinance.options(symbol).catch(() => null),
    ]);

    const price = quoteData.price;
    const summary = quoteData.summaryDetail;
    const financial = quoteData.financialData;
    const keyStats = quoteData.defaultKeyStatistics;

    if (!price) {
      res.status(404).json({ error: "not_found", message: `Symbol ${symbol} not found` });
      return;
    }

    const currentPrice = price.regularMarketPrice ?? null;
    const forwardPE = summary?.forwardPE ?? null;
    const epsGrowth =
      financial?.earningsGrowth != null ? financial.earningsGrowth * 100 : null;
    // debtToEquity from yahoo-finance2 is returned as percentage (e.g. 163 = 1.63x), divide by 100
    const debtToEquity =
      financial?.debtToEquity != null ? financial.debtToEquity / 100 : null;
    const fiftyDayAverage = summary?.fiftyDayAverage ?? null;
    const twoHundredDayAverage = summary?.twoHundredDayAverage ?? null;

    // RSI(14) from 60-day chart
    const closes = (chartResult?.quotes ?? [])
      .map((q) => q.close)
      .filter((c): c is number => c != null);
    const rsi14 = calculateRSI14(closes);

    // Short interest as percentage
    const shortPercentOfFloat =
      keyStats?.shortPercentOfFloat != null ? keyStats.shortPercentOfFloat * 100 : null;

    // Put/Call ratio and IV from near-term options
    let putCallRatio: number | null = null;
    let impliedVolatility: number | null = null;
    if (optionsData?.options?.[0]) {
      const chain = optionsData.options[0];
      const calls = chain.calls ?? [];
      const puts = chain.puts ?? [];

      // PCR via open interest
      const callOI = calls.reduce((s, c) => s + (c.openInterest ?? 0), 0);
      const putOI = puts.reduce((s, p) => s + (p.openInterest ?? 0), 0);
      if (callOI > 0) putCallRatio = parseFloat((putOI / callOI).toFixed(2));

      // IV: average of all options with valid IV (expressed as decimal in yahoo-finance2)
      const allOpts = [...calls, ...puts];
      const ivs = allOpts
        .map((o) => o.impliedVolatility)
        .filter((iv): iv is number => iv != null && iv > 0 && iv < 5);
      if (ivs.length > 0) {
        const avg = ivs.reduce((a, b) => a + b, 0) / ivs.length;
        impliedVolatility = parseFloat((avg * 100).toFixed(1));
      }
    }

    const beta = summary?.beta ?? null;

    res.json({
      symbol,
      forwardPE,
      epsGrowth,
      debtToEquity,
      currentPrice,
      fiftyDayAverage,
      twoHundredDayAverage,
      rsi14,
      shortPercentOfFloat,
      putCallRatio,
      beta,
      impliedVolatility,
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch stock indicators");
    res.status(500).json({ error: "server_error", message: "Failed to fetch indicators" });
  }
});

router.get("/stock/:symbol/sec-filings", async (req, res): Promise<void> => {
  const params = GetSecFilingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);

  try {
    const searchResult = await yahooFinance.quoteSummary(symbol, {
      modules: ["price"],
    });

    const longName = searchResult.price?.longName ?? symbol;

    const cik = await lookupCik(symbol);
    let filings: {id: string; type: string; description: string; filedAt: string; url: string; documentUrl: string | null}[] = [];

    if (cik) {
      const filingsUrl = `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
      const filingsResponse = await fetch(filingsUrl);
      if (filingsResponse.ok) {
        const filingsData = await filingsResponse.json() as {
          filings?: {
            recent?: {
              form?: string[];
              filingDate?: string[];
              primaryDocument?: string[];
              accessionNumber?: string[];
              primaryDocDescription?: string[];
            };
          };
        };
        const recent = filingsData?.filings?.recent;
        if (recent) {
          const forms = recent.form ?? [];
          const dates = recent.filingDate ?? [];
          const docs = recent.primaryDocument ?? [];
          const accessions = recent.accessionNumber ?? [];
          const descriptions = recent.primaryDocDescription ?? [];

          const allowedForms = ["10-K", "10-Q", "8-K", "DEF 14A", "S-1", "4", "SC 13G", "SC 13D"];

          filings = forms
            .map((form, i) => ({
              id: accessions[i] ?? String(i),
              type: form,
              description: descriptions[i] || form,
              filedAt: dates[i] ?? "",
              accession: accessions[i] ?? "",
              doc: docs[i] ?? "",
            }))
            .filter((f) => allowedForms.includes(f.type))
            .slice(0, 30)
            .map((f) => {
              const accFormatted = f.accession.replace(/-/g, "");
              const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accFormatted}`;
              // url = filing index page (lists all documents in this filing)
              // documentUrl = direct link to the primary document (the actual filing)
              return {
                id: f.id,
                type: f.type,
                description: f.description,
                filedAt: f.filedAt,
                url: `${baseUrl}/`,
                documentUrl: f.doc ? `${baseUrl}/${f.doc}` : null,
              };
            });
        }
      }
    }

    if (filings.length === 0) {
      const edgarUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(symbol)}&type=10-K&dateb=&owner=include&count=40&search_text=&action=getcompany`;
      filings = [{
        id: "edgar-search",
        type: "EDGAR Search",
        description: `View all SEC filings for ${symbol} on EDGAR`,
        filedAt: new Date().toISOString().split("T")[0],
        url: edgarUrl,
        documentUrl: null,
      }];
    }

    res.json({ symbol, cik, filings });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch SEC filings");
    res.status(500).json({ error: "server_error", message: "Failed to fetch SEC filings" });
  }
});

// ─── Fundamental Summary helpers ────────────────────────────────────────────

function itemDate(item: { date?: Date | string }): string {
  return item.date instanceof Date
    ? item.date.toISOString().split("T")[0]
    : String(item.date ?? "");
}

function makeMetric(
  value: number | null,
  unit: "%" | "x" | "d",
  thresholds: [number, number, number],
  higherIsBetter: boolean
): { value: number | null; rating: string | null; formatted: string | null } {
  const rating =
    value == null
      ? null
      : (() => {
          const [e, g, f] = thresholds;
          if (higherIsBetter) {
            if (value >= e) return "excellent";
            if (value >= g) return "good";
            if (value >= f) return "fair";
            return "poor";
          } else {
            if (value <= e) return "excellent";
            if (value <= g) return "good";
            if (value <= f) return "fair";
            return "poor";
          }
        })();

  const formatted =
    value == null
      ? null
      : unit === "%"
        ? `${value.toFixed(1)}%`
        : unit === "x"
          ? `${value.toFixed(1)}x`
          : `${Math.round(value)}d`;

  return { value, rating, formatted };
}

router.get("/stock/:symbol/fundamentals", async (req, res): Promise<void> => {
  const params = GetStockFundamentalsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const symbol = getSymbol(params.data.symbol);
  const period1 = new Date(Date.now() - 7 * 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  try {
    const [quoteSummaryResult, incomeRaw, balanceRaw] = await Promise.all([
      yahooFinance.quoteSummary(symbol, {
        modules: ["defaultKeyStatistics", "financialData", "summaryDetail", "price"],
      }),
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: "annual",
        module: "financials",
        period1,
      }),
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: "annual",
        module: "balance-sheet",
        period1,
      }),
    ]);

    const keyStats = quoteSummaryResult.defaultKeyStatistics;
    const financial = quoteSummaryResult.financialData;
    const price = quoteSummaryResult.price;

    if (!price) {
      res.status(404).json({ error: "not_found", message: `Symbol ${symbol} not found` });
      return;
    }

    // Sort annual data oldest → newest
    const sortedIncome = [...incomeRaw].sort((a, b) =>
      itemDate(a).localeCompare(itemDate(b))
    );
    const sortedBalance = [...balanceRaw].sort((a, b) =>
      itemDate(a).localeCompare(itemDate(b))
    );

    const num = (obj: Record<string, unknown> | null | undefined, key: string): number | null => {
      if (!obj) return null;
      const v = obj[key];
      return typeof v === "number" ? v : null;
    };

    const latestIncome = sortedIncome.at(-1) as unknown as Record<string, unknown> | undefined;
    const latestBalance = sortedBalance.at(-1) as unknown as Record<string, unknown> | undefined;

    // ── Profitability ──────────────────────────────────────────────────────────

    // ROE (yahoo returns decimal: 0.28 → 28%)
    const roe = financial?.returnOnEquity != null ? financial.returnOnEquity * 100 : null;
    const roeMetric = makeMetric(roe, "%", [20, 15, 8], true);

    // ROIC = Net Income / (Stockholders Equity + Total Debt)
    const netIncomeLatest = num(latestIncome, "netIncome");
    const equityLatest =
      num(latestBalance, "stockholdersEquity") ?? num(latestBalance, "commonStockEquity");
    const debtLatest = num(latestBalance, "totalDebt");
    const investedCapital =
      equityLatest != null && debtLatest != null ? equityLatest + debtLatest : null;
    const roic =
      netIncomeLatest != null && investedCapital != null && investedCapital > 0
        ? (netIncomeLatest / investedCapital) * 100
        : null;
    const roicMetric = makeMetric(roic, "%", [15, 10, 5], true);

    // Gross Margin Trend (5 annual periods, oldest first)
    const grossMarginTrend = sortedIncome.slice(-5).map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      const gp = num(raw, "grossProfit");
      const rev = num(raw, "totalRevenue");
      return {
        year: itemDate(item).substring(0, 4),
        value:
          gp != null && rev != null && rev > 0
            ? parseFloat(((gp / rev) * 100).toFixed(2))
            : null,
      };
    });
    const validMargins = grossMarginTrend
      .map((p) => p.value)
      .filter((v): v is number => v != null);
    let grossMarginRating: string | null = null;
    if (validMargins.length >= 3) {
      const n = validMargins.length;
      const oldAvg = (validMargins[0] + (validMargins[1] ?? validMargins[0])) / 2;
      const newAvg =
        (validMargins[n - 1] + (validMargins[n - 2] ?? validMargins[n - 1])) / 2;
      const delta = newAvg - oldAvg;
      grossMarginRating =
        delta > 1 ? "excellent" : delta > -1 ? "good" : delta > -3 ? "fair" : "poor";
    }

    // Cash Conversion Cycle: DSO + DIO - DPO
    const arLatest = num(latestBalance, "accountsReceivable");
    const invLatest = num(latestBalance, "inventory");
    const apLatest = num(latestBalance, "accountsPayable");
    const revLatest = num(latestIncome, "totalRevenue");
    const cogsLatest = num(latestIncome, "reconciledCostOfRevenue");
    let ccc: number | null = null;
    if (arLatest != null && revLatest != null && revLatest > 0) {
      const dso = (arLatest / revLatest) * 365;
      const dio =
        invLatest != null && cogsLatest != null && cogsLatest > 0
          ? (invLatest / cogsLatest) * 365
          : 0;
      const dpo =
        apLatest != null && cogsLatest != null && cogsLatest > 0
          ? (apLatest / cogsLatest) * 365
          : 0;
      ccc = parseFloat((dso + dio - dpo).toFixed(1));
    }
    const cccMetric = makeMetric(ccc, "d", [0, 30, 60], false);

    // ── Valuation ─────────────────────────────────────────────────────────────

    const evToEbitdaMetric = makeMetric(
      keyStats?.enterpriseToEbitda ?? null,
      "x",
      [10, 15, 20],
      false
    );

    const fcf = financial?.freeCashflow ?? null;
    const mktCap = price.marketCap ?? null;
    const fcfYield =
      fcf != null && mktCap != null && mktCap > 0 ? (fcf / mktCap) * 100 : null;
    const fcfYieldMetric = makeMetric(fcfYield, "%", [8, 5, 2], true);

    // Price to Tangible Book — use tangibleBookValue directly if available
    const currentPrice = price.regularMarketPrice ?? null;
    const sharesOutstanding = keyStats?.sharesOutstanding ?? null;
    const tangibleBookDirect = num(latestBalance, "tangibleBookValue");
    const goodwill = num(latestBalance, "goodwill") ?? 0;
    const intangibles =
      num(latestBalance, "otherIntangibleAssets") ?? num(latestBalance, "intangibleAssets") ?? 0;
    const tangibleBook =
      tangibleBookDirect ?? (equityLatest != null ? equityLatest - goodwill - intangibles : null);
    const tbvPerShare =
      tangibleBook != null && sharesOutstanding != null && sharesOutstanding > 0
        ? tangibleBook / sharesOutstanding
        : null;
    const pTangBook =
      currentPrice != null && tbvPerShare != null && tbvPerShare > 0
        ? currentPrice / tbvPerShare
        : null;
    const ptbMetric = makeMetric(pTangBook, "x", [1, 3, 5], false);

    // ── Solvency & Health ─────────────────────────────────────────────────────

    const totalDebt = financial?.totalDebt ?? null;
    const totalCash = financial?.totalCash ?? null;
    const netDebt =
      totalDebt != null && totalCash != null ? totalDebt - totalCash : null;
    const ebitda = financial?.ebitda ?? null;
    const netDebtToEbitda =
      netDebt != null && ebitda != null && ebitda > 0 ? netDebt / ebitda : null;
    const netDebtToEbitdaMetric = makeMetric(netDebtToEbitda, "x", [1, 3, 5], false);

    const ebit = num(latestIncome, "EBIT");
    // interestExpense isn't always a separate field — derive from EBIT − pretaxIncome when absent
    let interestExpenseAmt = num(latestIncome, "interestExpense");
    if (interestExpenseAmt == null && ebit != null) {
      const pretax = num(latestIncome, "pretaxIncome");
      const otherIncome = num(latestIncome, "otherIncomeExpense") ?? 0;
      if (pretax != null) {
        const derived = ebit - pretax - otherIncome;
        if (derived > 0) interestExpenseAmt = derived; // positive = net interest expense
      }
    }
    const interestCoverage =
      ebit != null && interestExpenseAmt != null && interestExpenseAmt > 0
        ? ebit / interestExpenseAmt
        : null;
    const interestCoverageMetric = makeMetric(interestCoverage, "x", [10, 3, 1.5], true);

    const currentRatioMetric = makeMetric(
      financial?.currentRatio ?? null,
      "x",
      [2, 1.5, 1],
      true
    );
    const quickRatioMetric = makeMetric(
      financial?.quickRatio ?? null,
      "x",
      [1.5, 1, 0.5],
      true
    );

    // ── Qualitative ───────────────────────────────────────────────────────────

    const insiderPct =
      keyStats?.heldPercentInsiders != null ? keyStats.heldPercentInsiders * 100 : null;
    const insiderOwnershipMetric = makeMetric(insiderPct, "%", [10, 5, 1], true);

    const rdExpense = num(latestIncome, "researchAndDevelopment");
    const rdRevenue = num(latestIncome, "totalRevenue");
    const rdPct =
      rdExpense != null && rdRevenue != null && rdRevenue > 0
        ? (Math.abs(rdExpense) / rdRevenue) * 100
        : null;
    const rdMetric = makeMetric(rdPct, "%", [10, 5, 1], true);

    // Share Count Trend (5 annual periods, oldest first)
    // shareIssued and ordinarySharesNumber are confirmed available in Yahoo Finance balance-sheet
    const shareCountTrend = sortedBalance.slice(-5).map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      const shares =
        num(raw, "shareIssued") ?? num(raw, "ordinarySharesNumber") ?? num(raw, "commonStock");
      return { year: itemDate(item).substring(0, 4), value: shares };
    });
    const validShares = shareCountTrend.filter((p) => p.value != null);
    let shareChange5y: number | null = null;
    if (validShares.length >= 2) {
      const oldest = validShares[0].value!;
      const newest = validShares[validShares.length - 1].value!;
      if (oldest > 0)
        shareChange5y = parseFloat((((newest - oldest) / oldest) * 100).toFixed(1));
    }
    const shareCountMetric = makeMetric(shareChange5y, "%", [-10, -2, 5], false);

    res.json({
      symbol,
      profitability: {
        roe: roeMetric,
        roic: roicMetric,
        grossMarginTrend,
        grossMarginRating,
        ccc: cccMetric,
      },
      valuation: {
        evToEbitda: evToEbitdaMetric,
        fcfYield: fcfYieldMetric,
        priceToTangibleBook: ptbMetric,
      },
      solvency: {
        netDebtToEbitda: netDebtToEbitdaMetric,
        interestCoverage: interestCoverageMetric,
        currentRatio: currentRatioMetric,
        quickRatio: quickRatioMetric,
      },
      qualitative: {
        insiderOwnership: insiderOwnershipMetric,
        rdAsPercentRevenue: rdMetric,
        shareCountTrend,
        shareCountChange5y: shareCountMetric,
      },
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch fundamentals");
    res.status(500).json({ error: "server_error", message: "Failed to fetch fundamentals" });
  }
});

// ── Analysis: DCF inputs + MOAT metrics ───────────────────────────────────────
router.get("/stock/:symbol/analysis", async (req, res): Promise<void> => {
  const { symbol } = GetStockAnalysisParams.parse(req.params);
  try {
    const [income5yr, balance5yr, cashflow5yr, summary] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: "annual",
        module: "financials",
        period1: "2020-01-01",
      }),
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: "annual",
        module: "balance-sheet",
        period1: "2020-01-01",
      }),
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: "annual",
        module: "cash-flow",
        period1: "2020-01-01",
      }),
      yahooFinance.quoteSummary(symbol, {
        modules: ["financialData", "defaultKeyStatistics", "price"],
      }),
    ]);

    type RawMap = Record<string, Record<string, unknown>>;

    function yearOf(item: Record<string, unknown>): string | null {
      // yahoo-finance2 fundamentalsTimeSeries stores dates as Date objects under "date"
      const d = item["date"] ?? item["asOfDate"];
      if (!d) return null;
      if (d instanceof Date) return String(d.getFullYear());
      // ISO string fallback: "2022-09-30T..." → "2022"
      return String(d).substring(0, 4);
    }

    const incomeMap: RawMap = {};
    for (const row of income5yr) {
      const raw = row as unknown as Record<string, unknown>;
      const y = yearOf(raw);
      if (y) incomeMap[y] = raw;
    }
    const balanceMap: RawMap = {};
    for (const row of balance5yr) {
      const raw = row as unknown as Record<string, unknown>;
      const y = yearOf(raw);
      if (y) balanceMap[y] = raw;
    }
    const cashMap: RawMap = {};
    for (const row of cashflow5yr) {
      const raw = row as unknown as Record<string, unknown>;
      const y = yearOf(raw);
      if (y) cashMap[y] = raw;
    }

    const allYears = [
      ...new Set([
        ...Object.keys(incomeMap),
        ...Object.keys(balanceMap),
        ...Object.keys(cashMap),
      ]),
    ].sort();
    const years = allYears.slice(-5);

    function n(obj: Record<string, unknown>, key: string): number | null {
      const v = obj[key];
      return typeof v === "number" && isFinite(v) ? v : null;
    }

    const moatRows = years.map((year) => {
      const inc = incomeMap[year] ?? {};
      const bs = balanceMap[year] ?? {};
      const cf = cashMap[year] ?? {};

      const rev = n(inc, "totalRevenue");
      const gp = n(inc, "grossProfit");
      const sga = n(inc, "sellingGeneralAndAdministration");
      const da = n(inc, "reconciledDepreciation");
      const pretax = n(inc, "pretaxIncome");
      const tax = n(inc, "taxProvision");
      const ni = n(inc, "netIncome");
      const ebit = n(inc, "EBIT");
      const otherInc = n(inc, "otherIncomeExpense") ?? 0;
      const capex = n(cf, "capitalExpenditure");
      const totalLiab = n(bs, "totalLiabilitiesNetMinorityInterest");
      const equity = n(bs, "stockholdersEquity");

      // Interest expense — try direct fields first, fall back to EBIT − pretaxIncome derivation
      let interestExp: number | null =
        n(inc, "interestExpenseNonOperating") ?? n(inc, "interestExpense");
      if (interestExp != null) interestExp = Math.abs(interestExp);
      if ((interestExp == null || interestExp === 0) && ebit != null && pretax != null) {
        const derived = ebit - pretax - otherInc;
        if (derived > 0) interestExp = derived;
      }

      return {
        year,
        grossMargin:
          rev != null && rev > 0 && gp != null ? (gp / rev) * 100 : null,
        sgaMargin:
          gp != null && gp > 0 && sga != null
            ? (Math.abs(sga) / gp) * 100
            : null,
        daRatio:
          gp != null && gp > 0 && da != null
            ? (Math.abs(da) / gp) * 100
            : null,
        interestRatio:
          pretax != null && pretax > 0 && interestExp != null
            ? (interestExp / pretax) * 100
            : null,
        taxRate:
          pretax != null && pretax > 0 && tax != null
            ? (Math.abs(tax) / pretax) * 100
            : null,
        netMargin:
          rev != null && rev > 0 && ni != null ? (ni / rev) * 100 : null,
        capexRatio:
          ni != null && Math.abs(ni) > 0 && capex != null
            ? (Math.abs(capex) / Math.abs(ni)) * 100
            : null,
        liabToEquity:
          totalLiab != null && equity != null && equity > 0
            ? totalLiab / equity
            : null,
        roe:
          equity != null && equity !== 0 && ni != null
            ? (ni / equity) * 100
            : null,
      };
    });

    const financial = summary.financialData;
    const keyStats = summary.defaultKeyStatistics;
    const price = summary.price;

    const mostRecentYear = years[years.length - 1] ?? "";
    const fcf = financial?.freeCashflow ?? null;
    const sharesOutstanding = keyStats?.sharesOutstanding ?? null;
    const totalDebt = financial?.totalDebt ?? null;
    const totalCash = financial?.totalCash ?? null;
    const netDebt =
      totalDebt != null && totalCash != null ? totalDebt - totalCash : null;
    const currentPrice = price?.regularMarketPrice ?? null;

    res.json({
      dcfInputs: {
        freeCashFlow: fcf ?? null,
        sharesOutstanding: sharesOutstanding ?? null,
        netDebt: netDebt ?? null,
        currentPrice: currentPrice ?? null,
        dataYear: mostRecentYear ? `${mostRecentYear} Annual` : "N/A",
      },
      moatRows,
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch analysis data");
    res
      .status(500)
      .json({ error: "server_error", message: "Failed to fetch analysis" });
  }
});

router.get("/stock/:symbol/models", async (req, res): Promise<void> => {
  const { symbol } = GetStockModelsParams.parse(req.params);
  try {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

    const [income10yr, balance5yr, balance10yr, cashflow5yr, chartData, summary] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: "annual",
        module: "financials",
        period1: tenYearsAgo,
      }),
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: "annual",
        module: "balance-sheet",
        period1: fiveYearsAgo,
      }),
      yahooFinance.fundamentalsTimeSeries(symbol, {
        type: "annual",
        module: "balance-sheet",
        period1: tenYearsAgo,
      }),
      yahooFinance
        .fundamentalsTimeSeries(symbol, {
          type: "annual",
          module: "cash-flow",
          period1: fiveYearsAgo,
        })
        .catch(() => [] as Awaited<ReturnType<typeof yahooFinance.fundamentalsTimeSeries>>),
      yahooFinance
        .chart(symbol, {
          period1: sevenYearsAgo,
          period2: new Date(),
          interval: "1mo",
          events: "div",
        })
        .catch(() => null),
      yahooFinance.quoteSummary(symbol, {
        modules: ["financialData", "defaultKeyStatistics", "summaryDetail", "price"],
      }),
    ]);

    function yearOf(item: Record<string, unknown>): string | null {
      const d = item["date"] ?? item["asOfDate"];
      if (!d) return null;
      if (d instanceof Date) return String(d.getFullYear());
      return String(d).substring(0, 4);
    }

    const sharesOutstanding =
      (summary.defaultKeyStatistics?.sharesOutstanding ?? null) as
        | number
        | null;

    type RawMap = Record<string, Record<string, unknown>>;

    // Build 10-year balance sheet map for historical shares (used in Graham EPS)
    const balance10Map: RawMap = {};
    for (const row of balance10yr) {
      const raw = row as unknown as Record<string, unknown>;
      const y = yearOf(raw);
      if (y) balance10Map[y] = raw;
    }

    // Build monthly price map from chart quotes (YYYY-MM → close price)
    // Used to compute historical EV = price × shares + debt − cash
    const priceMap: Record<string, number> = {};
    for (const quote of chartData?.quotes ?? []) {
      const raw = quote as unknown as Record<string, unknown>;
      const d = raw["date"];
      const close = raw["adjclose"] ?? raw["close"];
      if (d instanceof Date && typeof close === "number") {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        priceMap[key] = close;
      }
    }

    // Helper: extract YYYY-MM from a balance-sheet row's date
    function monthKeyOf(item: Record<string, unknown>): string | null {
      const d = item["date"] ?? item["asOfDate"];
      if (!d) return null;
      if (d instanceof Date) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      return String(d).substring(0, 7);
    }

    // --- Graham: EPS history using per-year diluted average shares ---
    const epsHistory = income10yr
      .map((row: unknown) => {
        const raw = row as Record<string, unknown>;
        const year = yearOf(raw);
        if (!year) return null;
        const dilutedEPS = (raw["dilutedEPS"] as number | undefined) ?? null;
        const netIncome = (raw["netIncome"] as number | undefined) ?? null;
        const dilutedAvgShares =
          (raw["dilutedAverageShares"] as number | undefined) ?? null;
        const eps =
          dilutedEPS ??
          (netIncome != null
            ? (() => {
                const s = dilutedAvgShares ?? sharesOutstanding;
                return s != null && s > 0 ? netIncome / s : null;
              })()
            : null);
        return { year, eps };
      })
      .filter((r): r is { year: string; eps: number | null } => r !== null)
      .sort((a: { year: string }, b: { year: string }) => a.year.localeCompare(b.year));

    // --- EV/EBIT: 5-year income + balance history with historical EV ---
    const incomeMap5: RawMap = {};
    for (const row of income10yr.slice(-5)) {
      const raw = row as unknown as Record<string, unknown>;
      const y = yearOf(raw);
      if (y) incomeMap5[y] = raw;
    }
    const balanceMap5: RawMap = {};
    for (const row of balance5yr) {
      const raw = row as unknown as Record<string, unknown>;
      const y = yearOf(raw);
      if (y) balanceMap5[y] = raw;
    }
    const evEbitYears = [
      ...new Set([...Object.keys(incomeMap5), ...Object.keys(balanceMap5)]),
    ].sort();
    const evEbitHistory = evEbitYears.map((year) => {
      const inc = incomeMap5[year] ?? {};
      const bal = balanceMap5[year] ?? {};
      const td = (bal["totalDebt"] as number | undefined) ?? 0;
      const cash = (bal["cashAndCashEquivalents"] as number | undefined) ?? 0;
      // Diluted shares for this year (from income stmt)
      const yearShares =
        (inc["dilutedAverageShares"] as number | undefined) ?? sharesOutstanding ?? 0;
      // Year-end price: match the fiscal year-end month from the balance sheet date
      const monthKey = monthKeyOf(bal);
      const yearEndPrice = monthKey ? (priceMap[monthKey] ?? null) : null;
      // Historical EV = price × shares + debt − cash
      const historicalEv =
        yearEndPrice != null && yearShares > 0
          ? yearEndPrice * yearShares + td - cash
          : null;
      return {
        year,
        ebit: (inc["operatingIncome"] as number | undefined) ?? null,
        revenue: (inc["totalRevenue"] as number | undefined) ?? null,
        totalDebt: td > 0 ? td : null,
        cash: cash > 0 ? cash : null,
        minorityInterest:
          (bal["minorityInterest"] as number | undefined) ?? null,
        ev: historicalEv,
      };
    });
    const currentEv =
      (summary.defaultKeyStatistics?.enterpriseValue ?? null) as
        | number
        | null;

    // --- DDM: dividend history grouped by year ---
    const epsMap: Record<string, number | null> = {};
    for (const row of income10yr.slice(-6)) {
      const raw = row as unknown as Record<string, unknown>;
      const y = yearOf(raw);
      if (!y) continue;
      const dilutedEPS = (raw["dilutedEPS"] as number | undefined) ?? null;
      const netIncome = (raw["netIncome"] as number | undefined) ?? null;
      epsMap[y] =
        dilutedEPS ??
        (netIncome != null && sharesOutstanding != null && sharesOutstanding > 0
          ? netIncome / sharesOutstanding
          : null);
    }

    const dividendByYear: Record<string, number> = {};
    const divEvents = chartData?.events?.dividends ?? {};
    for (const entry of Object.values(divEvents)) {
      const raw = entry as unknown as Record<string, unknown>;
      const dateVal = raw["date"];
      const amount = raw["amount"] as number | undefined;
      if (amount != null) {
        let year: string | null = null;
        if (dateVal instanceof Date) year = String(dateVal.getFullYear());
        else if (typeof dateVal === "string") year = dateVal.substring(0, 4);
        if (year) dividendByYear[year] = (dividendByYear[year] ?? 0) + amount;
      }
    }

    const currentCalendarYear = String(new Date().getFullYear());
    const ddmDividendHistory = Object.keys(dividendByYear)
      .filter((year) => year !== currentCalendarYear)
      .sort()
      .map((year) => ({
        year,
        dps: dividendByYear[year],
        eps: epsMap[year] ?? null,
      }));

    const beta = (summary.defaultKeyStatistics?.beta ?? null) as
      | number
      | null;
    const currentPrice = (summary.price?.regularMarketPrice ?? null) as
      | number
      | null;
    const trailingEps = (summary.defaultKeyStatistics?.trailingEps ?? null) as
      | number
      | null;
    const payoutRatio = (summary.summaryDetail?.payoutRatio ?? null) as
      | number
      | null;
    const trailingDividendRate = (summary.defaultKeyStatistics
      ?.trailingAnnualDividendRate ?? null) as number | null;

    // --- Katsenelson: 10-yr EPS CAGR ---
    const positiveEpsRows = epsHistory.filter(
      (r): r is { year: string; eps: number } => r.eps != null && r.eps > 0
    );
    const oldestPositive = positiveEpsRows[0] ?? null;
    const latestEpsRow =
      positiveEpsRows[positiveEpsRows.length - 1] ?? null;
    let epsGrowthRate: number | null = null;
    if (
      oldestPositive &&
      latestEpsRow &&
      oldestPositive.year !== latestEpsRow.year
    ) {
      const yrs =
        parseInt(latestEpsRow.year) - parseInt(oldestPositive.year);
      if (yrs > 0) {
        epsGrowthRate =
          Math.pow(latestEpsRow.eps / oldestPositive.eps, 1 / yrs) - 1;
      }
    }
    const katsenelson = {
      ttmEps: trailingEps,
      epsGrowthRate,
      dividendYield: (summary.summaryDetail?.dividendYield ?? null) as
        | number
        | null,
      currentPrice,
      sharesOutstanding,
      epsHistory,
    };

    // --- EPV & Owners' Earnings: cash-flow map + computations ---
    type CfRawMap = Record<string, Record<string, unknown>>;
    const cfMap5: CfRawMap = {};
    for (const row of cashflow5yr) {
      const raw = row as unknown as Record<string, unknown>;
      const y = yearOf(raw);
      if (y) cfMap5[y] = raw;
    }

    const epvYears = [
      ...new Set([
        ...Object.keys(incomeMap5),
        ...Object.keys(balanceMap5),
        ...Object.keys(cfMap5),
      ]),
    ].sort();

    const epvHistory = epvYears.map((year) => {
      const inc = incomeMap5[year] ?? {};
      const bal = balanceMap5[year] ?? {};
      const cf = cfMap5[year] ?? {};
      const revenue = (inc["totalRevenue"] as number | undefined) ?? null;
      const ebit = (inc["operatingIncome"] as number | undefined) ?? null;
      const capexRaw = (cf["capitalExpenditure"] as number | undefined) ?? null;
      const capex = capexRaw != null ? Math.abs(capexRaw) : null;
      const depreciation =
        (cf["depreciationAmortizationDepletion"] as number | undefined) ??
        (cf["depreciation"] as number | undefined) ??
        null;
      const grossPPE = (bal["grossPPE"] as number | undefined) ?? null;
      const taxProvision =
        (inc["taxProvision"] as number | undefined) ?? null;
      const pretaxIncome =
        (inc["pretaxIncome"] as number | undefined) ?? null;
      const taxRate =
        taxProvision != null && pretaxIncome != null && pretaxIncome > 0
          ? taxProvision / pretaxIncome
          : null;
      return { year, revenue, ebit, capex, depreciation, grossPPE, taxRate };
    });

    // Normalize EBIT and tax rate over available years
    const ebitValues = epvHistory
      .filter((r) => r.ebit != null && r.ebit > 0)
      .map((r) => r.ebit!);
    const normalizedEbit =
      ebitValues.length > 0
        ? ebitValues.reduce((a, b) => a + b, 0) / ebitValues.length
        : null;

    const taxRateValues = epvHistory
      .filter((r) => r.taxRate != null && r.taxRate > 0 && r.taxRate < 1)
      .map((r) => r.taxRate!);
    const normalizedTaxRate =
      taxRateValues.length > 0
        ? taxRateValues.reduce((a, b) => a + b, 0) / taxRateValues.length
        : 0.25;

    // Growth CapEx ratio = avg(GrossPPE / Revenue) over available years
    const gppePairs = epvHistory.filter(
      (r) => r.grossPPE != null && r.revenue != null && r.revenue > 0
    );
    const growthCapexRatio =
      gppePairs.length > 0
        ? gppePairs.reduce((s, r) => s + r.grossPPE! / r.revenue!, 0) /
          gppePairs.length
        : null;

    // Latest-year data for maintenance capex
    const latestEpvYear = epvYears[epvYears.length - 1];
    const priorEpvYear = epvYears[epvYears.length - 2];
    const latestRevenue =
      (incomeMap5[latestEpvYear]?.["totalRevenue"] as number | undefined) ??
      null;
    const priorRevenue =
      (incomeMap5[priorEpvYear]?.["totalRevenue"] as number | undefined) ??
      null;
    const latestRevenueDelta =
      latestRevenue != null && priorRevenue != null
        ? latestRevenue - priorRevenue
        : null;

    const latestCf = cfMap5[latestEpvYear] ?? {};
    const latestCapexRaw =
      (latestCf["capitalExpenditure"] as number | undefined) ?? null;
    const latestCapex =
      latestCapexRaw != null ? Math.abs(latestCapexRaw) : null;
    const latestDepreciation =
      (latestCf["depreciationAmortizationDepletion"] as number | undefined) ??
      (latestCf["depreciation"] as number | undefined) ??
      null;

    const growthCapex =
      growthCapexRatio != null &&
      latestRevenueDelta != null &&
      latestRevenueDelta > 0
        ? growthCapexRatio * latestRevenueDelta
        : 0;
    const maintenanceCapex =
      latestCapex != null ? Math.max(0, latestCapex - growthCapex) : null;

    // Latest balance sheet items for EPV equity bridge
    const latestEpvBal = balanceMap5[latestEpvYear] ?? {};
    const epvCash =
      (latestEpvBal["cashCashEquivalentsAndShortTermInvestments"] as
        | number
        | undefined) ??
      (latestEpvBal["cashAndCashEquivalents"] as number | undefined) ??
      null;
    const epvDebt =
      (latestEpvBal["totalDebt"] as number | undefined) ?? null;

    // Interest expense for Kd in WACC
    const latestEpvInc = incomeMap5[latestEpvYear] ?? {};
    const latestIntExpRaw =
      (latestEpvInc["interestExpense"] as number | undefined) ??
      (latestEpvInc["interestExpenseNonOperating"] as number | undefined) ??
      null;
    const latestInterestExpense =
      latestIntExpRaw != null ? Math.abs(latestIntExpRaw) : null;

    const epv = {
      history: epvHistory,
      normalizedEbit,
      normalizedTaxRate,
      maintenanceCapex,
      growthCapexRatio,
      latestRevenueDelta,
      latestCapex,
      latestDepreciation,
      currentCash: epvCash,
      currentDebt: epvDebt,
      currentPrice,
      sharesOutstanding,
      beta,
      latestInterestExpense,
    };

    // --- Owners' Earnings: most-recent-year CF components ---
    const latestNetIncome =
      (latestEpvInc["netIncome"] as number | undefined) ?? null;
    const latestDeferredTax =
      (latestCf["deferredTax"] as number | undefined) ??
      (latestCf["deferredIncomeTax"] as number | undefined) ??
      null;
    const latestWcChange =
      (latestCf["changeInWorkingCapital"] as number | undefined) ?? null;

    const ownersEarnings = {
      netIncome: latestNetIncome,
      depreciation: latestDepreciation,
      deferredTax: latestDeferredTax,
      workingCapitalChange: latestWcChange,
      maintenanceCapex,
      growthCapexRatio,
      latestRevenueDelta,
      latestCapex,
      sharesOutstanding,
      currentPrice,
    };

    // --- RIV: book value per share and ROE ---
    const latestEquity =
      (latestEpvBal["commonStockEquity"] as number | undefined) ??
      (latestEpvBal["stockholdersEquity"] as number | undefined) ??
      null;
    const latestSharesForBv =
      (latestEpvBal["ordinarySharesNumber"] as number | undefined) ??
      sharesOutstanding ??
      null;
    const bookValuePerShare =
      latestEquity != null &&
      latestSharesForBv != null &&
      latestSharesForBv > 0
        ? latestEquity / latestSharesForBv
        : null;
    const roe =
      latestNetIncome != null &&
      latestEquity != null &&
      latestEquity > 0
        ? latestNetIncome / latestEquity
        : null;

    const riv = {
      bookValuePerShare,
      roe,
      eps: trailingEps,
      dividendPerShare: trailingDividendRate,
      currentPrice,
      sharesOutstanding,
      beta,
    };

    res.json({
      graham: {
        epsHistory,
        currentPrice,
        trailingEps,
      },
      evEbit: {
        history: evEbitHistory,
        currentEv,
        sharesOutstanding,
      },
      ddm: {
        dividendHistory: ddmDividendHistory,
        beta,
        currentPrice,
        trailingEps,
        payoutRatio,
        trailingDividendRate,
      },
      katsenelson,
      epv,
      ownersEarnings,
      riv,
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch models data");
    res
      .status(500)
      .json({ error: "server_error", message: "Failed to fetch models data" });
  }
});

export default router;
