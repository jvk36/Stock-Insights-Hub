---
name: Performance return methodology
description: Dividend-consistent benchmark comparisons and honest historical coverage in Risk & Returns Lab.
---

Performance analytics use split- and dividend-adjusted prices, with SPY explicitly labeled as an S&P 500 ETF proxy rather than the index itself. Never silently substitute price-only closes if adjusted history is unavailable.

**Why:** Price-only returns omit dividends and would make the historical investment-growth comparison inconsistent. SPY provides an investable, dividend-adjusted benchmark, but its fees and tracking differ from the index.

**How to apply:** Use actual elapsed calendar time for annualization and the same available trading dates for ticker-versus-benchmark growth. Missing requested horizons must remain unavailable rather than relabeling shorter histories. Listing-currency returns are not FX-adjusted USD returns; disclose this for non-USD tickers.

Risk Analysis treats the risk-free / minimum acceptable return as an explicit editable assumption, not an inferred current Treasury yield. Market beta remains relative to SPY even when a user selects a different investment for pairwise correlation.

**Why:** A current yield is not a historical risk-free series, and changing the correlation comparison must not silently redefine market beta.

**How to apply:** Keep rate assumptions visible and reject invalid inputs rather than substituting a fallback. For pairwise daily statistics, match both dates of each return interval, not just the ending date, so holidays or missing observations do not mix unequal periods.
