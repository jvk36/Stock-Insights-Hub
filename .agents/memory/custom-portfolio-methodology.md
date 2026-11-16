---
name: Custom portfolio methodology
description: Assumptions and currency boundaries for weighted portfolios in Risk & Returns Lab.
---

Custom weighted analytics use an explicitly selected rebalancing rule, defaulting to buy and hold. Calculate portfolio risk from the simulated combined value path, not averages of individual risk measures.

**Why:** Rebalancing changes both the realized path and weight drift. Averaging individual CAGRs, volatility or drawdowns would misrepresent the portfolio and its diversification.

**How to apply:** Preserve the disclosed trade convention (first common close of a new calendar period, after marking existing holdings). Simulations assume fractional units and reinvested distributions with no fees, taxes or contributions.

Until historical FX is supported, weighted dollar simulations require confirmed USD listings. Correlations can use listing-currency returns with an explicit no-FX disclosure.

**Why:** Adding local-currency asset values would create fictitious dollar wealth; listing-currency correlations can still be useful when clearly labeled.

**How to apply:** Fail explicitly for non-USD weighted holdings instead of silently treating them as dollars. Correlation must remain independent of weights, even if weights are blank or invalid. Zero-weight holdings do not affect weighted simulations or their historical coverage, but still belong in correlation analysis.
