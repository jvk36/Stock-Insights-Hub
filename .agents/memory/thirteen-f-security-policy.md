---
name: Hedge fund security identity policy
description: User-confirmed ETF exclusion and conservative ticker matching across Hedge Fund Blueprint.
---

Group **all ETFs** under Miscellaneous, including ETFs whose tickers are known. Also group warrants, other non-stock positions, and positions whose stock ticker cannot be verified. Apply the policy across all tracked funds and historical quarters, not only the originally reported five managers.

**Why:** The user explicitly chose “Group all ETFs under Miscellaneous” after listing both ETF ticker corrections and an exclusion request.

**How to apply:** Preserve reported market values and full-portfolio percentage denominators. Exclude Miscellaneous from stock rankings, ticker ownership links and stock activity calculations. Do not label a stock newly purchased or sold merely because its counterpart is hidden in Miscellaneous.

Never map a warrant or unit to its underlying common-stock ticker. A search result being an equity on a US exchange does not establish issuer identity; unrelated active companies and foreign listings have repeatedly been returned for SEC issuer names.

**Why:** Several unrelated biotech holdings were assigned the same active ticker, and cached search matches perpetuated the errors across funds.

**How to apply:** Prefer exact, curated CUSIP identities; verify issuer names for search-derived matches, reject ambiguous share classes and foreign-exchange fallbacks, and use Miscellaneous rather than guessing. Preserve the original filing rows so later verification can restore a position without changing its reported amount.
