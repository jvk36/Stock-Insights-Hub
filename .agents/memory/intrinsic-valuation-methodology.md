---
name: Intrinsic valuation methodology
description: User-confirmed EPS basis, endpoint growth and loss-making valuation rules for the Premium intrinsic curve.
---

Use trailing-twelve-month EPS, not a single quarter's EPS. Growth is the CAGR between the first and last available plotted EPS points in the selected range, not a rolling three-year CAGR or an average of endpoint CAGRs.

**Why:** The user confirmed TTM initially, then explicitly replaced the three-year growth rule with CAGR between the first and last plotted EPS. They selected this interpretation when asked to distinguish it from averaging two three-year CAGRs.

The latest point averages reported TTM EPS with projected TTM EPS incorporating next quarter's consensus, rather than averaging annual and quarterly numbers. Use that blended EPS for the latest plotted endpoint when available; all nodes share the selected window's growth rate. EPS must also appear on the graph using a separate scale.

**Why:** This preserves the annual earnings basis while applying the clarified first/last plotted EPS rule consistently.

Negative growth or negative EPS uses a 15× multiple; negative fair values must not be suppressed.

**Why:** The user explicitly requested EPS × 15 for negative growth and negative earnings, allowing fair value below zero.

Growth used in intrinsic valuation must be capped at 30% regardless of the selected timeframe. Insufficient comparable history must not produce misleading annualized growth.

**Why:** The user flagged UHAL displaying 2087% when historical earnings were missing and explicitly requested a 30% cap independent of timeframe.

Require at least one elapsed year between comparable EPS endpoints before annualizing growth.

**Why:** A handful of recent quarterly observations can create extreme annualized growth without establishing historical growth. Showing unavailable is preferable to implying that the 30% cap makes an insufficient history reliable.

The Overview Earnings Fair Value overlay must be smooth, based on quarterly earnings, and hidden entirely unless earnings cover the entire plotted timeframe.

**Why:** The user explicitly requested a smooth curve rather than distinct segments and no partial-history plot.

**How to apply:** Preserve other piecewise rules, with growth and resulting high-growth multiples capped at 30. Do not invent signed CAGR: nonpositive starting EPS or negative ending EPS cannot establish conventional growth, but negative-EPS nodes still receive 15×. Describe the curve as an earnings-based reference, not cash-flow valuation or guaranteed reversion. Historical illustrations use retrospective/restated information, not point-in-time backtests. Missing or unreconciled currency/share units remain unavailable, never guessed USD values.
