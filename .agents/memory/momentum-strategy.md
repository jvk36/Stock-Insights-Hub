---
name: Momentum strategy
description: User-specified ETF universe, inception and quarterly trend-following allocation decisions.
---

The second Premium Model Portfolios sub-tab is Momentum. Its fixed universe is VTI, VEU, VWO, VNQ, TLT and TIP. It starts with $30,000, equally allocated among every ETF strictly above its own 200-day simple moving average, then reallocates the entire current equity every three months.

**Why:** These are the user's explicit universe and allocation requirements. VEU includes emerging markets and overlaps VWO; the user specified VEU, so do not silently replace it with a developed-only ETF. Diversification and uncorrelated absolute returns are goals, not guaranteed properties or reported measured correlations.

**How to apply:** Keep the Intro with all six signals separate from actual holdings and since-inception performance. Current signals can differ from holdings until the next scheduled rebalance. Equality does not qualify. If no ETF qualifies, hold non-interest-bearing cash; incomplete data must defer allocation, not silently remove an ETF.

## Inception and ongoing accounting

Inception is October 26, 2026 using contemporaneous, time-stamped quotes captured that day, not the Blind Trust opening-price convention. The initial signal compares the quote with the prior 200 completed closes. Preserve the actual launch observation across environments and later publishing.

**Why:** The user asked for today's price rather than the opening price. A deployment on a later day must not change the initial model's trades or invent a later inception. Today's observation was captured when the strategy was created; it is not a historical backtest.

**How to apply:** Quarterly dates are three-calendar-month anniversaries anchored to inception, not fixed calendar-quarter ends. Use the next complete trading session when due dates are nontrading days. Subsequent signals use the trailing 200 closes including the rebalance session; the price-based SMA is split-adjusted but not dividend-adjusted. Fractional shares are allowed; credit dividends separately as cash until rebalance, without launch-day ex-dividend entitlement. Exclude taxes, fees, slippage and cash interest, and state those assumptions.
