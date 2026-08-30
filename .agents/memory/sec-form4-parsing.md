---
name: SEC Form 4 parsing
description: Non-obvious SEC ownership XML rules for document retrieval and conservative transaction interpretation.
---

Use the SEC submissions feed's `primaryDocument` basename at the filing archive root to retrieve raw ownership XML. A primary document prefixed by an `xslF345.../` directory returns transformed HTML rather than the XML parser input.

**Why:** SEC submission metadata can point at an XSL presentation path even though the raw XML file lives at the filing root.

**How to apply:** Strip the presentation-directory prefix, retain the basename, and verify the response contains `ownershipDocument`.

Treat acquired/disposed direction as authoritative only when `transactionAcquiredDisposedCode` supplies `A` or `D`; do not infer direction from transaction code when calculating pre-transaction holdings or activity percentage.

**Why:** Codes such as option exercises and miscellaneous transactions can represent different directions depending on the reported security.

**How to apply:** Return a null percentage when the row-level direction is absent or ambiguous.

Apply a filing-level `aff10b5One` indicator to a transaction only when the filing contains one transaction. Prefer a transaction-coding value when present.

**Why:** A filing-wide indicator cannot safely identify which row was plan-based in a multi-transaction filing.

**How to apply:** Keep ambiguous multi-row filings from being automatically excluded from discretionary buy/sell views.