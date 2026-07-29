---
name: 13F tracker fund roster
description: All seeded funds, CIKs, proprietors, and patterns learned during ticker-fix audits
---

## Seeded funds (all Q1 2016 → Q1 2026 = 41 quarters)

| Fund | CIK | Slug | Proprietor | Holdings/qtr |
|---|---|---|---|---|
| Berkshire Hathaway | 1067983 | berkshire-hathaway | Warren Buffett | ~40–50 |
| Pershing Square Capital Mgmt | 1336528 | pershing-square | Bill Ackman | ~7–12 |
| Himalaya Capital Management | 1709323 | himalaya-capital | Li Lu | ~3–6 |
| RV Capital AG | 1766596 | rv-capital | Robert Vinall | ~4–10 |
| CAS Investment Partners | 1697591 | cas-investment-partners | Clifford Sosin | ~5–12 |
| Dorsey Asset Management | 1671657 | dorsey-asset-management | Pat Dorsey | ~15–30 |
| Yacktman Asset Management | 905567 | yacktman-asset-management | Donald Yacktman | ~30–50 |
| Tweedy Browne Co LLC | 732905 | tweedy-browne | William Browne | ~50–100 |
| Davis Selected Advisers | 1036325 | davis-selected-advisers | Christopher Davis | ~98–146 |
| Abrams Capital Management | 1358706 | abrams-capital | David Abrams | ~10–22 |

## Recurring Yahoo Finance ticker-failure patterns (across all funds)

1. **Foreign exchange collisions** — Yahoo resolves CUSIP to a German/Austrian/Swiss/Brazilian/Chilean exchange listing instead of the US one. Pattern: ticker ends in `.F`, `.MU`, `.SG`, `.DU`, `.VI`, `.SA`, `.SN`. Fix: hardcode the US ticker in `CUSIP_TICKER_OVERRIDES`.

2. **CUSIP collision to wrong active stock** — Multiple CUSIPs resolve to the same popular ticker (e.g., several CUSIPs returned `QBTS` for D-Wave Quantum). Fix: override each affected CUSIP individually.

3. **BRK-A/BRK-B confusion** — Yahoo maps CUSIP `084670108` (Class A) to `BRK-B`. Override to `BRK-A`.

4. **Renamed/reorganised companies** — Liberty Media tracking stocks, Encana→Ovintiv, VimpelCom→VEON, Och-Ziff→Sculptor, etc. Yahoo may return stale, empty, or wrong ticker. Always override.

5. **Acquired/delisted companies** — Tickers that no longer trade (Celgene, Aetna, Monsanto, Time Warner, Allergan, Whole Foods, etc.) return empty from Yahoo. Override to the last known US ticker for historical display.

**Why:** The `CUSIP_TICKER_OVERRIDES` map in `edgar-fetcher.ts` is applied at fetch time. For existing DB rows, apply direct SQL UPDATEs grouped by `fund_cik` after each seed.

## Ticker-fix conventions

- Always run the full audit SQL after a seed completes (filter on `ticker IS NULL OR ticker LIKE '%.%' OR ticker = 'not_found'`).
- Also check recent quarters for active-stock mismatches (e.g., QBTS collision).
- Add all fixes to both:
  1. The DB (`UPDATE sec_13f_holdings ... WHERE UPPER(cusip) = UPPER(...)`)
  2. The `cusip_ticker_map` table via upsert
  3. The `CUSIP_TICKER_OVERRIDES` map in `edgar-fetcher.ts` (for future re-seeds)
