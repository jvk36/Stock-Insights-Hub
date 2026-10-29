---
name: Stock access tiers
description: User-defined Free versus Premium boundaries for Stock Insights and Stock Watch.
---

Stock Insights and its entire Overview sub-tab are Free-tier. Every other Stock Insights sub-tab remains Premium.

Stock Watch is Free-tier but requires sign-in or sign-up. Keep watchlists private to each signed-in user. Position Stock Watch immediately after Hedge Fund Blueprint, followed by Stock Insights.

**Why:** The user explicitly requested these access boundaries and placements; the later Stock Watch request places it before Stock Insights.

**How to apply:** Keep both client and API access rules aligned. Overview includes its price chart, earnings overlay, financial statements, news, company profile, and SEC filings; do not accidentally gate those behind Premium. Watchlist list/add/delete, metrics, and chart-history access require authentication but not payment.
