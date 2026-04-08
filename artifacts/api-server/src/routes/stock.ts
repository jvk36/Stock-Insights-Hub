import { Router, type IRouter } from "express";
import YahooFinance from "yahoo-finance2";
import {
  GetStockQuoteParams,
  GetStockChartParams,
  GetStockChartQueryParams,
  GetStockNewsParams,
  GetStockProfileParams,
  GetStockFinancialsParams,
  GetStockFinancialsQueryParams,
  GetSecFilingsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const yahooFinance = new YahooFinance();

function getSymbol(param: string | string[]): string {
  return (Array.isArray(param) ? param[0] : param).toUpperCase();
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
    });

    const data = (result.quotes ?? []).map((q) => ({
      date: q.date instanceof Date ? q.date.toISOString().split("T")[0] : String(q.date),
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      close: q.close ?? null,
      volume: q.volume ?? null,
    }));

    res.json({ symbol, range, data });
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
      logoUrl: `https://logo.clearbit.com/${profile?.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")}` ?? null,
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch profile");
    res.status(500).json({ error: "server_error", message: "Failed to fetch profile" });
  }
});

const incomeStatementKeyMap: Record<string, string> = {
  totalRevenue: "Total Revenue",
  costOfRevenue: "Cost of Revenue",
  grossProfit: "Gross Profit",
  operatingExpenses: "Operating Expenses",
  operatingIncome: "Operating Income",
  ebitda: "EBITDA",
  netIncome: "Net Income",
  basicEPS: "Basic EPS",
  dilutedEPS: "Diluted EPS",
  researchAndDevelopment: "Research & Development",
  sellingGeneralAndAdministrative: "SG&A",
  totalOperatingExpenses: "Total Operating Expenses",
  interestExpense: "Interest Expense",
  incomeTaxExpense: "Income Tax Expense",
  netIncomeFromContinuingOperations: "Net Income (Continuing Ops)",
};

const balanceSheetKeyMap: Record<string, string> = {
  totalAssets: "Total Assets",
  totalLiabilities: "Total Liabilities",
  totalStockholderEquity: "Stockholder Equity",
  cash: "Cash & Equivalents",
  shortTermInvestments: "Short-term Investments",
  netReceivables: "Net Receivables",
  inventory: "Inventory",
  totalCurrentAssets: "Total Current Assets",
  longTermInvestments: "Long-term Investments",
  propertyPlantEquipment: "PP&E (Net)",
  goodwill: "Goodwill",
  intangibleAssets: "Intangible Assets",
  totalCurrentLiabilities: "Total Current Liabilities",
  shortLongTermDebt: "Short-term Debt",
  longTermDebt: "Long-term Debt",
  totalDebt: "Total Debt",
  retainedEarnings: "Retained Earnings",
  commonStock: "Common Stock",
};

const cashFlowKeyMap: Record<string, string> = {
  totalCashFromOperatingActivities: "Operating Cash Flow",
  capitalExpenditures: "Capital Expenditures",
  totalCashFromInvestingActivities: "Investing Cash Flow",
  totalCashFromFinancingActivities: "Financing Cash Flow",
  changeInCash: "Change in Cash",
  freeCashFlow: "Free Cash Flow",
  dividendsPaid: "Dividends Paid",
  repurchaseOfStock: "Stock Repurchase",
  netBorrowings: "Net Borrowings",
  issuanceOfStock: "Stock Issuance",
  depreciation: "Depreciation & Amortization",
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

  try {
    const modules = period === "annual"
      ? ["incomeStatementHistory", "balanceSheetHistory", "cashflowStatementHistory"] as const
      : ["incomeStatementHistoryQuarterly", "balanceSheetHistoryQuarterly", "cashflowStatementHistoryQuarterly"] as const;

    const result = await yahooFinance.quoteSummary(symbol, { modules: [...modules] });

    const incomeHistory = period === "annual"
      ? result.incomeStatementHistory?.incomeStatementHistory ?? []
      : result.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];

    const balanceHistory = period === "annual"
      ? result.balanceSheetHistory?.balanceSheetStatements ?? []
      : result.balanceSheetHistoryQuarterly?.balanceSheetStatements ?? [];

    const cashHistory = period === "annual"
      ? result.cashflowStatementHistory?.cashflowStatements ?? []
      : result.cashflowStatementHistoryQuarterly?.cashflowStatements ?? [];

    const incomeStatement = incomeHistory.map((item) => ({
      date: item.endDate instanceof Date ? item.endDate.toISOString().split("T")[0] : String(item.endDate ?? ""),
      data: mapKeys(item as unknown as Record<string, unknown>, incomeStatementKeyMap),
    }));

    const balanceSheet = balanceHistory.map((item) => ({
      date: item.endDate instanceof Date ? item.endDate.toISOString().split("T")[0] : String(item.endDate ?? ""),
      data: mapKeys(item as unknown as Record<string, unknown>, balanceSheetKeyMap),
    }));

    const cashFlow = cashHistory.map((item) => ({
      date: item.endDate instanceof Date ? item.endDate.toISOString().split("T")[0] : String(item.endDate ?? ""),
      data: mapKeys(item as unknown as Record<string, unknown>, cashFlowKeyMap),
    }));

    res.json({ symbol, period, incomeStatement, balanceSheet, cashFlow });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch financials");
    res.status(500).json({ error: "server_error", message: "Failed to fetch financials" });
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

    const edgarSearchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&dateRange=custom&startdt=2020-01-01&forms=10-K,10-Q,8-K,DEF%2014A,S-1,4`;
    const cikLookupUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(longName)}&type=&dateb=&owner=include&count=10&search_text=&action=getcompany`;

    const cikResponse = await fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&forms=10-K&dateRange=custom&startdt=2023-01-01`);
    let cik: string | null = null;
    let filings: {id: string; type: string; description: string; filedAt: string; url: string; documentUrl: string | null}[] = [];

    if (cikResponse.ok) {
      const searchData = await cikResponse.json() as {
        hits?: {
          hits?: Array<{
            _source?: {
              entity_id?: string;
              file_date?: string;
              form_type?: string;
              display_date_filed?: string;
              period_of_report?: string;
              file_num?: string;
              entity_name?: string;
            };
            _id?: string;
          }>;
        };
      };
      const hits = searchData?.hits?.hits ?? [];
      if (hits.length > 0 && hits[0]._source?.entity_id) {
        cik = hits[0]._source.entity_id;
      }
    }

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
              return {
                id: f.id,
                type: f.type,
                description: f.description,
                filedAt: f.filedAt,
                url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(f.type)}&dateb=&owner=include&count=40`,
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

export default router;
