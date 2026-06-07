import { Router, type Request, type Response } from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as cheerio from "cheerio";
import YahooFinance from "yahoo-finance2";
import { logger } from "../lib/logger";

const yahooFinance = new YahooFinance();

const router = Router();

export interface IndexStock {
  symbol: string;
  name: string;
  sector: string;
  industry?: string;
}

interface CacheEntry {
  stocks: IndexStock[];
  fetchedAt: number;
}

interface IndexCache {
  data: CacheEntry | null;
  revalidating: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Metrics disk-cache helpers ───────────────────────────────────────────────

const METRICS_CACHE_DIR = join(process.cwd(), "data");

/** Tracks which indexes have already had their disk-cache load attempted this process. */
const diskLoadAttempted = new Set<string>();

/**
 * Tries to populate `indexMetricsCache[indexId]` from the corresponding JSON
 * file on disk. Runs at most once per index per process lifetime.
 * Fresh = age < 24 h → ready immediately (no enrichment needed).
 * Stale = age ≥ 24 h → loaded so it can be served while background
 *                       re-enrichment runs, same as the in-memory stale path.
 * Missing / corrupt → silently skipped; normal cold-start enrichment takes over.
 */
async function tryLoadFromDisk(indexId: string): Promise<void> {
  if (diskLoadAttempted.has(indexId)) return;
  diskLoadAttempted.add(indexId);
  try {
    const filePath = join(METRICS_CACHE_DIR, `metrics-${indexId}.json`);
    const raw      = await readFile(filePath, "utf8");
    const entry    = JSON.parse(raw) as MetricsCacheEntry;
    const ageMin   = Math.round((Date.now() - entry.fetchedAt) / 60_000);
    const mc       = indexMetricsCache[indexId];
    mc.data  = entry;
    mc.ready = true;
    if (Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
      logger.info(`Loaded fresh metrics cache from disk for ${indexId} (age ${ageMin} min)`);
    } else {
      logger.info(`Loaded stale metrics cache from disk for ${indexId} (age ${ageMin} min) — revalidation will follow`);
    }
  } catch {
    // File absent or corrupt — silently skip; enrichment handles the cold start
  }
}

/**
 * Writes `entry` atomically to disk via a temp-file-then-rename pattern so a
 * concurrent read never sees a partial file.  Write errors are non-fatal and
 * only logged as warnings — they must never propagate to the caller.
 */
async function saveMetricsCacheToDisk(indexId: string, entry: MetricsCacheEntry): Promise<void> {
  try {
    await mkdir(METRICS_CACHE_DIR, { recursive: true });
    const filePath = join(METRICS_CACHE_DIR, `metrics-${indexId}.json`);
    const tmpPath  = `${filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(entry), "utf8");
    await rename(tmpPath, filePath);
    logger.info(`Metrics cache written to disk for ${indexId}`);
  } catch (err) {
    logger.warn({ err }, `Failed to write metrics cache for ${indexId} — continuing`);
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function fetchWikiHtml(url: string): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockResearchBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Wikipedia fetch failed ${res.status}: ${url}`);
  return cheerio.load(await res.text());
}

/**
 * Returns the first .wikitable after a heading whose text includes `text`.
 * Handles both old flat Wikipedia markup (<h2> as direct sibling of table)
 * and the newer wrapped markup (<div class="mw-heading"><h2>…</h2></div>
 * as sibling of the table) by falling back to the parent element's nextAll.
 */
function tableAfterHeading($: cheerio.CheerioAPI, text: string) {
  let $table: ReturnType<typeof $> | null = null;
  $("h2, h3").each((_, el) => {
    if ($table) return; // already found
    if ($(el).text().includes(text)) {
      // Try the heading itself first (old flat markup)
      let $t = $(el).nextAll("table.wikitable").first();
      // Fall back to parent wrapper div (new mw-heading markup)
      if (!$t.length) $t = $(el).parent().nextAll("table.wikitable").first();
      if ($t.length) $table = $t;
    }
  });
  return $table;
}

/** Stale-while-revalidate route factory. */
function makeRoute(
  cache: IndexCache,
  scraper: () => Promise<IndexStock[]>,
  label: string,
  errorStatus = 502,
) {
  return async (req: Request, res: Response) => {
    try {
      const now = Date.now();
      const isStale = cache.data != null && now - cache.data.fetchedAt >= CACHE_TTL_MS;

      // Case 1: Fresh cache — instant response
      if (cache.data && !isStale) {
        return res.json({
          stocks: cache.data.stocks,
          fetchedAt: new Date(cache.data.fetchedAt).toISOString(),
          cached: true,
          stale: false,
        });
      }

      // Case 2: Stale cache — serve old data immediately, revalidate in background
      if (cache.data && isStale) {
        if (!cache.revalidating) {
          cache.revalidating = true;
          scraper()
            .then((stocks) => {
              cache.data = { stocks, fetchedAt: Date.now() };
              logger.info(`${label} cache revalidated in background`);
            })
            .catch((err) => {
              logger.error({ err }, `${label} background revalidation failed — keeping stale cache`);
            })
            .finally(() => {
              cache.revalidating = false;
            });
        }
        return res.json({
          stocks: cache.data.stocks,
          fetchedAt: new Date(cache.data.fetchedAt).toISOString(),
          cached: true,
          stale: true,
        });
      }

      // Case 3: Cold start — block once, then respond
      const stocks = await scraper();
      cache.data = { stocks, fetchedAt: Date.now() };
      return res.json({
        stocks,
        fetchedAt: new Date(cache.data.fetchedAt).toISOString(),
        cached: false,
        stale: false,
      });
    } catch (err) {
      req.log.error({ err }, `Failed to fetch ${label} data`);
      return res.status(errorStatus).json({ error: `Failed to fetch ${label} data` });
    }
  };
}

// ─── S&P 500 ──────────────────────────────────────────────────────────────────
// Source: https://en.wikipedia.org/wiki/List_of_S%26P_500_companies
// Table: first .wikitable — cols: Symbol[0] | Security[1] | GICS Sector[2]

const sp500Cache: IndexCache = { data: null, revalidating: false };

async function scrapeSp500(): Promise<IndexStock[]> {
  const $ = await fetchWikiHtml("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies");
  const stocks: IndexStock[] = [];
  $(".wikitable").first().find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;
    const symbol = $(cells[0]).text().trim().replace(/\s+/g, "");
    const name   = $(cells[1]).text().trim();
    const sector = $(cells[2]).text().trim();
    if (symbol && name) stocks.push({ symbol, name, sector });
  });
  return stocks;
}

router.get("/indexes/sp500", makeRoute(sp500Cache, scrapeSp500, "S&P 500"));

// ─── Nasdaq-100 ───────────────────────────────────────────────────────────────
// Source: https://en.wikipedia.org/wiki/Nasdaq-100
// Table: under "Current components" heading — cols: Company[0] | Ticker[1] | GICS Sector[2]

const nasdaq100Cache: IndexCache = { data: null, revalidating: false };

async function scrapeNasdaq100(): Promise<IndexStock[]> {
  const $ = await fetchWikiHtml("https://en.wikipedia.org/wiki/Nasdaq-100");
  const stocks: IndexStock[] = [];
  const $table = tableAfterHeading($, "Current components") ?? $(".wikitable").first();
  // Headers: Ticker[0] | Company[1] | ICB Industry[2] | ICB Subsector[3]
  $table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const symbol = $(cells[0]).text().trim().replace(/\s+/g, "");
    const name   = $(cells[1]).text().trim();
    const sector = cells.length >= 3 ? $(cells[2]).text().trim() : "";
    if (symbol && name) stocks.push({ symbol, name, sector });
  });
  return stocks;
}

router.get("/indexes/nasdaq100", makeRoute(nasdaq100Cache, scrapeNasdaq100, "Nasdaq-100"));

// ─── S&P MidCap 400 ───────────────────────────────────────────────────────────
// Source: https://en.wikipedia.org/wiki/List_of_S%26P_400_companies
// Table: under heading starting with "S&P" — cols: Symbol[0] | Security[1] | GICS Sector[2]

const sp400Cache: IndexCache = { data: null, revalidating: false };

async function scrapeSp400(): Promise<IndexStock[]> {
  const $ = await fetchWikiHtml("https://en.wikipedia.org/wiki/List_of_S%26P_400_companies");
  const stocks: IndexStock[] = [];
  const $table = tableAfterHeading($, "S&P") ?? $(".wikitable").first();
  $table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;
    const symbol = $(cells[0]).text().trim().replace(/\s+/g, "");
    const name   = $(cells[1]).text().trim();
    const sector = $(cells[2]).text().trim();
    if (symbol && name) stocks.push({ symbol, name, sector });
  });
  return stocks;
}

router.get("/indexes/sp400", makeRoute(sp400Cache, scrapeSp400, "S&P MidCap 400"));

// ─── S&P SmallCap 600 ─────────────────────────────────────────────────────────
// Source: https://en.wikipedia.org/wiki/List_of_S%26P_600_companies
// Table: under heading starting with "S&P" — cols: Symbol[0] | Security[1] | GICS Sector[2]

const sp600Cache: IndexCache = { data: null, revalidating: false };

async function scrapeSp600(): Promise<IndexStock[]> {
  const $ = await fetchWikiHtml("https://en.wikipedia.org/wiki/List_of_S%26P_600_companies");
  const stocks: IndexStock[] = [];
  const $table = tableAfterHeading($, "S&P") ?? $(".wikitable").first();
  $table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;
    const symbol = $(cells[0]).text().trim().replace(/\s+/g, "");
    const name   = $(cells[1]).text().trim();
    const sector = $(cells[2]).text().trim();
    if (symbol && name) stocks.push({ symbol, name, sector });
  });
  return stocks;
}

router.get("/indexes/sp600", makeRoute(sp600Cache, scrapeSp600, "S&P SmallCap 600"));

// ─── Dow Jones Industrial Average ─────────────────────────────────────────────
// Source: https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average
// Table: under "Components" heading — cols: Company[0] | Exchange[1] | Symbol[2] | Industry[3]

const djiaCache: IndexCache = { data: null, revalidating: false };

async function scrapeDjia(): Promise<IndexStock[]> {
  const $ = await fetchWikiHtml("https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average");
  const stocks: IndexStock[] = [];
  const $table = tableAfterHeading($, "Components") ?? $(".wikitable").first();
  // Row structure: <th>Company</th> <td>Exchange</td> <td>Symbol</td> <td>Sector</td> <td>Date</td>
  // Company is in a th element; find("td") gives: Exchange[0] | Symbol[1] | Sector[2] | Date[3]
  $table.find("tbody tr").each((_, row) => {
    const $row  = $(row);
    const cells = $row.find("td");
    if (cells.length < 2) return;
    const name   = $row.find("th").first().text().trim();
    const symbol = $(cells[1]).text().trim().replace(/\s+/g, "");
    const sector = cells.length >= 3 ? $(cells[2]).text().trim() : "";
    if (symbol && name) stocks.push({ symbol, name, sector });
  });
  return stocks;
}

router.get("/indexes/djia", makeRoute(djiaCache, scrapeDjia, "DJIA"));

// ─── Top ADRs ─────────────────────────────────────────────────────────────────
// Source: BNY Mellon DR Directory API (https://www.adrbny.com/directory/dr-directory.html)
// Fetches all sponsored ADRs, then keeps only those listed on NYSE / NASDAQ / NYSE American.
// The API returns a double-JSON-encoded string — JSON.parse() must be called twice.

const ADRS_EXCHANGES = new Set([
  "New York Stock Exchange",
  "NASDAQ Stock Market",
  "NYSE American LLC",
]);

const adrsCache: IndexCache = { data: null, revalidating: false };

interface BnyDrRecord {
  drTicker: string;
  drTx: string;
  ctryNm: string;
  instRgnNm: string;
  indstryTx: string;
  drExchange: string;
}

async function fetchAdrs(): Promise<IndexStock[]> {
  const url =
    "https://www.adrbny.com/bin/adr/export/drDirectoryList" +
    "?sponsorship=S&drPage=directory&count=2000&start=0" +
    "&region=&countryCode=&industryCode=&depositaryBank=&capitalRaised=&letter=&exchange=";

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockResearchBot/1.0)" },
  });
  if (!res.ok) throw new Error(`BNY DR Directory API error ${res.status}`);

  // The API returns a JSON string that itself contains a JSON string
  const outer = await res.text();
  const inner: unknown = JSON.parse(outer);
  const data = JSON.parse(inner as string) as {
    count: number;
    data?: { drdirectory?: BnyDrRecord[] };
  };

  const records: BnyDrRecord[] = data?.data?.drdirectory ?? [];

  const stocks: IndexStock[] = [];
  for (const r of records) {
    if (!ADRS_EXCHANGES.has(r.drExchange)) continue;
    const symbol = (r.drTicker ?? "").trim();
    const name   = (r.drTx ?? "").trim().replace(/^\^/, ""); // strip leading ^
    const sector   = (r.ctryNm ?? r.instRgnNm ?? "").trim(); // country as grouping
    const industry = (r.indstryTx ?? "").trim() || undefined;
    if (symbol && name) stocks.push({ symbol, name, sector, industry });
  }

  // Deduplicate by symbol (same ADR can rarely appear on both exchanges)
  const seen = new Set<string>();
  return stocks.filter((s) => {
    if (seen.has(s.symbol)) return false;
    seen.add(s.symbol);
    return true;
  });
}

router.get("/indexes/adrs", makeRoute(adrsCache, fetchAdrs, "Top ADRs", 503));

// ─── Per-index metrics enrichment ─────────────────────────────────────────────
// Fetches Yahoo Finance quoteSummary for each constituent in the background.
// Results cached 24 h (stale-while-revalidate). Returns metricsReady=false while
// enrichment is in progress so the UI can show a "Computing…" state immediately.

export interface StockMetrics {
  epsGrowth: number;
  pegRatio: number;
  forwardPE: number;
  revenueGrowth: number;
  roe: number;
  netMargin: number;
  debtEquity: number;
  trailingPE: number;
  priceToBook: number;
  evEbitda: number;
  fcfYield: number;
  return52w: number;
  returnVsSp: number;
  return3m: number;
  pctBelowHigh: number;
  roa: number;
  operatingMargin: number;
  grossMargin: number;
  currentRatio: number;
  dividendYield: number;
  payoutRatio: number;
  fiveYrYield: number;
}

// Sentinel defaults applied when Yahoo Finance returns null for a field.
// "High" sentinels (999) make strict value/quality filters fail by default.
const NULL_METRICS: StockMetrics = {
  epsGrowth: 0,
  pegRatio: 999,
  forwardPE: 999,
  revenueGrowth: 0,
  roe: 0,
  netMargin: 0,
  debtEquity: 999,
  trailingPE: 999,
  priceToBook: 999,
  evEbitda: 999,
  fcfYield: 0,
  return52w: 0,
  returnVsSp: 0,
  return3m: 0,
  pctBelowHigh: 100,
  roa: 0,
  operatingMargin: 0,
  grossMargin: 0,
  currentRatio: 0,
  dividendYield: 0,
  payoutRatio: 0,
  fiveYrYield: 0,
};

interface MetricsCacheEntry {
  metrics: Record<string, StockMetrics>;
  fetchedAt: number;
}

interface MetricsCache {
  data: MetricsCacheEntry | null;
  ready: boolean;
  enriching: boolean;
}

const indexMetricsCache: Record<string, MetricsCache> = {
  sp500:     { data: null, ready: false, enriching: false },
  nasdaq100: { data: null, ready: false, enriching: false },
  sp400:     { data: null, ready: false, enriching: false },
  sp600:     { data: null, ready: false, enriching: false },
  djia:      { data: null, ready: false, enriching: false },
  adrs:      { data: null, ready: false, enriching: false },
};

const VALID_INDEX_IDS = Object.keys(indexMetricsCache);

function getStockCacheForIndex(indexId: string): IndexCache | null {
  switch (indexId) {
    case "sp500":     return sp500Cache;
    case "nasdaq100": return nasdaq100Cache;
    case "sp400":     return sp400Cache;
    case "sp600":     return sp600Cache;
    case "djia":      return djiaCache;
    case "adrs":      return adrsCache;
    default:          return null;
  }
}

/** Process items in batches of `batchSize`, running up to batchSize concurrent tasks. */
async function inBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.allSettled(items.slice(i, i + batchSize).map(fn));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMetrics(quote: any): StockMetrics {
  const price   = quote?.price          ?? {};
  const summary = quote?.summaryDetail  ?? {};
  const fin     = quote?.financialData  ?? {};
  const ks      = quote?.defaultKeyStatistics ?? {};
  const trendEntries: Array<{
    period: string;
    growth?: number | null;
    revenueEstimate?: { growth?: number | null };
  }> = quote?.earningsTrend?.trend ?? [];

  const oneYr = trendEntries.find((t) => t.period === "+1y");

  // EPS growth: forward analyst estimate → fallback trailing earningsGrowth
  const epsGrowthRaw = oneYr?.growth != null
    ? oneYr.growth * 100
    : fin.earningsGrowth != null
    ? fin.earningsGrowth * 100
    : 0;

  // Revenue growth: forward analyst estimate → fallback trailing revenueGrowth
  const revenueGrowthRaw = oneYr?.revenueEstimate?.growth != null
    ? oneYr.revenueEstimate.growth * 100
    : fin.revenueGrowth != null
    ? fin.revenueGrowth * 100
    : 0;

  const mktCap  = price.marketCap ?? null;
  const fcf     = fin.freeCashflow ?? null;
  const fcfYieldRaw = fcf != null && mktCap != null && mktCap > 0
    ? (fcf / mktCap) * 100
    : 0;

  const mktPrice = price.regularMarketPrice ?? null;
  const hiVal    = summary.fiftyTwoWeekHigh ?? null;
  const pctBelowHighRaw = mktPrice != null && hiVal != null && hiVal > 0
    ? (1 - mktPrice / hiVal) * 100
    : 100;

  const return52wRaw = ks.fiftyTwoWeekChange != null ? Number(ks.fiftyTwoWeekChange) * 100 : 0;
  const spReturnRaw  = ks.SandP52WeekChange  != null ? Number(ks.SandP52WeekChange)  * 100 : 0;
  const return3mRaw  = ks.threeMonthReturn   != null ? Number(ks.threeMonthReturn)   * 100 : 0;

  // dividendYield: summaryDetail.dividendYield (decimal→%), fallback chain
  const divYieldRaw =
    summary.dividendYield != null && summary.dividendYield > 0
      ? summary.dividendYield * 100
      : summary.trailingAnnualDividendYield != null && summary.trailingAnnualDividendYield > 0
      ? summary.trailingAnnualDividendYield * 100
      : summary.dividendRate != null && summary.dividendRate > 0 && mktPrice != null && mktPrice > 0
      ? (summary.dividendRate / mktPrice) * 100
      : 0;

  const payoutRatioRaw = summary.payoutRatio != null && summary.payoutRatio > 0
    ? summary.payoutRatio * 100
    : 0;

  const fiveYrYieldRaw = summary.fiveYearAvgDividendYield != null
    ? Number(summary.fiveYearAvgDividendYield)
    : 0;

  const fp = (v: number, d = 2) => parseFloat(v.toFixed(d));

  return {
    epsGrowth:       fp(epsGrowthRaw, 1),
    pegRatio:        ks.pegRatio              != null ? fp(Number(ks.pegRatio), 2) : 999,
    forwardPE:       summary.forwardPE        != null ? fp(Number(summary.forwardPE), 1) : 999,
    revenueGrowth:   fp(revenueGrowthRaw, 1),
    roe:             fin.returnOnEquity       != null ? fp(fin.returnOnEquity  * 100, 1) : 0,
    netMargin:       fin.profitMargins        != null ? fp(fin.profitMargins   * 100, 1) : 0,
    debtEquity:      fin.debtToEquity         != null ? fp(fin.debtToEquity   / 100, 3) : 999,
    trailingPE:      summary.trailingPE       != null ? fp(Number(summary.trailingPE), 1) : 999,
    priceToBook:     ks.priceToBook           != null ? fp(Number(ks.priceToBook), 2) : 999,
    evEbitda:        ks.enterpriseToEbitda    != null ? fp(Number(ks.enterpriseToEbitda), 1) : 999,
    fcfYield:        fp(fcfYieldRaw, 2),
    return52w:       fp(return52wRaw, 2),
    returnVsSp:      fp(return52wRaw - spReturnRaw, 2),
    return3m:        fp(return3mRaw, 2),
    pctBelowHigh:    fp(pctBelowHighRaw, 2),
    roa:             fin.returnOnAssets       != null ? fp(fin.returnOnAssets  * 100, 1) : 0,
    operatingMargin: fin.operatingMargins     != null ? fp(fin.operatingMargins * 100, 1) : 0,
    grossMargin:     fin.grossMargins         != null ? fp(fin.grossMargins    * 100, 1) : 0,
    currentRatio:    fin.currentRatio         != null ? fp(Number(fin.currentRatio), 2) : 0,
    dividendYield:   fp(divYieldRaw, 2),
    payoutRatio:     fp(payoutRatioRaw, 1),
    fiveYrYield:     fp(fiveYrYieldRaw, 2),
  };
}

async function enrichIndexMetrics(indexId: string, symbols: string[]): Promise<void> {
  const mc = indexMetricsCache[indexId];
  mc.enriching = true;
  mc.ready = false;
  logger.info(`Starting metrics enrichment for ${indexId} (${symbols.length} symbols)`);

  try {
    const metricsMap: Record<string, StockMetrics> = {};

    await inBatches(symbols, 10, async (symbol) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await yahooFinance.quoteSummary(symbol, {
          modules: ["price", "summaryDetail", "financialData", "defaultKeyStatistics", "earningsTrend"] as any,
        });
        metricsMap[symbol] = extractMetrics(result);
      } catch {
        metricsMap[symbol] = { ...NULL_METRICS };
      }
    });

    mc.data = { metrics: metricsMap, fetchedAt: Date.now() };
    mc.ready = true;
    logger.info(`Metrics enrichment complete for ${indexId}`);
    await saveMetricsCacheToDisk(indexId, mc.data);
  } finally {
    mc.enriching = false;
  }
}

router.get("/indexes/:indexId/metrics", async (req: Request, res: Response) => {
  const indexId = req.params.indexId as string;

  if (!VALID_INDEX_IDS.includes(indexId)) {
    return res.status(404).json({ error: "not_found", message: `Unknown index: ${indexId}` });
  }

  // Seed in-memory cache from disk on first request per index (no-op thereafter)
  await tryLoadFromDisk(indexId);

  const mc  = indexMetricsCache[indexId];
  const now = Date.now();

  // Fresh cache — serve immediately
  if (mc.data && mc.ready && now - mc.data.fetchedAt < CACHE_TTL_MS) {
    return res.json({
      metrics:      mc.data.metrics,
      fetchedAt:    new Date(mc.data.fetchedAt).toISOString(),
      metricsReady: true,
    });
  }

  // Need constituent symbols (from the existing index cache)
  const stockCache = getStockCacheForIndex(indexId);
  const symbols    = stockCache?.data?.stocks.map((s) => s.symbol) ?? [];

  if (symbols.length === 0) {
    // Constituents not loaded yet — return not-ready immediately
    return res.json({ metrics: {}, fetchedAt: new Date().toISOString(), metricsReady: false });
  }

  // Stale but have data — serve stale immediately and revalidate in background
  if (mc.data && mc.ready && now - mc.data.fetchedAt >= CACHE_TTL_MS && !mc.enriching) {
    enrichIndexMetrics(indexId, symbols).catch((err) => {
      logger.error({ err }, `Background metrics revalidation failed for ${indexId}`);
    });
    return res.json({
      metrics:      mc.data.metrics,
      fetchedAt:    new Date(mc.data.fetchedAt).toISOString(),
      metricsReady: true,
    });
  }

  // Cold start or enrichment in progress — fire background enrichment and return not-ready
  if (!mc.enriching) {
    enrichIndexMetrics(indexId, symbols).catch((err) => {
      logger.error({ err }, `Metrics enrichment failed for ${indexId}`);
    });
  }

  return res.json({ metrics: {}, fetchedAt: new Date().toISOString(), metricsReady: false });
});

export default router;
