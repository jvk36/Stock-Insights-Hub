---
name: Multi-class share-count history
description: How to recover outstanding-share history when aggregate SEC Company Facts omit class-dimensioned facts.
---

Some multi-class issuers have stale or nearly empty aggregate SEC Company Facts even though every filing reports current class-dimensioned cover-page counts. Read all `EntityCommonStockSharesOutstanding` class contexts from the filing itself. Sum economically equivalent classes by default; Berkshire remains special because the viewed classes require conversion using 1 Class A = 1,500 Class B.

**Why:** Berkshire's aggregate series ends years early, and CVNA's aggregate series contains only zero-share 2017 facts while filing-level Class A/B counts continue. For filing-heavy issuers, SEC's recent submissions list may only span a few years; older quarterly filings live in named archived submissions JSON files.

**How to apply:** Prefer aggregate facts when they are sufficiently populated and recent. Otherwise read recent plus archived submission indexes, parse primary inline-XBRL documents with XBRL ZIP fallback, attach cover-page counts to report periods, and align them with activity facts by report date.