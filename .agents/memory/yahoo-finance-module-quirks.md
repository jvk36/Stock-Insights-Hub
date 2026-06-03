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

## API codegen barrel
After every codegen run, `lib/api-zod/src/index.ts` must be manually reset to: `export * from "./generated/api";`
The codegen tool overwrites it with a multi-line barrel that causes duplicate export errors.
