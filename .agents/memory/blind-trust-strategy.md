---
name: Blind Trust strategy requirements
description: User-specified purpose, eligible businesses and allocation rule for the Premium Model Portfolios feature.
---

The user requested a Premium Model Portfolios tab whose first strategy is Blind Trust: businesses roughly following Berkshire's permanent-capital and capital-allocation model. The specified universe is BRK.A, MKL, FRFHF, JEF, L, HHH, PSUS, IAC and BOC. Select the lowest-P/B three, initially allocate $10,000 each, and recompute P/B and rebalance equally once a year.

**Why:** These are the user's explicit strategy and universe requirements, not a generic stock screener or personalized portfolio.

**How to apply:** Keep the introductory explanation and full candidate/P/B list separate from the model holdings spreadsheet and since-inception performance. Preserve the exact universe unless the user changes it; verify provider mappings rather than silently substituting securities.

## Accounting and inception decisions

Use fractional shares, launch-time inception rather than a pre-launch backtest, and annual reinvestment of the entire then-current equity. Dividend entitlements are credited on ex-dividend dates and held as cash until rebalance.

**Why:** A $10,000 BRK.A allocation requires fractional shares. Historical prices alone cannot establish historical P/B rankings; applying today's book values to past allocation dates would fabricate performance.

**How to apply:** Preserve the original inception and annual anniversary when refreshing or restarting. If a rebalance was missed without point-in-time fundamental observations, execute at a complete current observed session and disclose the delay rather than inventing historical trades.

## Missing historical prices

Omit an incomplete session's valuation rather than estimating its price, but carry all intervening corporate actions into the next complete valuation and disclose the omitted sessions.

**Why:** A permanently missing historical quote must not stop all future valuations and annual allocations. Carry-forward prices would hide the gap, while dropping dividends or splits would corrupt future equity.

**How to apply:** Keep the recovery policy honest about both missing performance points and the accounting carried across them; never replace a missing close with zero or invent a return for that day.
