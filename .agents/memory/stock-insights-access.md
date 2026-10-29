---
name: Stock access tiers
description: User-defined Free versus Premium boundaries for stock pages, screens and portfolios.
---

Stock Insights and its entire Overview sub-tab are Free-tier. Every other Stock Insights sub-tab remains Premium.

Stock Watch is Free-tier but requires sign-in or sign-up. Keep watchlists private to each signed-in user. Position Stock Watch at the end of the main tabs.

Algo-Portfolios is publicly accessible with all five sub-tabs. Free visitors see only a strategy introduction and a Premium notice; holdings, rankings, performance, ledgers and backtests remain Premium.

Stock Screens is publicly accessible with all six sub-tabs and sector filtering (country filtering for ADRs). Advanced screens (GARP, Deep Value, Momentum, Quality and Dividend) remain Premium; Free visitors can select them to see a Premium notice, not their controls or results.

**Why:** The user explicitly requested these access boundaries and the latest request moves Stock Watch back to the end.

**How to apply:** Keep both client and API access rules aligned. Overview includes its price chart, earnings overlay, financial statements, news, company profile, and SEC filings; do not accidentally gate those behind Premium. Watchlist list/add/delete, metrics, and chart-history access require authentication but not payment. Public screen constituent lists must not expose Premium metrics, and free portfolio introductions must not fetch protected portfolio data.
