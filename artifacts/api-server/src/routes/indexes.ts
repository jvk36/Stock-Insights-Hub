import { Router } from "express";
import * as cheerio from "cheerio";
import { logger } from "../lib/logger";

const router = Router();

export interface Sp500Stock {
  symbol: string;
  name: string;
  sector: string;
}

interface CacheEntry {
  stocks: Sp500Stock[];
  fetchedAt: number;
}

let sp500Cache: CacheEntry | null = null;
let revalidating = false;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — index rarely changes

async function scrapeSp500(): Promise<Sp500Stock[]> {
  const res = await fetch("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockResearchBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const stocks: Sp500Stock[] = [];

  // First .wikitable on the page is the constituents table
  // Columns: Symbol | Security | GICS Sector | GICS Sub-Industry | HQ | Date added | CIK | Founded
  $(".wikitable").first().find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const symbol = $(cells[0]).text().trim().replace(/\s+/g, "");
    const name = $(cells[1]).text().trim();
    const sector = $(cells[2]).text().trim();

    if (symbol && name) {
      stocks.push({ symbol, name, sector });
    }
  });

  return stocks;
}

function revalidateInBackground() {
  if (revalidating) return;
  revalidating = true;
  scrapeSp500()
    .then((stocks) => {
      sp500Cache = { stocks, fetchedAt: Date.now() };
      logger.info("S&P 500 cache revalidated in background");
    })
    .catch((err) => {
      logger.error({ err }, "Background S&P 500 revalidation failed — keeping stale cache");
    })
    .finally(() => {
      revalidating = false;
    });
}

router.get("/indexes/sp500", async (req, res) => {
  try {
    const now = Date.now();
    const isStale = sp500Cache && now - sp500Cache.fetchedAt >= CACHE_TTL_MS;

    // Case 1: Cache is fresh — instant response
    if (sp500Cache && !isStale) {
      return res.json({
        stocks: sp500Cache.stocks,
        fetchedAt: new Date(sp500Cache.fetchedAt).toISOString(),
        cached: true,
        stale: false,
      });
    }

    // Case 2: Cache is stale — serve old data immediately, revalidate in background
    if (sp500Cache && isStale) {
      revalidateInBackground();
      return res.json({
        stocks: sp500Cache.stocks,
        fetchedAt: new Date(sp500Cache.fetchedAt).toISOString(),
        cached: true,
        stale: true,
      });
    }

    // Case 3: No cache at all (cold start) — block once
    const stocks = await scrapeSp500();
    sp500Cache = { stocks, fetchedAt: Date.now() };
    return res.json({
      stocks,
      fetchedAt: new Date(sp500Cache.fetchedAt).toISOString(),
      cached: false,
      stale: false,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to scrape S&P 500 list from Wikipedia");
    return res.status(502).json({ error: "Failed to fetch S&P 500 data" });
  }
});

export default router;
