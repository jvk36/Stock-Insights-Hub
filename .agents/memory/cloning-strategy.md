---
name: Cloning strategy
description: Confirmed manager-pick ranking and quarterly calendar, plus constraints on trustworthy historical reconstruction.
---

The user renamed the Cloning sub-tab to WhaleShadow. This is a display-name change, not a change to strategy or existing routes.

**Why:** The user explicitly requested the new name WhaleShadow.

Use the managers tracked in Hedge Fund Blueprint. Take each manager's largest new/increased purchase, ignore verified no-buy quarters, rank the manager winners, and equally fund up to ten distinct stocks from $30,000.

**Why:** The user requested the fourth strategy and explicitly chose “Added portfolio weight,” “Select ten distinct stocks,” and “Next trading day” in clarification.

**How to apply:** Added weight estimates purchased shares at quarter-end unit value relative to current filed portfolio value, normalizing known share splits. It is not simply the change in a position's total portfolio weight due to market moves. Deduplicate manager winners, retain the highest score, and continue down their ranked list rather than substituting a second choice from a duplicate manager. Do not alter the existing portfolios.

## Closing-price calendar

Each quarterly rebalance sells all remaining holdings, then buys the new strategy selections with all available cash at equal weights. A stock selected again must still have separate sell and buy entries in the Transaction Ledger.

**Why:** The user explicitly described selling everything and buying the newly filtered selections each quarter. They subsequently changed the rebuild delay to around 50 days to allow filings to arrive.

**How to apply:** Do not net trades in retained names or interpret the quarterly process as buying only new entrants. Include cash distributions and verified corporate actions in the ledger so cash remains reconcilable.

Requested inception remains August 15, 2026; because that is Saturday, execute at August 17's close. Later quarterly rebuilds are **50 calendar days after quarter end**, moved to the next trading close if needed, rather than three-month anniversaries of delayed fills. September 30, 2026 + 50 days is November 19.

**Why:** The user changed the quarterly rebuild timing from 45 to around 50 days so more filings are available. Their original inception request remains unchanged.

**How to apply:** Preserve the original inception allocation when changing the calendar; recompute later model allocations on the new dates. Do not preserve stale 45-day allocations under a 50-day label. This is not a change to the legal SEC deadline. If historical backtesting is requested again, use the actual calendar and an exclusive end boundary.

## Coverage and notice presentation

Keep the activity/status and ticker/filing coverage notices at the bottom of WhaleShadow behind an arrow button, collapsed by default. Preserve their information rather than hiding data-quality problems permanently.

**Why:** The user asked to remove the yellow boxes from the main working area and show them only on demand at the bottom.

**How to apply:** Keep unavailable values honest in the portfolio itself and leave the detailed explanations accessible by keyboard and assistive technology.

## Historical-source constraints

The user requested that Cloning have no Backtesting section. Keep its visible scope to the introduction and since-inception model portfolio; do not restore historical backtesting without a new request.

**Why:** The user explicitly asked to drop the Backtesting section.

**How to apply:** Preserve live performance and allocation history. The historical-source rules below apply only if historical backtesting is requested again.

Never silently discard an unpriceable winner to build a survivor-only backtest. A valid-looking USD ticker series can belong to a different issuer after ticker reuse or a bad archive mapping. Verify identity, not merely currency and symbol. Missing current/prior filings are not evidence of no purchases.

**Why:** Investigation found archived holdings mapped to unrelated currently priced companies, and acquired/delisted winners lacking historical quotes. Such substitutions would produce believable but false performance. Original filing dates also lack precise acceptance times, so same-day filings are conservatively excluded rather than assumed available at the close.

**How to apply:** If historical backtesting is requested again, show selection/price-coverage audits even if compounded allocations cannot be verified and explicitly withhold complete-window returns when blocked. Reconstruct acquisition proceeds only from verified completion terms, never a rumored deal price, a stale last quote, or arbitrary forward filling. Disclose that retrospective inception reconstruction is hypothetical, not recorded execution.
