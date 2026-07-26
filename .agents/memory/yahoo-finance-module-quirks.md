---
name: Yahoo Finance module quirks
description: Field name gotchas, unit conventions, and data availability for yahoo-finance2 v3 in this project
---

## Unit conventions
- `financialData.debtToEquity` — returned as percentage (e.g. 163 = 1.63x D/E). Always divide by 100.
- `financialData.returnOnEquity`, `.grossMargins`, `.operatingMargins`, `.earningsGrowth` — returned as decimals (0.15 = 15%). Multiply by 100.
- `defaultKeyStatistics.shortPercentOfFloat` — decimal (0.05 = 5%). Multiply by 100.
- `defaultKeyStatistics.SandP52WeekChange`, `.fiftyTwoWeekChange` — decimal. Multiply by 100. Note: `.fiftyTwoWeekChange` can be null/missing in some calls; compute 52w return from chart data instead (index ~252 from end of a 380-day daily chart).
- `summaryDetail.dividendYield`, `.payoutRatio` — decimal. Multiply by 100.
- `summaryDetail.fiveYearAvgDividendYield` — already a percentage (e.g. 0.5 for 0.5%). No multiplication.
- Options chain `.impliedVolatility` — decimal (0.25 = 25%). Multiply by 100. Filter out values > 5.0 as bad data.

## Field availability
- `incomeStatementHistory` module: has `totalRevenue`, `netIncome`, `grossProfit` but NOT `dilutedEps`. Do not use for EPS growth calculation.
- `earnings` module via quoteSummary: `earningsChart.yearly` and `financialsChart.yearly` are often null/unavailable for specific stocks. Use as best-effort only; handle null gracefully.
- For RSI(14): fetch 60-day daily chart with `period1: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)`. Need 15+ closes. Store as `calculateRSI14(closes)`.
- For 3M/1M returns: use a 380-day daily chart, then index from end (idx1m = length-22, idx3m = length-64, idx52w = length-253).

## Module `as any` cast
When passing a custom modules array to `quoteSummary`, use `modules: [...] as any` to avoid TypeScript errors about the modules union type. Non-standard modules (like `incomeStatementHistory`, `earnings`) must be cast `as unknown as { ... }` on the result to access their fields.

## suppressNotices — instance config only
`suppressNotices` (e.g. `["yahooSurvey","ripHistorical"]`) is a **YahooFinance constructor/instance option**, NOT a per-call option. Passing it to `quoteSummary({...})` throws `InvalidOptionsError: additionalProperties`. Set it on the instance: `new YahooFinance({ suppressNotices: [...] })` or accept the console noise.

## Dividend data — summaryDetail is unreliable for small-yield stocks
`summaryDetail.dividendYield` and `.payoutRatio` are frequently null for stocks with small dividends (e.g. AAPL). Also null: `.trailingAnnualDividendYield`. `summaryDetail.dividendRate` is also sometimes absent even when dividendYield is present.

**dividendYield fallback chain** (decimal → multiply ×100 for %):
1. `summaryDetail.dividendYield` (> 0 guard)
2. `summaryDetail.trailingAnnualDividendYield` (> 0 guard)
3. `summaryDetail.dividendRate / price.regularMarketPrice` (> 0 guards on both)

**payoutRatio fallback chain**:
1. `summaryDetail.payoutRatio` (decimal, × 100; > 0 guard)
2. `annualDivPerShare / trailingEps × 100` where:
   - `annualDivPerShare` = `dividendRate` if present, else back-compute `(dividendYield% / 100) × mktPrice`
   - `trailingEps` = `defaultKeyStatistics.trailingEps` if > 0, else `mktPrice / summaryDetail.trailingPE`
**Why back-compute annualDivPerShare**: `dividendRate` is often absent when `dividendYield` is present.

`fiveYearAvgDividendYield` in summaryDetail is a percentage (e.g. 2.77 = 2.77%), not decimal. Returns null for stocks without 5yr dividend history — accept this as N/A.

## earningsTrend — reliable forward growth estimates
`earningsTrend.trend` periods: "0q", "+1q", "0y", "+1y". No "+5y" period (despite type definition allowing it). Use `"+1y"` for forward EPS and revenue growth estimates. `earningsGrowth` in `financialData` is YoY trailing (also decimal). EPS growth formula: `trend.find(t => t.period === "+1y").growth * 100`.

## incomeStatementHistory deprecated since Nov 2024
Yahoo Finance's quoteSummary `incomeStatementHistory` returns almost no data since Nov 2024. Server logs show: "Use `fundamentalsTimeSeries` instead." `dilutedEps` field does NOT exist in incomeStatementHistory anyway — only `totalRevenue`, `netIncome`, etc.

## API codegen barrel
After every codegen run, `lib/api-zod/src/index.ts` must be manually reset to: `export * from "./generated/api";`
The codegen tool overwrites it with a multi-line barrel that causes duplicate export errors.
