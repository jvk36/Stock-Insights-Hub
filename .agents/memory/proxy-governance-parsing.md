---
name: Proxy governance parsing
description: Rules for interpreting SEC proxy filings as leadership, board, election, and activist-campaign data.
---

Treat DEF 14A as the primary source for named-executive compensation, beneficial ownership, director tenure, and the current annual-meeting election slate. Support both summary tables and repeated director-profile cards because issuers commonly use either layout.

**Why:** Major issuers publish materially different proxy HTML structures. A table-only parser can silently report that a board roster is unavailable even when the filing contains complete profile cards.

**How to apply:** Prefer explicit labels such as “Director Since,” “Age,” “Name and Principal Position,” and beneficial-ownership headers over fixed table numbers or DOM paths.

Classify DFAN14A and contested-solicitation forms as activist campaign signals, but do not treat PX14A6G filings as activist campaigns by default.

**Why:** PX14A6G commonly contains exempt-solicitation advocacy for an individual shareholder proposal. Labeling every such filing as a campaign against the company creates misleading activist alerts.

**How to apply:** Use non-management contested-proxy forms for campaign discovery, source every campaign to its filing, and describe status cautiously from filing recency or explicit settlement/withdrawal language.