---
name: Portfolio backtest scope
description: User-confirmed historical simulation scope and Model Portfolios tab order.
---

Provide a third, ten-year historical backtest section for all three strategies. Keep the tabs ordered Momentum, Lazy, Blind Trust, with Blind Trust last.

**Why:** The user initially dropped the Blind Trust backtest, then explicitly reversed that scope decision: “Could you re-attempt to do the 10-year backtest for the Blind Trust sub-tab,” using public historical book values and prices and ignoring tickers without pricing (such as PSUS).

**How to apply:** Backtests start with the same $30,000 initial capital on October 26, 2016, rebalance quarterly for ETFs and annually for Blind Trust, and stop strictly before the October 26, 2026 live inception date. Show historical performance and allocations after every rebalance, separate from actual since-inception results. Keep the live portfolios' original accounting and inception unchanged. Never imply that a hindsight simulation is an achieved return.

## Blind Trust point-in-time inputs

Use original filing-level period-end equity and share counts, with filing dates strictly before selection. Aggregate SEC Company Facts omit some class-dimensioned share counts and may expose a private predecessor after a holding-company reorganization. Howard Hughes's predecessor is relevant only before the reorganization, not as a parallel alternative afterward.

**Why:** Current book values, later restatements, cover-page counts from a different date, and weighted-average EPS denominators would change historical P/B ranks. Berkshire requires Class A equivalent shares, and Boston Omaha requires both classes net of treasury.

**How to apply:** Preserve source links and filing/report dates in results. Missing pricing before listing permits exclusion; an unverified book value for a priced candidate must block selection, not silently exclude it. Model stock distributions separately: Yahoo represents the JEF/SPB, JEF/VTS and HHH/SEG distributions as fractional splits, which must not create extra parent shares.
