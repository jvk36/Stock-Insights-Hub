---
name: Replit network scraping quirks
description: Which HTTP clients work for which external sites from Replit's server environment
---

## Rule
When an external site returns 403 or ETIMEDOUT from Node.js `fetch` (undici) but works fine from a shell `curl` command, use `child_process.execFile('curl', [...])` instead of any Node.js HTTP client.

**Why:** Replit's IP ranges are flagged by several financial data CDNs and WAFs (Cloudflare in particular). Node.js `fetch` (undici) and the built-in `https` module both use TLS stacks that are fingerprinted differently from curl. Sites like `slickcharts.com` and `api.nasdaq.com` block undici/https at the network or application layer while allowing curl through.

**How to apply:** Add a `curlGet(url, extraArgs?)` helper in any file that needs to scrape bot-protected pages. Pass browser-like headers (`-A`, `-H Accept`, `-H Referer`) as curl flags. This is already implemented in `artifacts/api-server/src/routes/indexes.ts` for the Nasdaq-100 scraper.

## Autoscale has no persistent disk across cold starts

Replit autoscale spins down to zero when idle and provisions a fresh container on the next request. That container starts with an empty filesystem — disk cache files written by a previous instance are gone. This means in-memory warm-up caches (metrics enrichment, scraped stock lists) must be re-run on every cold start (~90 s). For servers that use disk caching to survive restarts, the deployment target must be **vm** (always running), not autoscale. Change deployment type in the Publishing Settings UI — setting `deploymentTarget = "vm"` in `.replit` alone does NOT take effect without changing it in the UI as well.

## Production PATH quirk — resolve curl at startup

`execFile("curl", ...)` silently fails with ENOENT in the production vm container because the Node process does not inherit the Nix store PATH (where curl lives in dev). Fix: resolve the binary once at module load using `execSync("which curl")` and pass the absolute path to `execFile`.

```ts
const CURL_BIN = (() => {
  try { return execSync("which curl", { encoding: "utf8" }).trim(); }
  catch { return "curl"; }
})();
// then: execFile(CURL_BIN, args, ...)
```

**Why:** The production run command (`node dist/index.mjs`) is invoked without a login shell, so the Nix profile PATH (`/nix/store/.../bin`) is not set. `which curl` is invoked via `execSync` which itself uses `/bin/sh -c which curl`, and that shell does have the Nix PATH.

## Known working sources (Node.js fetch OK)
- Wikipedia (en.wikipedia.org) — no bot filtering
- Yahoo Finance (via yahoo-finance2 library)
- SEC EDGAR
- BNY Mellon DR Directory API

## Known blocked sources (use curlGet instead)
- `slickcharts.com` — Cloudflare; blocks undici and Node.js https; curl passes with browser headers
- `api.nasdaq.com` — ETIMEDOUT (TCP-level block of Replit IP range from undici)
- `stockanalysis.com` — 404/blocked
