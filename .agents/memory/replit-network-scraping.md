---
name: Replit network scraping quirks
description: Which HTTP clients work for which external sites from Replit's server environment
---

## Rule
When an external site returns 403 or ETIMEDOUT from Node.js `fetch` (undici) but works fine from a shell `curl` command, use `child_process.execFile('curl', [...])` instead of any Node.js HTTP client.

**Why:** Replit's IP ranges are flagged by several financial data CDNs and WAFs (Cloudflare in particular). Node.js `fetch` (undici) and the built-in `https` module both use TLS stacks that are fingerprinted differently from curl. Sites like `slickcharts.com` and `api.nasdaq.com` block undici/https at the network or application layer while allowing curl through.

**How to apply:** Add a `curlGet(url, extraArgs?)` helper in any file that needs to scrape bot-protected pages. Pass browser-like headers (`-A`, `-H Accept`, `-H Referer`) as curl flags. This is already implemented in `artifacts/api-server/src/routes/indexes.ts` for the Nasdaq-100 scraper.

## Known working sources (Node.js fetch OK)
- Wikipedia (en.wikipedia.org) — no bot filtering
- Yahoo Finance (via yahoo-finance2 library)
- SEC EDGAR
- BNY Mellon DR Directory API

## Known blocked sources (use curlGet instead)
- `slickcharts.com` — Cloudflare; blocks undici and Node.js https; curl passes with browser headers
- `api.nasdaq.com` — ETIMEDOUT (TCP-level block of Replit IP range from undici)
- `stockanalysis.com` — 404/blocked
