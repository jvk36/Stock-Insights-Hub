---
name: Blind Trust strategy requirements
description: User-specified purpose, eligible businesses and allocation rule for the Premium Model Portfolios feature.
---

The user requested a Premium Model Portfolios tab whose first strategy is Blind Trust: businesses roughly following Berkshire's permanent-capital and capital-allocation model. The specified universe is BRK.A, MKL, FRFHF, JEF, L, HHH, PSUS and BOC. Select the lowest-P/B three, initially allocate $10,000 each, and recompute P/B and rebalance equally once a year. The user removed IAC because it was reincorporated as People Inc. and no longer operates using the previous model.

**Why:** These are the user's explicit strategy and universe requirements, not a generic stock screener or personalized portfolio.

**How to apply:** Keep the introductory explanation and full candidate/P/B list separate from the model holdings spreadsheet and since-inception performance. Preserve the exact universe unless the user changes it; verify provider mappings rather than silently substituting securities.

## Accounting and inception decisions

Use fractional shares and annual reinvestment of the entire then-current equity. The user specified inception on October 26, 2026, ranked and allocated using that day's opening prices. Dividend entitlements are credited on ex-dividend dates and held as cash until rebalance; buying on an ex-dividend date does not earn that distribution.

**Why:** A $10,000 BRK.A allocation requires fractional shares. Opening-price inception on October 26, 2026 is the user's explicit correction to the earlier closing-price launch assumption. Historical prices alone cannot establish historical P/B rankings; applying today's book values to past allocation dates would fabricate performance.

**How to apply:** Preserve the original inception and annual anniversary when refreshing or restarting. If a rebalance was missed without point-in-time fundamental observations, execute at a complete current observed session and disclose the delay rather than inventing historical trades.

## PSUS book-value measure

Use PSUS's USD NAV/share published on https://www.pershingsquareusa.com/ as its book-value denominator, retaining the official as-of date and source attribution.

**Why:** The user identified the company's website as the public source missing from Yahoo's coverage. NAV/share is the relevant reported equity measure for this closed-end fund, but must not be mislabeled as a Yahoo book-value observation.

**How to apply:** Fetch current reported NAV automatically. If the official source is unavailable, stale or cannot be parsed, defer selection rather than silently excluding PSUS or substituting the website's market price.

## Missing historical prices

Omit an incomplete session's valuation rather than estimating its price, but carry all intervening corporate actions into the next complete valuation and disclose the omitted sessions.

**Why:** A permanently missing historical quote must not stop all future valuations and annual allocations. Carry-forward prices would hide the gap, while dropping dividends or splits would corrupt future equity.

**How to apply:** Keep the recovery policy honest about both missing performance points and the accounting carried across them; never replace a missing close with zero or invent a return for that day.
