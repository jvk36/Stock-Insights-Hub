# Stock Research Platform

A Bloomberg-lite stock research dashboard built with React, Express, and Yahoo Finance data. Enter any ticker symbol and get a comprehensive research view — price chart with earnings fair value overlay, financials, news, SEC filings, company profile, and insider transactions.

---

## Features

- **Price chart** with 1D / 5D / 1M / 3M / 6M / 1Y / 2Y / 5Y / MAX timeframes and an earnings-based fair value overlay (Fast Graphs-style)
- **Key stats** — market cap, enterprise value, forward/trailing P/E, net debt, beta, 52-week range, and more
- **Financial statements** — income statement, balance sheet, and cash flow; toggle between quarterly and annual
- **News feed** — latest articles with source and timestamp
- **SEC filings** — recent 10-K, 10-Q, 8-K, and proxy filings with direct document links
- **Company profile** — sector, industry, employee count, website, and business description
- **Insider transactions** — Form 4 data filtered for signal quality, with role badges and buy/sell signal indicators

---

## Insider Transactions

The Insiders tab surfaces Form 4 data from Yahoo Finance (with SEC EDGAR as a fallback). Transactions are categorised by signal quality:

| Code | Type | Signal |
|---|---|---|
| P | Open Market Purchase | High (green) |
| S | Open Market Sale | Moderate (red) |
| M / O / X | Option Exercise | Low (amber) |
| A / G / F | Award / Gift / Withholding | None |

Default filter shows only open-market buys and sells (the most informative signals). Pure passive 10%+ holders with no board or officer role are excluded.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, shadcn/ui, Recharts |
| Backend | Express 5, Node.js 24 |
| Data | yahoo-finance2 v3, SEC EDGAR public APIs |
| API contract | OpenAPI 3.1 → Orval codegen → React Query hooks + Zod validators |
| Build | esbuild (CJS bundle for API server) |
| Monorepo | pnpm workspaces |

---

## Project Structure

```
artifacts/
  api-server/          Express backend
    src/routes/
      stock.ts         All stock data endpoints
  stock-research/      React + Vite frontend
    src/
      pages/
        index.tsx      Symbol search home page
        stock.tsx      Stock detail page (tabs)
      components/
        stock/         Tab content components
          PriceChart.tsx
          InsiderTransactions.tsx
          ...

lib/
  api-spec/
    openapi.yaml       Single source of truth for the API contract
  api-client-react/    Auto-generated React Query hooks (do not edit)
  api-zod/             Auto-generated Zod schemas (do not edit)
```

---

## Data Sources

- **Yahoo Finance** (`yahoo-finance2` v3) — quote, chart, news, profile, financials, insider transactions. No API key required.
- **SEC EDGAR** (public REST API) — CIK lookup, filings index, Form 4 XML. No API key required. Rate limit: ~10 req/sec on the Archives endpoint.

---

## Development

### Prerequisites

- Node.js 24+
- pnpm 9+

### Install

```bash
pnpm install
```

### Run (development)

```bash
# API server (port from $PORT env var)
pnpm --filter @workspace/api-server run dev

# Frontend (port from $PORT env var)
pnpm --filter @workspace/stock-research run dev
```

### Typecheck

```bash
pnpm run typecheck
```

### Regenerate API client after editing openapi.yaml

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck:libs
```

---

## Documentation

- `replit.md` — environment notes, architecture overview, and key commands
- `summary.md` — full technical decisions, bug log, component design notes, and session transcript
