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
  GetEarningsHistoryParams,
  GetInsiderTransactionsParams,
  GetStockFundamentalsParams,
  GetStockAnalysisParams,
  GetStockModelsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const yahooFinance = new YahooFinance();

// Simple in-process CIK cache (symbol → CIK string) to avoid repeat EDGAR lookups
const cikCache = new Map<string, string>();

async function lookupCik(symbol: string): Promise<string | null> {
  if (cikCache.has(symbol)) return cikCache.get(symbol)!;
  try {
    const resp = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&forms=10-K&dateRange=custom&startdt=2023-01-01`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { hits?: { hits?: Array<{ _source?: { ciks?: string[]; entity_id?: string } }> } };
    const rawCik = data?.hits?.hits?.[0]?._source?.ciks?.[0]
      ?? data?.hits?.hits?.[0]?._source?.entity_id;
    const cik = rawCik ? rawCik.replace(/^0+/, "") : null;
    if (cik) cikCache.set(symbol, cik);
    return cik;
  } catch {
    return null;
  }
}

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
      logoUrl: profile?.website ? `https://logo.clearbit.com/${profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : null,
    });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch profile");
    res.status(500).json({ error: "server_error", message: "Failed to fetch profile" });
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

    res.json({ symbol, period, incomeStatement, balanceSheet, cashFlow });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch financials");
    res.status(500).json({ error: "server_error", message: "Failed to fetch financials" });
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
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ["earningsHistory", "price"],
    });

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
              }>;
            };
          };
          const sharesData = factsData?.units?.["USD/shares"] ?? [];
          // Only take entries with a quarterly frame tag (CY2024Q1, CY2023Q3, etc.)
          const quarterly = sharesData
            .filter((e) => (e.form === "10-Q" || e.form === "10-K") && e.frame && /^CY\d{4}Q\d$/.test(e.frame))
            .map((e) => ({
              date: e.end,
              epsActual: e.val,
              epsEstimate: null as null,
            }));

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

// Simple XML cache to avoid refetching the same Form 4 on repeated API calls
const form4Cache = new Map<string, string | null>();

async function fetchForm4(cik: string, accession: string): Promise<string | null> {
  const cacheKey = `${cik}:${accession}`;
  if (form4Cache.has(cacheKey)) return form4Cache.get(cacheKey)!;

  const accFormatted = accession.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accFormatted}/form4.xml`;

  const doFetch = async (): Promise<Response> =>
    fetch(url, {
      headers: { "User-Agent": "research-tool admin@example.com" },
      signal: AbortSignal.timeout(8000),
    });

  try {
    let resp = await doFetch();
    // Retry once on rate-limit after a brief pause
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      resp = await doFetch();
    }
    if (!resp.ok) {
      form4Cache.set(cacheKey, null);
      return null;
    }
    const text = await resp.text();
    if (!text.includes("<ownershipDocument>")) {
      form4Cache.set(cacheKey, null);
      return null;
    }
    form4Cache.set(cacheKey, text);
    return text;
  } catch {
    form4Cache.set(cacheKey, null);
    return null;
  }
}

function parseForm4(xml: string, accession: string, cik: string) {
  const accFormatted = accession.replace(/-/g, "");
  const formUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accFormatted}/`;

  // Reporting owner details
  const insiderName = xmlTagValue(xml, "rptOwnerName") ?? "Unknown";
  const isDirector = xmlTagValue(xml, "isDirector") === "true" || xmlTagValue(xml, "isDirector") === "1";
  const isOfficer = xmlTagValue(xml, "isOfficer") === "true" || xmlTagValue(xml, "isOfficer") === "1";
  const isTenPercentOwner = xmlTagValue(xml, "isTenPercentOwner") === "true" || xmlTagValue(xml, "isTenPercentOwner") === "1";
  const officerTitle = xmlTagValue(xml, "officerTitle") || null;
  const is10b51Plan = xmlTagValue(xml, "aff10b5One") === "true" || xmlTagValue(xml, "aff10b5One") === "1";

  // Skip if pure 10% owner with no officer/director role (passive institutional)
  if (isTenPercentOwner && !isDirector && !isOfficer) return [];

  const transactions: object[] = [];

  // Parse nonDerivativeTransaction blocks
  const nonDerivBlocks = xmlBlocks(xml, "nonDerivativeTransaction");
  for (const [idx, block] of nonDerivBlocks.entries()) {
    // Get date from <transactionDate><value>
    const dateBlock = block.match(/<transactionDate>[^]*?<\/transactionDate>/i)?.[0] ?? "";
    const date = xmlTagValue(dateBlock, "value") ?? xmlTagValue(xml, "periodOfReport") ?? "";

    const codeBlock = block.match(/<transactionCoding>[^]*?<\/transactionCoding>/i)?.[0] ?? "";
    const transactionCode = xmlTagValue(codeBlock, "transactionCode") ?? "";

    const amountsBlock = block.match(/<transactionAmounts>[^]*?<\/transactionAmounts>/i)?.[0] ?? "";
    const sharesBlock = amountsBlock.match(/<transactionShares>[^]*?<\/transactionShares>/i)?.[0] ?? "";
    const sharesVal = xmlTagValue(sharesBlock, "value");
    const shares = sharesVal ? parseFloat(sharesVal) : null;

    const priceBlock = amountsBlock.match(/<transactionPricePerShare>[^]*?<\/transactionPricePerShare>/i)?.[0] ?? "";
    const priceVal = xmlTagValue(priceBlock, "value");
    const pricePerShare = priceVal ? parseFloat(priceVal) : null;

    const ownershipBlock = block.match(/<ownershipNature>[^]*?<\/ownershipNature>/i)?.[0] ?? "";
    const ownershipTypeBlock = ownershipBlock.match(/<directOrIndirectOwnership>[^]*?<\/directOrIndirectOwnership>/i)?.[0] ?? "";
    const ownership = xmlTagValue(ownershipTypeBlock, "value") ?? "D";
    const natureBlock = ownershipBlock.match(/<natureOfOwnership>[^]*?<\/natureOfOwnership>/i)?.[0] ?? "";
    const natureOfOwnership = xmlTagValue(natureBlock, "value") || null;

    const totalValue = shares && pricePerShare ? shares * pricePerShare : null;
    const info = TX_CODE_MAP[transactionCode] ?? { type: `Code ${transactionCode}`, signal: "none" };

    transactions.push({
      id: `${accession}-nd-${idx}`,
      date,
      insiderName,
      title: officerTitle,
      isDirector,
      isOfficer,
      isTenPercentOwner,
      transactionCode,
      transactionType: info.type,
      signalLevel: info.signal,
      shares,
      pricePerShare,
      totalValue,
      ownership,
      natureOfOwnership,
      is10b51Plan,
      accessionNumber: accession,
      formUrl,
    });
  }

  // Parse derivativeTransaction blocks (options/RSUs)
  const derivBlocks = xmlBlocks(xml, "derivativeTransaction");
  for (const [idx, block] of derivBlocks.entries()) {
    const dateBlock = block.match(/<transactionDate>[^]*?<\/transactionDate>/i)?.[0] ?? "";
    const date = xmlTagValue(dateBlock, "value") ?? xmlTagValue(xml, "periodOfReport") ?? "";

    const codeBlock = block.match(/<transactionCoding>[^]*?<\/transactionCoding>/i)?.[0] ?? "";
    const transactionCode = xmlTagValue(codeBlock, "transactionCode") ?? "";

    const amountsBlock = block.match(/<transactionAmounts>[^]*?<\/transactionAmounts>/i)?.[0] ?? "";
    const sharesBlock = amountsBlock.match(/<transactionShares>[^]*?<\/transactionShares>/i)?.[0] ?? "";
    const sharesVal = xmlTagValue(sharesBlock, "value");
    const shares = sharesVal ? parseFloat(sharesVal) : null;

    const priceBlock = amountsBlock.match(/<transactionPricePerShare>[^]*?<\/transactionPricePerShare>/i)?.[0] ?? "";
    const priceVal = xmlTagValue(priceBlock, "value");
    const pricePerShare = priceVal ? parseFloat(priceVal) : null;

    const ownershipBlock = block.match(/<ownershipNature>[^]*?<\/ownershipNature>/i)?.[0] ?? "";
    const ownershipTypeBlock = ownershipBlock.match(/<directOrIndirectOwnership>[^]*?<\/directOrIndirectOwnership>/i)?.[0] ?? "";
    const ownership = xmlTagValue(ownershipTypeBlock, "value") ?? "D";
    const natureBlock = ownershipBlock.match(/<natureOfOwnership>[^]*?<\/natureOfOwnership>/i)?.[0] ?? "";
    const natureOfOwnership = xmlTagValue(natureBlock, "value") || null;

    const totalValue = shares && pricePerShare ? shares * pricePerShare : null;
    const info = TX_CODE_MAP[transactionCode] ?? { type: `Code ${transactionCode}`, signal: "none" };

    transactions.push({
      id: `${accession}-d-${idx}`,
      date,
      insiderName,
      title: officerTitle,
      isDirector,
      isOfficer,
      isTenPercentOwner,
      transactionCode: transactionCode || "?",
      transactionType: info.type,
      signalLevel: info.signal,
      shares,
      pricePerShare,
      totalValue,
      ownership,
      natureOfOwnership,
      is10b51Plan,
      accessionNumber: accession,
      formUrl,
    });
  }

  return transactions;
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

  try {
    // ── Step 1: Yahoo Finance insiderTransactions (primary source, no rate limits) ──
    const [yfResult, cik] = await Promise.all([
      yahooFinance.quoteSummary(symbol, { modules: ["insiderTransactions"] }).catch(() => null),
      lookupCik(symbol),
    ]);

    const yfTxs = yfResult?.insiderTransactions?.transactions ?? [];

    // ── Step 2: If YF returns data, transform it ─────────────────────────────
    if (yfTxs.length > 0) {
      const edgarSearchBase = cik
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=40`
        : `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&forms=4`;

      const transactions = yfTxs
        .map((tx, idx) => {
          const txText = String(tx.transactionText ?? "");
          const relation = String(tx.filerRelation ?? "");
          const { isDirector, isOfficer, isTenPercentOwner } = parseRelation(relation);

          // Filter: exclude pure 10% passive owners
          if (isTenPercentOwner && !isDirector && !isOfficer) return null;

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
            is10b51Plan: false,
            accessionNumber: "",
            formUrl,
          };
        })
        .filter(Boolean);

      res.json({ symbol, cik, transactions });
      return;
    }

    // ── Step 3: Fallback – attempt SEC EDGAR Form 4 XML parsing ──────────────
    if (!cik) {
      res.json({ symbol, cik: null, transactions: [] });
      return;
    }

    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
    const submResp = await fetch(submissionsUrl, {
      headers: { "User-Agent": "research-tool admin@example.com" },
      signal: AbortSignal.timeout(8000),
    });
    if (!submResp.ok) {
      res.json({ symbol, cik, transactions: [] });
      return;
    }

    const submData = await submResp.json() as {
      filings?: {
        recent?: {
          form?: string[];
          accessionNumber?: string[];
          filingDate?: string[];
        };
      };
    };

    const recent = submData?.filings?.recent ?? {};
    const forms = recent.form ?? [];
    const accessions = recent.accessionNumber ?? [];
    const filingDates = recent.filingDate ?? [];

    const form4Entries: Array<{ accession: string; date: string }> = [];
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === "4" && accessions[i]) {
        form4Entries.push({ accession: accessions[i], date: filingDates[i] ?? "" });
        if (form4Entries.length >= 20) break;
      }
    }

    const CONCURRENCY = 3;
    const allTransactions: object[] = [];
    for (let i = 0; i < form4Entries.length; i += CONCURRENCY) {
      if (i > 0) await new Promise((r) => setTimeout(r, 400));
      const batch = form4Entries.slice(i, i + CONCURRENCY);
      const xmls = await Promise.all(batch.map((e) => fetchForm4(cik, e.accession)));
      for (let j = 0; j < batch.length; j++) {
        const xml = xmls[j];
        if (!xml) continue;
        allTransactions.push(...parseForm4(xml, batch[j].accession, cik));
      }
    }

    allTransactions.sort((a, b) =>
      (b as { date: string }).date.localeCompare((a as { date: string }).date)
    );

    res.json({ symbol, cik, transactions: allTransactions.slice(0, 150) });
  } catch (err: unknown) {
    req.log.error({ err, symbol }, "Failed to fetch insider transactions");
    res.status(500).json({ error: "server_error", message: "Failed to fetch insider transactions" });
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
