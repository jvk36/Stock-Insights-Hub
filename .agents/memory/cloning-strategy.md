---
name: Cloning strategy
description: Confirmed manager-pick ranking and quarterly calendar, plus constraints on trustworthy historical reconstruction.
---

Cloning is the fourth Model Portfolios tab, following Momentum, Lazy, Blind Trust. Use the managers tracked in Top Hedge Funds–Insights. Take each manager's largest new/increased purchase, ignore verified no-buy quarters, rank the manager winners, and equally fund up to ten distinct stocks from $30,000.

**Why:** The user requested the fourth strategy and explicitly chose “Added portfolio weight,” “Select ten distinct stocks,” and “Next trading day” in clarification.

**How to apply:** Added weight estimates purchased shares at quarter-end unit value relative to current filed portfolio value, normalizing known share splits. It is not simply the change in a position's total portfolio weight due to market moves. Deduplicate manager winners, retain the highest score, and continue down their ranked list rather than substituting a second choice from a duplicate manager. Do not alter the existing portfolios.

## Closing-price calendar

Requested inception is August 15, 2026; because that is Saturday, execute at August 17's close. Later dates are exactly 45 calendar days after quarter end, moved to the next trading close if needed, rather than three-month anniversaries of delayed fills. September 30, 2026 + 45 days is November 14, so execution is November 16.

**Why:** The user's explicit inception date differs from June 30 + 45 days (August 14). Keep the requested inception while retaining literal quarter-end arithmetic afterward; this distinction was explained during implementation.

**How to apply:** Historical window starts August 15, 2016 and ends strictly before August 15, 2026. It includes the August 14, 2026 review before that Saturday boundary; do not force an assumed count of forty reviews at the expense of the actual calendar.

## Historical-source constraints

Never silently discard an unpriceable winner to build a survivor-only backtest. A valid-looking USD ticker series can belong to a different issuer after ticker reuse or a bad archive mapping. Verify identity, not merely currency and symbol. Missing current/prior filings are not evidence of no purchases.

**Why:** Investigation found archived holdings mapped to unrelated currently priced companies, and acquired/delisted winners lacking historical quotes. Such substitutions would produce believable but false performance. Original filing dates also lack precise acceptance times, so same-day filings are conservatively excluded rather than assumed available at the close.

**How to apply:** Show selection/price-coverage audits even if compounded allocations cannot be verified. Explicitly withhold complete-window returns when blocked. Reconstruct acquisition proceeds only from verified completion terms, never a rumored deal price, a stale last quote, or arbitrary forward filling. Disclose that retrospective inception reconstruction is hypothetical, not recorded execution.
