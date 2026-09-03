---
name: Proxy governance parsing
description: Rules for interpreting SEC proxy filings as leadership, board, election, and activist-campaign data.
---

Treat DEF 14A as the primary source for named-executive compensation, beneficial ownership, director tenure, and the current annual-meeting election slate. Support both summary tables and repeated director-profile cards because issuers commonly use either layout.

**Why:** Major issuers publish materially different proxy HTML structures. A table-only parser can silently report that a board roster is unavailable even when the filing contains complete profile cards.

**How to apply:** Prefer explicit labels such as “Director Since,” “Age,” “Name and Principal Position,” and beneficial-ownership headers over fixed table numbers or DOM paths.

Strip zero-width layout characters before interpreting proxy ownership rows, and find the first meaningful name and non-percentage numeric cell rather than assuming the name starts in the first DOM cell.

**Why:** Some SEC proxy HTML inserts empty spacer cells containing invisible Unicode characters. Fixed cell indexes can miss every insider while the visible table looks normal.

**How to apply:** Date proxy ownership to the proxy filing, then prefer a newer matched Form 4 final direct post-transaction balance. Match both natural and SEC last-name-first name order, and do not let an empty or zero-valued fallback override a positive SEC position.

Classify DFAN14A and contested-solicitation forms as activist campaign signals, but do not treat PX14A6G filings as activist campaigns by default.

**Why:** PX14A6G commonly contains exempt-solicitation advocacy for an individual shareholder proposal. Labeling every such filing as a campaign against the company creates misleading activist alerts.

**How to apply:** Use non-management contested-proxy forms for campaign discovery, source every campaign to its filing, and describe status cautiously from filing recency or explicit settlement/withdrawal language.