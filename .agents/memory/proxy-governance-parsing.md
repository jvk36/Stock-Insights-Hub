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

Accept both “Name of Beneficial Owner” and “Name and Address of Beneficial Owner,” plus either shares/securities or “Amount and Nature of Beneficial Ownership” value headers.

**Why:** Amazon-style proxies use the address/amount wording and append mailing addresses to selected owner names. Rejecting that ownership table also prevents director-profile cards from being linked to nominees.

**How to apply:** Remove trailing street addresses from owner names. For profile cards, support either Age→Director Since or Director Since→Age order, including month-qualified years, and only assign board roles when the role explicitly names the issuer.

Board-roster parsing must not require a successful ownership match. Treat ownership as enrichment, not as proof that a director exists.

**Why:** Some proxies omit zero-share directors from numeric ownership parsing, combine Name/Occupation or Name/Director Since into one cell, remove spaces between rendered labels, or nest the real header inside wrapper rows.

**How to apply:** Inspect direct row cells for headers, support compressed labels such as NameAge and DirectorSince, retain zero-share ownership names as match anchors, strip numeric footnotes, and parse valid nominee cards even when ownership is unavailable.

Serialize SEC requests below the SEC request ceiling and do not cache a failed proxy fetch for the normal multi-hour TTL.

**Why:** Form 4 enrichment can fan out to many documents. Concurrent bursts can trigger archive-host HTTP 429 responses, making every board look empty if the incomplete response is cached.

**How to apply:** Queue SEC traffic with spacing and cache incomplete proxy responses briefly. If Node fetch returns 429 while a paced curl request succeeds, treat it as a transport-specific block and use curl as the fallback.

Treat a local profile block containing one Director Since year and one Age value as director evidence even when the name is in a sibling row or concatenated with an independence label or honorific.

**Why:** SEC filing HTML can render profiles as visual cards whose extracted text becomes `1998Age`, `NAMEIndependent`, or `NAMEMr.`. Requiring a conventional table row silently drops otherwise complete rosters.

**How to apply:** Detect semantic labels with optional separators, then recover the nearby name from headings, ownership names, independence labels, or honorific boundaries. Validate names independently of layout classes.

Follow issuer-successor filing links when the ticker's current CIK has no definitive proxy.

**Why:** A holding-company reorganization can move the ticker to a new CIK while the latest DEF 14A and governance history remain under the predecessor CIK.

**How to apply:** Use recent market-data filing URLs to discover linked CIKs, then select the linked registrant with the latest DEF 14A. Do not hardcode ticker-to-predecessor exceptions.

Classify DFAN14A and contested-solicitation forms as activist campaign signals, but do not treat PX14A6G filings as activist campaigns by default.

**Why:** PX14A6G commonly contains exempt-solicitation advocacy for an individual shareholder proposal. Labeling every such filing as a campaign against the company creates misleading activist alerts.

**How to apply:** Use non-management contested-proxy forms for campaign discovery, source every campaign to its filing, and describe status cautiously from filing recency or explicit settlement/withdrawal language.