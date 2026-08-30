---
name: Split-adjusted EPS basis
description: How to align historical SEC EPS with split-adjusted market prices without corrupting TTM windows or restated comparatives
---

Normalize each quarterly EPS observation to the market-price series' current split basis before calculating rolling TTM EPS. For a forward split after an unadjusted fact was filed, apply the inverse share ratio to EPS; reverse splits work in the opposite direction.

**Why:** Adjusting a finished TTM value based only on its period end leaves split-straddling windows internally inconsistent. SEC comparative facts filed after a split may already be restated, so adjusting solely from the reported quarter date can divide them twice.

**How to apply:** For SEC per-share facts, use the fact's filing date to determine which later splits still need to be applied, then calculate rolling or annualized EPS from the normalized quarters. Treat current Yahoo earnings-history values as already on the current basis unless evidence shows otherwise.