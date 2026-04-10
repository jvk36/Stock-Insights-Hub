# Project Summary: Bloomberg-Lite Stock Research Platform

## Goal

Build a comprehensive stock research dashboard where users enter a ticker symbol and get:
- A price chart with an earnings fair value overlay (Fast Graphs-style)
- News feed, SEC filings, company profile
- Quarterly/annual financial statements and key stats
- **Insider Transactions tab** showing Form 3/4 data filtered for signal quality

---

## Architecture

**Monorepo** managed by pnpm workspaces:

| Package | Role |
|---|---|
| `artifacts/api-server` | Express 5 backend, bundles with esbuild |
| `artifacts/stock-research` | React + Vite frontend |
| `lib/api-spec` | Single source of truth: `openapi.yaml` |
| `lib/api-client-react` | Auto-generated React Query hooks (via Orval) |
| `lib/api-zod` | Auto-generated Zod validators for route params |

**Codegen flow:** edit `openapi.yaml` → run `pnpm --filter @workspace/api-spec run codegen` (Orval) → both `api-client-react` and `api-zod` regenerate → run `pnpm run typecheck:libs` to rebuild declaration files.

---

## Key Technical Decisions

### Data Sources

| Feature | Source | Why |
|---|---|---|
| Quote, news, profile, financials, earnings | `yahoo-finance2` v3 (class-based: `new YahooFinance()`) | Reliable, no auth needed |
| Insider transactions | Yahoo Finance `insiderTransactions` quoteSummary module | **Primary**: no rate limits, covers recent Form 4 data |
| Insider transactions fallback | SEC EDGAR Form 4 XML at `data.sec.gov/submissions/CIK{CIK}.json` + `sec.gov/Archives/edgar/data/{CIK}/{acc}/form4.xml` | Used only if Yahoo Finance returns empty |
| CIK lookup | SEC EFTS search: `efts.sec.gov/LATEST/search-index?q="{symbol}"&forms=10-K` | `ciks[0]` field (not `entity_id`) |
| SEC filings list | `data.sec.gov/submissions/CIK{CIK}.json` filings.recent | Top 30 filtered by form type |
| Earnings history (fair value) | SEC EDGAR XBRL facts for EPS data | 61 quarterly data points for AAPL |
| Financial statements | Yahoo Finance `fundamentalsTimeSeries` (not deprecated `quoteSummary`) | Real income/balance/cashflow data |

### SEC EDGAR Rate Limiting

SEC EDGAR's `Archives` endpoint enforces ~10 req/sec. During development:
- Switched the **primary** insider data source to Yahoo Finance (no limits)
- EDGAR XML fallback uses batches of 3 with 400 ms delays between batches
- In-memory `form4Cache` (Map) avoids re-fetching the same XML on repeated API calls
- 429 responses trigger one retry after 1.5 s before returning null

### Form 4 XML Parsing

When the EDGAR fallback runs, Form 4 XML lives at:
```
https://www.sec.gov/Archives/edgar/data/{ISSUER_CIK}/{accFormatted}/form4.xml
```
Note: uses the **issuer's** CIK (e.g. Apple's `320193`), NOT the filer's CIK.

XML parsed with regex helpers (`xmlTagValue`, `xmlBlocks`) — no external XML parser added. Key fields extracted:
- `rptOwnerName`, `isDirector`, `isOfficer`, `isTenPercentOwner`, `officerTitle`
- `aff10b5One` (10b5-1 plan indicator — filing-level, not per-transaction)
- Per `<nonDerivativeTransaction>` and `<derivativeTransaction>`: `transactionCode`, `transactionShares`, `transactionPricePerShare`, `directOrIndirectOwnership`, `natureOfOwnership`

### Insider Signal Levels

| Code | Transaction Type | Signal |
|---|---|---|
| P | Open Market Purchase | `high` (green) |
| S | Open Market Sale | `moderate` (red) |
| M / O / X | Option Exercise | `low` (amber) |
| A | Grant / Award | `none` |
| G | Gift | `none` |
| F | Tax Withholding | `none` |

**Filtering rules:**
- Exclude reporters who are `isTenPercentOwner && !isDirector && !isOfficer` (pure passive institutional)
- Default UI filter: "Open Market" (shows only `high` + `moderate`)

### Yahoo Finance → Transaction Code Inference

Since Yahoo Finance returns `transactionText` (e.g. `"Sale at price 255.12 per share."`) rather than a Form 4 code, `inferTxCode()` maps text patterns to codes:
- Contains "option exercise" → `M`
- Contains "sale" / "sold" → `S`
- Contains "purchase" / "bought" → `P`
- Contains "award" / "grant" / "rsu" → `A`
- etc.

`filerRelation` (e.g. `"Director And Officer"`) is parsed with `parseRelation()` to set `isDirector`, `isOfficer`, `isTenPercentOwner` booleans.

---

## Bugs Fixed During Development

### 1. CIK Lookup: `ciks[0]` vs `entity_id`

The SEC EFTS search response has `_source.ciks` (array) not `entity_id`. Fix:
```ts
const rawCik = data?.hits?.hits?.[0]?._source?.ciks?.[0]
  ?? data?.hits?.hits?.[0]?._source?.entity_id;
```

### 2. 1D / 5D Chart X-Axis

Yahoo Finance chart returns full ISO timestamps for intraday ranges. The chart was converting them to date-only strings, collapsing all intraday points to one label. Fixed by passing the full ISO string through and formatting with locale time for 1D/5D ranges.

### 3. Earnings Fair Value Line Not Rendering

The earnings overlay was calculated but never passed to the chart series. Fixed by merging `fairValue` into each chart data point inside `useMemo` after both the price data and earnings history had loaded.

### 4. Financials Tab: Deprecated `quoteSummary` Modules

`incomeStatementHistory`, `balanceSheetHistory`, etc. were deprecated. Switched to `fundamentalsTimeSeries` with explicit `type` fields:
```ts
await yahooFinance.fundamentalsTimeSeries(symbol, {
  period1: "2019-01-01",
  type: "annualTotalRevenue,annualNetIncome,..."
});
```

### 5. SEC Filings: Links to Documents

Previously linked only to the EDGAR search page. Now generates both:
- `url`: filing index page (directory listing)
- `documentUrl`: direct link to the primary document file

### 6. TypeScript Build: Duplicate Export Conflict

`lib/api-zod/src/index.ts` re-exported from both `./generated/api` (Zod schemas) and `./generated/types` (TypeScript interfaces). Both exported identically named members (e.g. `GetStockChartParams`), causing `TS2308`. Fix: removed the `./generated/types` re-export — Zod schemas are sufficient and types can be inferred from them.

### 7. `logoUrl` Unreachable `??` Expression (TS2869)

Template literals are never null/undefined. Fixed:
```ts
// before
logoUrl: `https://logo.clearbit.com/${profile?.website?.replace(...)}` ?? null,
// after
logoUrl: profile?.website ? `https://logo.clearbit.com/${profile.website.replace(...)}` : null,
```

### 8. `ChartPoint` Type Mismatch (TS2345)

The spread of an API response object had optional fields typed as `T | undefined` while `ChartPoint` required `T | null`. Fixed by explicitly coercing each field: `open: point.open ?? null`, etc.

---

## Frontend Component: `InsiderTransactions.tsx`

Located at `artifacts/stock-research/src/components/stock/InsiderTransactions.tsx`.

**Filter buttons** (local state, no URL param):
- Open Market (default) — shows `high` + `moderate` signals
- Buys Only — `high` only
- Sells Only — `moderate` only
- All Transactions — unfiltered

**Table columns:** Date | Insider (with role/10b5-1 badges) | Title | Signal | Type | Shares | Price | Value | Link

**Row coloring:** green tint for buys, red tint for sells, neutral otherwise.

**Badges inline with name:**
- `Dir` — is a director
- `Officer` — is an officer
- `10%` — is a 10%+ owner (but still an insider, since pure passive owners are excluded)
- `10b5-1` — pre-planned trade (from `aff10b5One` flag in XML; always `false` when sourced from Yahoo Finance)
- `Indirect` / nature string — indirect ownership (trust, LLC, etc.)

Footer shows count of displayed vs total transactions, and a legend for signal codes.

---

## Shared Utilities in `stock.ts` (backend)

- **`lookupCik(symbol)`** — in-process cache (`cikCache` Map), hits EFTS search, strips leading zeros
- **`form4Cache`** — in-process Map keyed by `{cik}:{accession}`, stores raw XML or `null`
- **`fetchForm4(cik, accession)`** — fetches with retry on 429, validates presence of `<ownershipDocument>`
- **`parseForm4(xml, accession, cik)`** — returns array of transaction objects from one Form 4 filing
- **`inferTxCode(text)`** — maps Yahoo Finance transaction text to a Form 4 code letter
- **`parseRelation(rel)`** — maps Yahoo Finance `filerRelation` string to role booleans
- **`TX_CODE_MAP`** — maps all Form 4 codes to human-readable type and signal level

---

## Codegen Commands

```bash
# Regenerate API client and Zod validators from openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Rebuild TypeScript declaration files for lib packages
pnpm run typecheck:libs

# Full typecheck
pnpm run typecheck
```
