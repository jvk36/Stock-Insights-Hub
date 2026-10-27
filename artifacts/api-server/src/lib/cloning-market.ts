import YahooFinance from "yahoo-finance2";
import { db, modelPortfoliosTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { MomentumMarket } from "./momentum-engine";
import type { Action } from "./model-portfolio-engine";
import { completedThrough, marketDate, undoFutureSplits } from "./model-portfolio-market";
import { logger } from "./logger";
import { canonicalTicker } from "./cloning-selection";
import { CLONING_SETTLEMENTS, WBD_VERIFIED_CLOSES, type CashSettlement } from "./cloning-corporate-actions";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
const VERSION = 2;
type SymbolHistory = { version: number; at: string; prices: Record<string, number>; actions: Action[]; issue: string | null; issuer: string };
export type CloningMarket = MomentumMarket & { issues: Record<string, string>; issuers: Record<string, string>; settlements: CashSettlement[] };

export function emptyCloningMarket(now = new Date()): CloningMarket {
  return { observedAt: now.toISOString(), targetDate: completedThrough(now), prices: {}, adjusted: {}, actions: [], live: {}, issues: {}, issuers: {}, settlements: CLONING_SETTLEMENTS };
}
export async function addCloningSymbols(market: CloningMarket, symbols: string[], now = new Date()) {
  const tickers = [...new Set(symbols.filter(Boolean).map(canonicalTicker))]
    .filter((ticker) => !(ticker in market.prices));
  if (!tickers.length) return;
  const rows = await db.select().from(modelPortfoliosTable)
    .where(inArray(modelPortfoliosTable.slug, tickers.map((t) => `cloning-price:${t}`)));
  const stored = new Map(rows.map((r) => [r.slug, r.state as SymbolHistory]));
  for (let i = 0; i < tickers.length; i += 4) {
    await Promise.all(tickers.slice(i, i + 4).map(async (ticker) => {
      const slug = `cloning-price:${ticker}`;
      const cached = stored.get(slug);
      const ttl = cached?.issue ? 15 * 60_000 : 24 * 60 * 60_000;
      let data = cached?.version === VERSION && now.getTime() - Date.parse(cached.at) < ttl
        && completedThrough(new Date(cached.at)) >= market.targetDate ? cached : null;
      if (!data) {
        data = { version: VERSION, at: now.toISOString(), prices: {}, actions: [], issue: null, issuer: "" };
        try {
          // No current quote is used to infer a historical execution price.
          const chart = await yahoo.chart(ticker, {
            period1: new Date("2016-01-01T00:00:00Z"), interval: "1d", events: "div,splits",
          });
          if (canonicalTicker(chart.meta.symbol) !== ticker || chart.meta.currency !== "USD") {
            throw new Error("Provider returned a different security or non-USD price series.");
          }
          data.issuer = chart.meta.longName ?? chart.meta.shortName ?? "";
          const splits: Action[] = (chart.events?.splits ?? []).map((s) => ({
            ticker, date: marketDate(s.date), type: "split", value: Number(s.numerator) / Number(s.denominator),
          }));
          if (splits.some((a) => !Number.isFinite(a.value) || a.value <= 0)) throw new Error("Invalid split data.");
          data.actions = [...splits, ...(chart.events?.dividends ?? []).map((d): Action => ({
            ticker, date: marketDate(d.date), type: "dividend",
            value: undoFutureSplits(d.amount, marketDate(d.date), splits),
          })).filter((a) => Number.isFinite(a.value) && a.value > 0)];
          for (const q of chart.quotes) {
            const date = marketDate(q.date);
            if (date <= market.targetDate && q.close != null && Number.isFinite(q.close) && q.close > 0) {
              data.prices[date] = undoFutureSplits(q.close, date, splits);
            }
          }
          if (!Object.keys(data.prices).length) throw new Error("No verified USD closing prices.");
        } catch (error) {
          data.issue = error instanceof Error ? error.message : "Price history unavailable.";
          logger.warn({ ticker, issue: data.issue }, "Cloning price coverage unavailable");
        }
        // Cache failures briefly, too; concurrent page loads must not flood Yahoo.
        await db.insert(modelPortfoliosTable).values({ slug, state: data })
          .onConflictDoUpdate({ target: modelPortfoliosTable.slug, set: { state: data, updatedAt: now } });
      }
      market.prices[ticker] = data.prices;
      if (ticker === "WBD") {
        market.prices.WBD = { ...data.prices, ...Object.fromEntries(
          Object.entries(WBD_VERIFIED_CLOSES).filter(([date]) => date <= market.targetDate),
        ) };
      }
      market.issuers[ticker] = data.issuer;
      market.actions.push(...data.actions);
      if (data.issue) market.issues[ticker] = data.issue;
    }));
  }
}

// A recycled or incorrectly mapped ticker can have perfectly valid prices for
// an entirely different issuer. Never use those prices just because USD matches.
export function compatibleIssuer(filedName: string, priceName: string): boolean {
  const aliases = (s: string) => s.toUpperCase().replace(/FACEBOOK/g, "META").replace(/GOOGLE/g, "ALPHABET").replace(/YANDEX/g, "NEBIUS");
  const words = (s: string) => aliases(s).replace(/[^A-Z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !["THE", "INC", "CORP", "LTD", "PLC", "CLASS", "COM", "COMMON", "HOLDINGS", "HLDGS", "GROUP", "COMPANY", "CORPORATION", "LIMITED", "NEW", "DEL", "ETF", "TRUST", "SERIES", "INTERNATIONAL", "CL"].includes(w));
  const a = words(filedName), b = words(priceName);
  return a.some((word) => b.some((other) => word === other || (Math.min(word.length, other.length) >= 5 && (word.startsWith(other) || other.startsWith(word)))));
}
