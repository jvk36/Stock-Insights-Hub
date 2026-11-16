---
name: Stock access tiers
description: User-defined Free versus Premium boundaries for stock pages, screens and portfolios.
---

Risk & Returns Lab (formerly Stock Insights) is Free-tier. Its default sub-tab is Valuation & Fundamentals, which contains the existing research interface: the entire Overview sub-sub-tab is Free-tier, and every other research sub-sub-tab remains Premium.

The Performance and Risk Analysis sibling sub-tabs are Premium-only. Keep them visible with a Premium notice for Free visitors, but protect their analytics and shared historical-data API.

Stock Watch is Free-tier but requires sign-in or sign-up. Signed-out visitors stay on the Stock Watch page and see an explanation with Sign in and Sign up options, not an automatic login redirect. Keep watchlists private to each signed-in user.

Macro Summary belongs at the end of the main tabs, after Stock Watch. Preserve the relative order of the remaining tabs.

Algo-Portfolios is publicly accessible with all five sub-tabs. Free visitors see only a strategy introduction and a Premium notice; holdings, rankings, performance, ledgers and backtests remain Premium.

Stock Screens is publicly accessible with all six sub-tabs and sector filtering (country filtering for ADRs). Advanced screens (GARP, Deep Value, Momentum, Quality and Dividend) remain Premium; Free visitors can select them to see a Premium notice, not their controls or results.

AdSense ads are for Free mode only, including signed-out visitors. Premium subscribers must remain ad-free.

AdSense ownership verification is separate from serving ads: keep verification metadata and authorized-seller information public and readable without JavaScript, regardless of membership.

**Why:** Google's verification could not see the membership-gated, dynamically loaded ad script. Public verification does not require loading ads for Premium members.

**Why:** The user explicitly requested these access boundaries, then moved Macro Summary to the end after previously placing Stock Watch last, and requested advertising only in Free mode.

**How to apply:** Keep both client and API access rules aligned. Overview includes its price chart, earnings overlay, financial statements, news, company profile, and SEC filings; do not accidentally gate those behind Premium. Watchlist list/add/delete, metrics, and chart-history access require authentication but not payment. Public screen constituent lists must not expose Premium metrics, and free portfolio introductions must not fetch protected portfolio data.
