# Stock Research Platform

## Overview

A Bloomberg-lite stock research platform built as a pnpm monorepo. Users enter a stock symbol and get a comprehensive research dashboard with real-time data fetched from Yahoo Finance.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts
- **API framework**: Express 5
- **API data source**: yahoo-finance2 (v3) + SEC EDGAR API
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Features

- Stock symbol search (home page)
- Stock detail page with tabs: Overview, Financials, News, Profile, Filings
- Live price chart (1D/5D/1M/3M/6M/1Y/2Y/5Y/MAX timeframes) via Recharts
- Key statistics (52-week H/L, P/E fwd/ttm, market cap, enterprise value, net debt, beta, etc.)
- Clickable news articles
- SEC filings list via EDGAR API
- Company profile (sector, industry, employees, description, website)
- Financial statements: Income Statement, Balance Sheet, Cash Flow — quarterly/annual toggle
- Insider Transactions tab: Form 4 data via Yahoo Finance, signal-filtered (Open Market buys/sells), role badges (Officer/Director), transaction type inference

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/stock-research run dev` — run frontend locally

## Architecture

- `artifacts/api-server/src/routes/stock.ts` — All stock data routes (quote, chart, news, profile, financials, SEC filings)
- `artifacts/stock-research/src/` — React frontend
- `lib/api-spec/openapi.yaml` — OpenAPI contract
- `lib/api-client-react/` — Generated React Query hooks
- `lib/api-zod/` — Generated Zod validation schemas

## Data Sources

- **Yahoo Finance**: Quote, chart, news, profile, financials (via yahoo-finance2 v3)
- **SEC EDGAR**: Filings (via public EDGAR APIs — no key needed)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
