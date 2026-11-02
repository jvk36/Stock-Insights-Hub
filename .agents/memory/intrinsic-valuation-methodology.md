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

**How to apply:** Preserve other piecewise rules, including uncapped multiples above 15% growth. Do not invent signed CAGR: nonpositive starting EPS or negative ending EPS cannot establish conventional growth, but negative-EPS nodes still receive 15×. Describe the curve as an earnings-based reference, not cash-flow valuation or guaranteed reversion. Historical illustrations use retrospective/restated information, not point-in-time backtests. Missing or unreconciled currency/share units remain unavailable, never guessed USD values.
