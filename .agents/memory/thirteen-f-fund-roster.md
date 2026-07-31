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
| Baupost Group | 1061768 | baupost-group | Seth Klarman | ~18–47 |

| Generation Investment Mgmt | 1375534 | generation-investment | Al Gore | ~29–50 |
| Akre Capital Management | 1112520 | akre-capital | Chuck Akre | ~17–31 |
| Appaloosa LP | 1656456 | appaloosa | David Tepper | ~20–57 |
| Ruane, Cunniff & Goldfarb | 1720792 | ruane-cunniff | David Poppe | ~27–57 |
| FundSmith LLP | 1569205 | fundsmith | Terry Smith | ~16–43 |
| TCI Fund Management | 1647251 | tci-fund-management | Christopher Hohn | ~5–17 |
| Tiger Global Management | 1167483 | tiger-global | Chase Coleman | ~20–165 |
| Fairfax Financial Holdings | 915191 | fairfax-financial | Prem Watsa | ~26–65 |
| Duquesne Family Office | 1536411 | duquesne-family-office | Stanley Druckenmiller | ~29–74 |
| Third Point LLC | 1040273 | third-point | Daniel Loeb | ~25–55 |
| Icahn Capital LP | 921669 | icahn-capital | Carl Icahn | ~8–20 |
| Public Investment Fund | 1767640 | public-investment-fund | Yasir Al-Rumayyan | ~20–40 | 30 qtrs only (Q4 2018–Q1 2026) |
| Baker Bros. Advisors LP | 1263508 | baker-bros-advisors | Felix & Julian Baker | ~80–110 | 1 residual null: 220485AB2 (Corsicanto II — convertible bond, no equity ticker) |
| Fairholme Capital Mgmt | 1056831 | fairholme-capital | Bruce Berkowitz | ~2–15 | 0 nulls |
| Greenlight Capital | 1079114 | greenlight-capital | David Einhorn | ~20–50 | dual-CIK: 1079114 (Q1 2016–Q4 2023) + linkedCik 1489933/DME Capital (Q1 2024–Q1 2026); 28 residual nulls (7 ETF CUSIPs — trust-family resolvable, specific fund not: 57060U100 VanEck, 46137V100/357 Invesco, 78464A631/714 SPDR, 33733E807 First Trust, 46090F100 Invesco actively managed) |

## Third Point LLC-specific notes

- **Files in raw dollars** (user confirmed) — auto-detection divided correctly; values stored as thousands.
- **Event-driven activist + massive SPAC exposure** — largest activist targets: Sotheby's (BID, $4.5B), IAA (IAA, $2.6B), Black Knight (BKI, $1.25B), Catalent (CTLT), Global Blue (GB), Kadmon (KDMN). SPAC positions dominated 2019–2022 (Far Point FPAC $3B+, Khosla, Go Acquisition, Compute Health, ION 3, JAWS, FinTech V, etc.).
- **~138 total CUSIP overrides** applied across two SQL passes. Final null count: **0 / 1,789 holdings** (100%).
- **Key CUSIP patterns**: H-prefix Swiss company (Global Blue: `GB`), N-prefix Dutch company (Frank's International: `FI`), G-prefix Cayman SPACs (~60 distinct SPACs), unit-class variants of SPACs share ticker with the base class.
- **SPAC ticker convention**: multiple CUSIPs per SPAC (units `*U`, class A, warrants) all map to the pre-merger equity ticker. Applied consistently across all ~60 Third Point SPAC positions.
- **Far Point vs Far Peak**: two distinct SPACs — Far Point Acquisition Corp (`FPAC`, CUSIP `30734W*`) and Far Peak Acquisition Corp (`FPAA`, CUSIP `G3312L*`). Do not confuse them.

## Duquesne Family Office-specific notes

- **Files in thousands** — XML values like 99,057 = ~$99M position. Auto-detection correctly does NOT divide. Same as Baupost.
- **High-turnover macro/cyclical portfolio** — many short-duration positions and M&A targets. Expect ~140 null CUSIPs after seeding.
- **54 CUSIP overrides applied** (SQL patch + re-resolution pass). Final null count: **19 / 2,029 holdings** (0.9%).
- **8 genuinely unresolvable CUSIPs** (all ETFs + 2 hard-to-resolve small positions):
  - `46137V357` — Invesco Exchange Traded Fd T ($224M, Q4 2025) — ETF CUSIP, unresolved
  - `37950E259` — Global X Fds ($202M, Q1–Q4 2024) — ETF CUSIP, unresolved
  - `78464A698` — Spdr Ser Tr ($173M, Q1–Q4 2024) — SPDR ETF CUSIP, unresolved
  - `233051879` — Dbx Etf Tr ($72M, Q4 2020/Q1 2021) — DWS ETF CUSIP, unresolved
  - `78464A797` — Spdr Series Trust ($28M, Q3 2025) — SPDR ETF CUSIP, unresolved
  - `97717W422` — WisdomTree Tr ($20M, Q3 2016) — WisdomTree ETF CUSIP, unresolved
  - `83443Q103` — Solstice Advanced Matls Inc ($4.7M, Q1 2026) — unknown/recent company
  - `101388106` — Bottomline Tech Del Inc ($511K, Q1 2019) — acquired Thoma Bravo 2022; ticker unconfirmed
- **Macro/special patterns**: lots of biotech M&A targets (RETA, SWTX, ALXN, GWPH, FTSV, JUNO, CLVS, ITCI, FUSN, CDTX), energy (MRO, CXO, ANDV, RICE), financial M&A (DFS, STL, HES, WP), SPACs (DCRB, DRGN), foreign ADRs (VRNA, CYBR via M-prefix, AVGO via Y-prefix, BTI, BLTE, DBVT, LOMA), ETF positions (6 unresolved CUSIPs).

## Fairfax Financial Holdings-specific notes

- **Files in raw dollars** — auto-detection divided correctly; values stored as thousands.
- **Canadian-incorporated insurer** — portfolio is heavy on special situations, distressed, M&A targets. ~103 distinct null CUSIPs resolved after seeding.
- **Big CUSIP patterns**: Canadian dual-listings (Osisko Gold `OR`, Turquoise Hill `TRQ`, Pengrowth `PGH`, Norbord `OSB`, Atlantic Power `AT`, Sierra Wireless `SWIR`), Y-prefix Cayman (Seaspan `SSW`, Diamond S Shipping `DSSI`), M-prefix Israel (MagicJack `CALL`), G-prefix Cayman/Ireland (Central European Media `CETV`, Strongbridge Biopharma `SBBP`, Nielsen `NLSN`, Ensco `ESV`, Brookfield Reinsurance `BNRE`, Arco Platform `ARCE`, Eros International `EROS`).
- **Many private-equity-acquired targets** (USG, Envision Healthcare, Cvent, Citrix, Loyalty Ventures, Casper Sleep, CoreLogic, Stamps.com, RealPage, Forescout, Team Health, LHC Group, etc.) — all overridden to their last known US ticker.
- **96+ CUSIP overrides** applied across two passes. Final null count: **0 / 1,813 holdings**.

## Generation Investment Management-specific notes

- **Files in raw dollars** (user confirmed) — auto-detection divided correctly; values stored as thousands.
- **Quality-growth/ESG fund** — long holding periods mean many positions span the full 10-year window. Most ticker failures were foreign-CUSIP collisions (BDX→BOX.F, Ingersoll-Rand, TE Connectivity, Accenture) and acquisitions (Cerner, Varian, Stericycle, National Instruments, LinkedIn, SolarCity, Mead Johnson, MuleSoft, Linear Technology, Abiomed, Covetrus, VWR).
- 22 CUSIP overrides applied; final null count: 0.

## Baupost-specific notes

- **Files in thousands** (not raw dollars) — auto-detection threshold (10,000,000 check) correctly does NOT divide. Values stored as-is and display correctly.
- **Heavy SPAC exposure** — Baupost held 30+ distinct SPACs across 2016–2023. Most had unique CUSIPs per warrant/unit/equity class. All have been overridden with their last-known US tickers (PSTH, RBAQ, SCAQ, GTYH, AGCB, VSPR, etc.).
- **Many special-situations / delisted companies** — Orexigen (OREX), Translate Bio (TBIO), Archaea Energy (LFG), IronSource (IS), Colony Capital (CLNY), Veritiv (VRTV), Kindred Biosciences (KIN), etc. All overridden.
- **94 total CUSIP overrides** added for Baupost (63 first pass + 31 second pass). Final null count: 0.

## Recurring Yahoo Finance ticker-failure patterns (across all funds)

1. **Foreign exchange collisions** — Yahoo resolves CUSIP to a German/Austrian/Swiss/Brazilian/Chilean exchange listing instead of the US one. Pattern: ticker ends in `.F`, `.MU`, `.SG`, `.DU`, `.VI`, `.SA`, `.SN`. Fix: hardcode the US ticker in `CUSIP_TICKER_OVERRIDES`.

2. **CUSIP collision to wrong active stock** — Multiple CUSIPs resolve to the same popular ticker (e.g., several CUSIPs returned `QBTS` for D-Wave Quantum). Fix: override each affected CUSIP individually.

3. **BRK-A/BRK-B confusion** — Yahoo maps CUSIP `084670108` (Class A) to `BRK-B`. Override to `BRK-A`.

4. **Renamed/reorganised companies** — Liberty Media tracking stocks, Encana→Ovintiv, VimpelCom→VEON, Och-Ziff→Sculptor, etc. Yahoo may return stale, empty, or wrong ticker. Always override.

5. **Acquired/delisted companies** — Tickers that no longer trade (Celgene, Aetna, Monsanto, Time Warner, Allergan, Whole Foods, etc.) return empty from Yahoo. Override to the last known US ticker for historical display.

6. **SPACs** — Yahoo returns Indian/other companies for SPAC tickers (e.g., `AJAXENGG.BO` for Ajax Financial Acquisitions Corp `G0190X*` CUSIPs). Each SPAC class/warrant has a distinct CUSIP — override all variants. Baupost was an especially SPAC-heavy fund.

**Why:** The `CUSIP_TICKER_OVERRIDES` map in `edgar-fetcher.ts` is applied at fetch time. For existing DB rows, apply direct SQL UPDATEs grouped by `fund_cik` after each seed.

## Ticker-fix conventions

- Always run the full audit SQL after a seed completes (filter on `ticker IS NULL OR ticker LIKE '%.%' OR ticker = 'not_found'`).
- Also check recent quarters for active-stock mismatches (e.g., QBTS collision).
- Add all fixes to both:
  1. The DB (`UPDATE sec_13f_holdings ... WHERE UPPER(cusip) = UPPER(...)`)
  2. The `cusip_ticker_map` table via upsert
  3. The `CUSIP_TICKER_OVERRIDES` map in `edgar-fetcher.ts` (for future re-seeds)
