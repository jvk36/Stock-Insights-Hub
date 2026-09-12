---
name: REIT non-GAAP filing sources
description: Source-selection rules for reported AFFO-family values in SEC filings.
---

SEC Company Facts often omits REIT non-GAAP measures even when the company reports them. Prefer structured custom facts when present; otherwise inspect Exhibit 99 documents filed near the latest annual 10-K for AFFO, Core FFO, Cash FFO, or Funds Available for Distribution.

**Why:** Realty Income's Company Facts had no AFFO value, while its annual 8-K supplemental exhibit contained both completed-year AFFO and forward guidance. A loose match selected guidance instead of the historical result.

**How to apply:** Rank literal AFFO ahead of equivalent company terms, preserve the issuer's reported label, anchor values to a completed “Years ended” section, and reject rows whose nearest section is earnings guidance. Never substitute plain FFO or free cash flow silently.