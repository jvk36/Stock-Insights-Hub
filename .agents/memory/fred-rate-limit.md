---
name: FRED API rate limiting on Replit
description: FRED's Akamai CDN blocks Replit IPs after ~9 serial requests; use hybrid Yahoo+FRED and batched enrichment to work around this
---

## The rule
FRED's Akamai CDN enforces a burst limit of approximately 9 unique series requests per session window from a Replit shared IP. Requests beyond ~9 return HTTP 403 (not 429). The window resets after ~60 seconds.

**Why:** Replit shared IPs trigger Akamai's bot detection heuristics. This is NOT the FRED API rate limit (120/min per key); it's the CDN layer in front of it.

## How to apply
1. **Hybrid strategy**: Use Yahoo Finance (`yf.quote()`) for any indicator available there (treasuries via `^TNX`, `^IRX`, VIX, FX pairs, commodities). These have no rate limit.
2. **Serial FRED fetches**: Space each FRED request 600ms apart to stay under burst detection within a batch.
3. **Priority ordering**: Put the most critical FRED series FIRST in the serial queue so the 9 that succeed are the most important ones (overview indicators).
4. **Batched enrichment**: After initial warmup caches ~19 indicators, run enrichment passes with 60-second gaps between batches of 8. Each pass unlocks ~5-8 more indicators. After ~6 passes (~8 minutes), most of 57 indicators are populated.
5. **Deduplication**: If two indicator IDs share the same FRED seriesId+units (e.g. `real_gdp` and `gdp_growth` both use `A191RL1Q225SBEA`), reuse the first fetch result to save budget.
6. **Startup warming**: Call `warmMacroCache()` from `index.ts` after server starts listening so users never wait for the initial FRED serial fetch.

## Yahoo Finance symbols confirmed working
- `^TNX` → 10Y Treasury yield  
- `^IRX` → 13-week T-bill (proxy for 3M, used to compute yield curve)
- `^VIX` → CBOE VIX
- `CL=F` → WTI Crude Oil
- `BZ=F` → Brent Crude Oil  
- `DX-Y.NYB` → USD Index (DXY)
- `EURUSD=X`, `USDJPY=X`, `USDCNY=X` → FX pairs
- Use `const yf = new YahooFinance()` instance — static methods return `never` type in TS

## NFP note
PAYEMS with `units=ch1` returns monthly change in thousands. 251 = 251K jobs added. Do NOT divide by 1000.
