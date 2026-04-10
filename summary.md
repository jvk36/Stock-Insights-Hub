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

---

## Chat Transcript

This section records the full session conversation including messages, reasoning, and actions taken.

---

### Session Start — Provided Context

The session began with an injected project summary:

**Project goal:** Bloomberg-lite stock research platform. Users enter a symbol and get a dashboard with price chart + earnings fair value overlay, news, SEC filings, company profile, financial statements, and an Insider Transactions tab.

**Progress at session start:**
- Four bugs already fixed: 1D/5D X-axis real market times; earnings fair value line spanning 2008–2025 via corrected CIK lookup (`ciks[0]` not `entity_id`); Financials switched to `fundamentalsTimeSeries`; Filings tab linking to actual documents.
- Performance: shared `lookupCik()` helper with in-process cache; price chart renders immediately without waiting for earnings overlay.
- Insider Transactions research complete: Yahoo Finance `insiderTransactions` module available; raw Form 4 XML structure understood.

**Scratchpad notes:**
- Form 4 XML at `data.sec.gov/Archives/edgar/data/{issuerCIK}/{acc}/form4.xml`
- Key filter: codes P/S = signal, M = low signal, A/G/F = no signal
- Exclude pure `isTenPercentOwner` reporters; flag `aff10b5One` as 10b5-1
- `yahoo-finance2` v3 uses class-based API: `new YahooFinance()`

---

### Message 1 — User

> "Could you finish this now that I have the credits."
>
> *(Canvas viewport showed the stock research platform running at `/stock/AAPL`)*

---

### Agent Response & Actions — Implementing Insider Transactions

#### Exploration

**Read** `lib/api-spec/openapi.yaml` to understand existing endpoint/schema patterns (sec-filings used as the template).

**Grep** for the sec-filings route line number in `stock.ts`.

**Read** `artifacts/stock-research/src/pages/stock.tsx` to see the tab structure (Overview / Financials / News / Profile / Filings — all using `<Tabs>` / `<TabsContent>`).

#### Proof-of-Concept: Form 4 XML

**Bash — fetch via XSLT URL:**
```
GET https://www.sec.gov/Archives/edgar/data/320193/000114036126013192/xslF345X06/form4.xml
→ 200 but returned rendered HTML (XSLT transform), not raw XML
```

**Bash — fetch raw XML:**
```
GET https://www.sec.gov/Archives/edgar/data/320193/000114036126013192/form4.xml
→ 200, returned real XML with <ownershipDocument>
```
Key fields confirmed in XML: `rptOwnerName`, `isOfficer`, `aff10b5One`, `transactionCode`, `transactionShares`, `transactionPricePerShare`, `directOrIndirectOwnership`, `natureOfOwnership`.

Note: XML is stored under the **issuer's** CIK (`320193` = Apple), not the filer's CIK.

#### OpenAPI Spec

**Edit** `openapi.yaml` — added:
- New path: `GET /stock/{symbol}/insider-transactions` → operationId `getInsiderTransactions`
- New schemas: `InsiderTransaction` (15 fields) and `InsiderTransactionsResponse`

#### Codegen

**Bash:**
```
pnpm --filter @workspace/api-spec run codegen
→ Orval regenerated api-client-react and api-zod successfully
```

**Grep** confirmed `useGetInsiderTransactions` hook generated at line 766 of `api-client-react/src/generated/api.ts`.

#### Backend Route (`stock.ts`)

**Edit** — added `GetInsiderTransactionsParams` to imports.

**Edit** — added before the `sec-filings` route:
- XML parser helpers: `xmlTagValue(xml, tag)` and `xmlBlocks(xml, tag)` using regex (no external XML parser)
- `TX_CODE_MAP` — maps all Form 4 codes (P/S/M/A/G/F/D/C/E/H/I/J/K/L/O/U/W/X/Z) to type strings and signal levels
- `form4Cache` — `Map<string, string | null>` for in-process XML caching
- `fetchForm4(cik, accession)` — fetches from EDGAR with retry on 429, validates `<ownershipDocument>` presence
- `parseForm4(xml, accession, cik)` — extracts all transaction fields from nonDerivativeTable and derivativeTable blocks; filters out pure 10% passive owners
- Route handler: looked up CIK → fetched submissions → collected Form 4 accessions → batch-fetched XMLs → parsed → sorted by date desc

#### Frontend Component

**Write** `artifacts/stock-research/src/components/stock/InsiderTransactions.tsx`:
- `useGetInsiderTransactions` hook with React Query
- Local `filter` state: `"open-market" | "buys" | "sells" | "all"` (default: `"open-market"`)
- `useMemo` to filter transactions
- `<SignalBadge>` sub-component with TrendingUp/TrendingDown/Minus icons
- Full responsive table with hidden columns at small breakpoints
- Role badges (Dir / Officer / 10% / 10b5-1 / Indirect) inline with insider name
- Row background tint: emerald for buys, rose for sells
- Footer: count + signal legend

**Edit** `stock.tsx` — added `import InsiderTransactions`, added `<TabsTrigger value="insiders">Insiders</TabsTrigger>`, and `<TabsContent value="insiders"><InsiderTransactions symbol={symbol!} /></TabsContent>`.

#### Restart & First Test

**Restart** both workflows. **Screenshot** showed "Insiders" tab visible in the tab bar alongside Overview / Financials / News / Profile / Filings.

**Bash — curl test:**
```
GET /api/stock/AAPL/insider-transactions
→ { cik: "320193", transactions: [] }
```
Zero transactions returned.

#### Debugging the Empty Response

**Bash — direct EDGAR XML fetch:**
```
GET https://www.sec.gov/Archives/edgar/data/320193/000114036126013192/form4.xml
→ 429 Too Many Requests
```
Root cause: the backend was collecting ALL 589 Form 4 entries from the submissions file and attempting to fetch all 589 XMLs concurrently — triggered EDGAR's rate limiter. The `form4Cache` had stored `null` for all entries, so subsequent API calls returned empty.

**Bash — check AAPL submissions file:**
```json
{ "Form 4 count": 589, "Forms": ["4", "144", "SCHEDULE 13G/A", "8-K", ...] }
```
Confirmed 589 Form 4s exist. The missing `slice(0, N)` limit was the culprit.

#### Switch to Yahoo Finance as Primary Source

Decision: Instead of fighting EDGAR rate limits, use Yahoo Finance `insiderTransactions` quoteSummary module as the **primary** data source. EDGAR XML parsing kept as fallback.

**Edit** `stock.ts` — replaced the route body:
- `inferTxCode(text)` — maps Yahoo Finance `transactionText` patterns to Form 4 codes
- `parseRelation(rel)` — maps `filerRelation` string to `{ isDirector, isOfficer, isTenPercentOwner }`
- Route logic:
  1. `Promise.all([yahooFinance.quoteSummary(..., { modules: ["insiderTransactions"] }), lookupCik(symbol)])`
  2. If Yahoo Finance returns transactions → transform and return immediately
  3. Fallback: fetch EDGAR submissions → take top 20 Form 4s → batch of 3 with 400 ms delays → XML parse

**Restart** API server.

**Bash — curl test:**
```json
{ "cik": "320193", "transactions": 73, "signals": { "moderate": 30, "none": 43 } }
```
73 transactions returned. Sample:
```json
{
  "insiderName": "O'BRIEN DEIRDRE",
  "title": "Officer",
  "transactionCode": "S",
  "transactionType": "Open Market Sale",
  "signalLevel": "moderate",
  "shares": 30002,
  "pricePerShare": 255.12,
  "totalValue": 7660875
}
```

#### TypeScript Fixes

**Bash — typecheck frontend:**
```
src/components/stock/InsiderTransactions.tsx(166,32): error TS7006: Parameter 'tx' implicitly has an 'any' type.
src/components/stock/PriceChart.tsx(63,44): error TS2345: Argument of type ...undefined... not assignable to ChartPoint
+ Multiple "Module has no exported member" errors across all files
```

**Bash — typecheck backend:**
```
src/routes/stock.ts: all params (GetStockQuoteParams etc.) "has no exported member"
src/routes/stock.ts(263,16): error TS2869: Right operand of ?? is unreachable
```

Root cause of "no exported member" errors: `tsc --build` was failing, so `lib/api-zod/dist/` and `lib/api-client-react/dist/` had stale declaration files.

**Bash — typecheck:libs:**
```
lib/api-zod/src/index.ts(2,1): error TS2308: Module "./generated/api" has already exported 'GetStockChartParams'
```
Root cause: Orval generates Zod schemas in `generated/api.ts` AND TypeScript interfaces in `generated/types/` — both with identical names. `index.ts` re-exported both → conflict.

**Write** `lib/api-zod/src/index.ts` — removed `export * from "./generated/types"`, kept only `export * from "./generated/api"`. (The `HealthCheckResponse` used in `health.ts` is a Zod schema in `api.ts`, not just a type — confirmed safe.)

**Bash — typecheck:libs → success (no errors).**

**Edit** `stock.ts` line 263 — `logoUrl` fix:
```ts
// before: template literal ?? null  (unreachable ?? per TS2869)
logoUrl: `https://logo.clearbit.com/${profile?.website?.replace(...)}` ?? null,
// after:
logoUrl: profile?.website ? `https://logo.clearbit.com/${...}` : null,
```

**Edit** `PriceChart.tsx` — ChartPoint type fix, coercing `undefined` → `null`:
```ts
return { ...point, fairValue, open: point.open ?? null, high: point.high ?? null,
         low: point.low ?? null, close: point.close ?? null, volume: point.volume ?? null };
```

**Bash — typecheck backend: success. Bash — typecheck frontend: success.** Zero errors across both.

#### Final Verification

**Screenshot** of `/stock/MSFT` — app loads correctly, Insiders tab visible.

**Bash — final curl:**
```
GET /api/stock/AAPL/insider-transactions → 73 transactions, signals: { moderate: 30, none: 43 }
```

---

### Message 2 — User

> "Could you summarize the conversation and code decisions into a markdown file (summary.md) and make it be part of this project (similar to replit.md)?"

**Agent:** Wrote `summary.md` covering: goal, architecture, key technical decisions, all 8 bugs fixed, the InsiderTransactions component, backend utilities, and codegen commands. Updated `replit.md` to add the Insider Transactions feature to the features list.

---

### Message 3 — User

> "Will the file be updated at each checkpoint from this point on?"

**Agent:** Explained that `summary.md` is a static file. Checkpoints include it as-is, but it won't auto-update. It needs to be explicitly edited when asked.

---

### Message 4 — User

> "Could you add the chat transcript itself (including messages & actions) into the file?"

**Agent:** Read `summary.md`, then appended this `## Chat Transcript` section.
