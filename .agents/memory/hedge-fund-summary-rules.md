---
name: Hedge Fund Blueprint summary rules
description: User-confirmed individual-position rankings and strict latest-quarter coverage for cross-fund summaries.
---

Biggest Bets and Top Buys (%) rank individual fund positions, not percentages summed across managers. Summary Stats counts distinct managers per security; Summary Portfolio sums the retained market values and normalizes against that retained sum.

**Why:** The user explicitly selected individual fund positions when asked how the two rankings should work. The combined portfolio is a different aggregation, not a substitute for the individual-position leaderboards.

Summaries consider at most the top 100 positions per manager, exclude Miscellaneous, and include only the latest reported quarter. Managers without data for that quarter are excluded rather than replaced with their older holdings. This does not change the original managers' individual historical displays.

**Why:** The user requested latest-quarter-only summary statistics even while some of the 83 managers have not yet supplied current data.

**How to apply:** Keep reporting coverage visible. Quarterly activity requires the adjacent previous quarter, and unmatched positions at a retention boundary are unknown, not inferred new buys or exits. Flow percentages are share-change estimates valued at the relevant quarter-end, not actual trading cash flows; do not describe them as verified executions.
