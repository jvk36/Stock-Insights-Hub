---
name: EDGAR 13F value units — dollar vs thousands
description: SEC 13F <value> fields may be in dollars (not thousands) despite the SEC spec; auto-detection and correction strategy
---

## The problem
The SEC 13F spec says `<value>` in the information table should be in thousands of dollars. In practice, all three funds we track (Berkshire Hathaway, Pershing Square, Himalaya Capital) file raw dollar values instead. Storing the number as-is produces values 1,000× too large (e.g. AAPL at $57.8 trillion instead of $57.8 billion).

The filings use the `xslForm13F_X02` schema with namespace-prefixed elements (`<ns1:infoTable>`, `<ns1:value>`, etc.).

## Auto-detection in parseInfoTable
Threshold: if `computedTotalThousands / holdings.count > 10,000,000` (i.e., average per-holding > $10B which is absurd as thousands), values are in dollars → divide everything by 1,000.

This fires correctly for large portfolios (Berkshire ~$263B / 26 positions = $10.1B avg) but would also fire for any fund with average position > $10B. The threshold is intentionally low enough to catch dollar-unit filings while avoiding legitimate thousands-unit filings.

**Why:** Same arithmetic applies to `parsePrimaryDocTotal` — the `<tableValueTotal>` in the header is also in dollars. Code guards: if `headerTotal / computedTotalThousands > 500 && < 2000`, divide headerTotal by 1,000 before using it.

## Namespace parsing fix
Himalaya's filings put the info table **inside** `<edgarSubmission>` (same XML document, namespace-prefixed). Two changes needed:
1. `parseSubmissionText`: detect `:informationTable` (colon prefix) as an info table; allow the same document block to be classified as BOTH primary and info table (use `if` not `else if`).
2. `parseInfoTable`: strip namespace prefixes before cheerio parses — `xml.replace(/<(\/?)\s*\w+:/g, "<$1")` → `<ns1:foo>` becomes `<foo>`.

## Historical data fix
All existing Berkshire and Pershing Square rows in the DB were seeded before the auto-detection was added. Fixed in production via:
```sql
UPDATE sec_13f_holdings SET market_value_thousands = ROUND(market_value_thousands / 1000.0)
WHERE filing_id IN (SELECT id FROM sec_13f_filings WHERE fund_cik IN ('1067983', '1336528'));
UPDATE sec_13f_filings SET total_value_thousands = ROUND(total_value_thousands / 1000.0)
WHERE fund_cik IN ('1067983', '1336528') AND total_value_thousands > 1000000000;
```
Himalaya's totals were also corrected (dividing rows where total > 1,000,000,000).

## CUSIP overrides added
- `093671105` → `HRB` (H&R Block): Yahoo returns HRB.F (Frankfurt) first for "BLOCK H & R INC"
