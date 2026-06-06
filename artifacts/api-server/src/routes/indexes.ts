import { Router, type Request, type Response } from "express";
import * as cheerio from "cheerio";
import { logger } from "../lib/logger";

const router = Router();

export interface IndexStock {
  symbol: string;
  name: string;
  sector: string;
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function fetchWikiHtml(url: string): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockResearchBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Wikipedia fetch failed ${res.status}: ${url}`);
  return cheerio.load(await res.text());
}

/** Returns the first .wikitable that appears after a heading containing `text`. */
function tableAfterHeading($: cheerio.CheerioAPI, text: string) {
  let $table: ReturnType<typeof $> | null = null;
  $("h2, h3").each((_, el) => {
    if ($table) return; // already found — skip remaining headings
    if ($(el).text().includes(text)) {
      const $t = $(el).nextAll("table.wikitable").first();
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
      return res.status(502).json({ error: `Failed to fetch ${label} data` });
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
// Table: under "Components" heading — cols: Company[0] | Ticker[1] | GICS Sector[2]

const nasdaq100Cache: IndexCache = { data: null, revalidating: false };

async function scrapeNasdaq100(): Promise<IndexStock[]> {
  const $ = await fetchWikiHtml("https://en.wikipedia.org/wiki/Nasdaq-100");
  const stocks: IndexStock[] = [];
  const $table = tableAfterHeading($, "Components") ?? $(".wikitable").first();
  $table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const name   = $(cells[0]).text().trim();
    const symbol = $(cells[1]).text().trim().replace(/\s+/g, "");
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
  $table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;
    const name   = $(cells[0]).text().trim();
    const symbol = $(cells[2]).text().trim().replace(/\s+/g, "");
    const sector = cells.length >= 4 ? $(cells[3]).text().trim() : "";
    if (symbol && name) stocks.push({ symbol, name, sector });
  });
  return stocks;
}

router.get("/indexes/djia", makeRoute(djiaCache, scrapeDjia, "DJIA"));

export default router;
