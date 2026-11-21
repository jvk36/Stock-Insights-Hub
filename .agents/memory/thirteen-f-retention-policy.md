---
name: Large-manager 13F retention policy
description: User-defined history limits and evidence-based Miscellaneous grouping.
---

For the twelve managers originally added together (Fisher through Harris) and the subsequent group of 32 managers (Starboard through Oakcliff), skip missing quarters when browsing ten years of available filings. Retain only the top 100 equity positions by market value, plus a final “Miscellaneous” row summing the remainder.

**Why:** The user explicitly requested these two exceptions for both expansions while otherwise preserving existing fund behavior. The request applied to these added managers, not a destructive truncation of the original 39 funds.

**How to apply:** Keep the full portfolio denominator, exclude the summary from stock actions and strategy picks, and never infer a new buy or sale merely from entry into or exit from the retained top 100.

Unmatched ticker consolidation must be based on the security's exact CUSIP, never a generic issuer/trust name or a blanket rule about dotted symbols. Preserve the original unmatched holding records so grouping into Miscellaneous is reversible.

**Why:** The user explicitly said “do not consolidate randomly as was done in the rolled back checkpoint.” Generic ETF trust names produced unrelated foreign tickers; legitimate US share-class symbols must not be mistaken for foreign listings.

**How to apply:** Exhaust exact-identifier matching before grouping a position as unresolved. An outage, rate limit, pending lookup or old failed name search is not evidence that a security cannot be matched. Apply consistent identities across individual fund views, summaries and ticker ownership; keep dollar totals intact.

Letter-prefixed identifiers in the CUSIP column are CINS and require OpenFIGI's `ID_CINS`, not `ID_CUSIP`. Retire negative cache results produced with the wrong identifier type, and use the same verified mappings in strategy inputs as in fund views.

**Why:** Wrong-type lookups falsely reported no matches for Ferrari, Spotify, Aptiv and other securities with valid US listings, unnecessarily consolidating them into Miscellaneous.

**How to apply:** Choose identifier type from the exact identifier, retaining US equity filters and ambiguity safeguards. Never replace a foreign ordinary share with a different ADR or trust a guessed ticker merely to complete a strategy.

An exact lookup including unlisted equities can return both a live share and an obsolete when-issued alias, such as Ferrari's RACE and RACE-W. Refine ambiguous results with a listed-only exact lookup rather than arbitrarily selecting or stripping a symbol.

**Why:** Correct CINS lookup alone still left Ferrari falsely unresolved because both aliases were returned.

**How to apply:** Accept only a unique verified listed result; preserve genuine ambiguity. If the refinement fails temporarily, leave it pending for retry rather than consolidating it as definitively unmatched.
