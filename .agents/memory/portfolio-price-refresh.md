---
name: Portfolio price refresh
description: Why Momentum and Lazy separate intraday display marks from completed-session trading and wake refreshes on reads.
---

Momentum and Lazy intraday valuations are display marks, not rebalance executions or completed accounting sessions.

**Why:** Fresh quotes should update portfolio values without changing inception prices, holdings or quarterly schedules. Mixing an intraday post-split price with an unadjusted share count would misstate value.

**How to apply:** Require fresh quotes for every holding and complete prior-session accounting. Defer an intraday mark if a held security has an unbooked split or dividend; let the complete close book it exactly once. A later close must replace that day's provisional mark.

Do not rely on a background interval alone to keep portfolios current.

**Why:** The published app uses autoscaling and may be idle between visits. Also, a recovered data feed must clear an earlier error rather than leaving a warning indefinitely.

**How to apply:** Portfolio reads should join a deduplicated, freshness-limited refresh before reading a consistent saved response, preserving stored values if the provider fails. Recompute transient warnings on each refresh.
