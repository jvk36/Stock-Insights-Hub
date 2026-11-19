import type { ThirteenFSummary, ThirteenFSummaryPosition, ThirteenFSummaryStock } from "@workspace/api-zod";
import { MISCELLANEOUS_CUSIP } from "./thirteen-f-retention";

export type SummaryHolding = {
  name: string; ticker: string | null; cusip: string; shares: number; marketValue: number;
};
export type SummaryFiling = {
  id: number; fundCik: string; reportDate: string; filingDate: string;
  totalValue: number; holdings: SummaryHolding[];
};
export type SummaryFund = { cik: string; name: string; slug: string };

export function precedingQuarter(date: string): string {
  const year = Number(date.slice(0, 4));
  const ends = [`${year - 1}-12-31`, `${year}-03-31`, `${year}-06-30`, `${year}-09-30`];
  return ends[Math.floor((Number(date.slice(5, 7)) - 1) / 3)]!;
}
function quarterLabel(date: string): string {
  return `Q${Math.ceil(Number(date.slice(5, 7)) / 3)} ${date.slice(0, 4)}`;
}
export function canonicalTicker(value: string | null): string | null {
  const ticker = value?.trim().toUpperCase();
  if (!ticker || ticker === "NOT_FOUND") return null;
  return ticker.replace(/^BRK[.-]([AB])$/, "BRK-$1");
}
function retained(holding: SummaryHolding): boolean {
  return holding.cusip !== MISCELLANEOUS_CUSIP && holding.marketValue >= 0
    && Number.isFinite(holding.marketValue) && holding.shares >= 0 && Number.isFinite(holding.shares);
}

/** Pure, read-only computation. All monetary inputs and outputs are USD, not $000. */
export function build13fSummary(
  funds: SummaryFund[], filings: SummaryFiling[], latestReportDate: string | null,
  generatedAt = new Date().toISOString(),
  positionLimit = 100,
): ThirteenFSummary {
  const previousDate = latestReportDate ? precedingQuarter(latestReportDate) : null;
  const knownFunds = new Set(funds.map(f => f.cik));
  const relevant = filings.filter(f => knownFunds.has(f.fundCik)
    && (f.reportDate === latestReportDate || f.reportDate === previousDate));
  // Use the newest populated record per period. Empty/incomplete imports never
  // substitute for holdings, and previous-quarter snapshots cannot leak forward.
  const selected = new Map<string, SummaryFiling>();
  for (const filing of relevant) {
    if (!filing.holdings.some(retained)) continue;
    const key = `${filing.fundCik}:${filing.reportDate}`;
    const existing = selected.get(key);
    if (!existing || filing.filingDate > existing.filingDate
      || (filing.filingDate === existing.filingDate && filing.id > existing.id)) selected.set(key, filing);
  }

  // Resolve a missing ticker using the same CUSIP in other retained filings, but
  // do not invent a ticker when the stored mappings conflict.
  const tickersByCusip = new Map<string, Set<string>>();
  for (const filing of selected.values()) for (const h of filing.holdings) {
    const ticker = canonicalTicker(h.ticker);
    if (!ticker || !retained(h)) continue;
    const cusip = h.cusip.trim().toUpperCase();
    const tickers = tickersByCusip.get(cusip) ?? new Set<string>();
    tickers.add(ticker); tickersByCusip.set(cusip, tickers);
  }
  const snapshot = (filing: SummaryFiling) => {
    const securities = filing.holdings.filter(retained).sort((a, b) =>
      b.marketValue - a.marketValue || a.name.localeCompare(b.name) || a.cusip.localeCompare(b.cusip));
    const complete = securities.length <= positionLimit && !filing.holdings.some(h => h.cusip === MISCELLANEOUS_CUSIP);
    const positions = new Map<string, SummaryHolding>();
    for (const h of securities.slice(0, positionLimit)) {
      const cusip = h.cusip.trim().toUpperCase();
      const candidates = tickersByCusip.get(cusip);
      const ticker = candidates?.size === 1 ? [...candidates][0]! : canonicalTicker(h.ticker);
      const key = ticker ? `ticker:${ticker}` : `cusip:${cusip}`;
      const existing = positions.get(key);
      if (existing) {
        existing.shares += h.shares;
        existing.marketValue += h.marketValue;
      } else positions.set(key, { ...h, ticker });
    }
    return { positions, complete, retainedCount: Math.min(positionLimit, securities.length) };
  };
  const positions: ThirteenFSummaryPosition[] = [];
  let reportingFundCount = 0, comparisonFundCount = 0, retainedPositionCount = 0;
  const pendingFunds: string[] = [];
  for (const fund of funds) {
    const current = selected.get(`${fund.cik}:${latestReportDate}`);
    if (!current) { pendingFunds.push(fund.name); continue; }
    reportingFundCount++;
    const prior = selected.get(`${fund.cik}:${previousDate}`);
    if (prior) comparisonFundCount++;
    const curr = snapshot(current);
    const prev = prior ? snapshot(prior) : null;
    retainedPositionCount += curr.retainedCount;
    const keys = new Set([...curr.positions.keys(), ...(prev?.positions.keys() ?? [])]);
    for (const key of keys) {
      const c = curr.positions.get(key), p = prev?.positions.get(key);
      // A dropout can be below rank 100 rather than an actual sale. Include the
      // prior holder in drill-downs, but mark its current stake/activity unknown.
      const comparisonKnown = !!prior && (!!c || curr.complete) && (!!p || !!prev?.complete);
      let activity: ThirteenFSummaryPosition["activity"] = "unavailable";
      let buyPct: number | null = null, sellPct: number | null = null;
      if (comparisonKnown && current.totalValue > 0 && prior!.totalValue > 0) {
        const delta = (c?.shares ?? 0) - (p?.shares ?? 0);
        buyPct = 0; sellPct = 0;
        if (delta > 0 && c && c.shares > 0) {
          activity = p ? "increase" : "buy";
          buyPct = (delta / c.shares) * c.marketValue / current.totalValue * 100;
        } else if (delta < 0 && p && p.shares > 0) {
          activity = c ? "decrease" : "sell";
          sellPct = (-delta / p.shares) * p.marketValue / prior!.totalValue * 100;
        } else activity = "unchanged";
      }
      const holding = c ?? p!;
      positions.push({
        securityKey: key, ticker: holding.ticker, name: holding.name,
        fundCik: fund.cik, fundName: fund.name, fundSlug: fund.slug,
        marketValue: c?.marketValue ?? 0, priorMarketValue: p?.marketValue ?? null,
        portfolioPct: c && current.totalValue > 0 ? c.marketValue / current.totalValue * 100 : 0,
        buyPct, sellPct, activity,
      });
    }
  }
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const stockMap = new Map<string, ThirteenFSummaryStock>();
  for (const p of positions) {
    const stock = stockMap.get(p.securityKey) ?? {
      securityKey: p.securityKey, ticker: p.ticker, name: p.name,
      marketValue: 0, portfolioPct: 0, ownershipCount: 0, buyCount: 0, sellCount: 0,
    };
    stock.marketValue += p.marketValue;
    if (p.marketValue > 0) stock.ownershipCount++;
    if ((p.buyPct ?? 0) > 0) stock.buyCount++;
    if ((p.sellPct ?? 0) > 0) stock.sellCount++;
    stockMap.set(p.securityKey, stock);
  }
  const stocks = [...stockMap.values()].map(stock => ({
    ...stock, portfolioPct: totalValue > 0 ? stock.marketValue / totalValue * 100 : 0,
  })).sort((a, b) => b.marketValue - a.marketValue || a.securityKey.localeCompare(b.securityKey));
  return {
    quarter: latestReportDate ? quarterLabel(latestReportDate) : null,
    previousQuarter: previousDate ? quarterLabel(previousDate) : null,
    trackedFundCount: funds.length, reportingFundCount, comparisonFundCount,
    retainedPositionCount, unresolvedPositionCount: positions.filter(p => p.marketValue > 0 && !p.ticker).length,
    totalValue, pendingFunds, positions, stocks, generatedAt,
  };
}
