---
name: Stripe OAuth entitlement sync
description: How to keep paid access authoritative when the connected Stripe account does not expose a raw API key or webhook signing secret.
---

Treat a Replit-connected Stripe account as OAuth-proxied unless the connection explicitly provides a supported managed signing-secret mechanism. Do not assume templates that require a raw API key or webhook secret will work.

**Why:** This connection intentionally withholds raw Stripe credentials. Building around assumed secrets causes billing initialization to fail and can tempt unsafe credential storage.

**How to apply:** Use the connector's supported proxy or managed facilities. Prefer a direct authoritative Stripe lookup. If Stripe is temporarily unavailable, honor only a previously verified active/trialing entitlement through its stored paid-through date; fail closed after expiry or for any non-active state.

Verify that the connected Stripe account and mode match the stored live subscriptions before using lookup failures to change access. A missing customer or subscription is not evidence of cancellation.

**Why:** A working sandbox connection could not retrieve existing production billing records, even though authentication succeeded.

**How to apply:** Check the account identity when existing IDs return `resource_missing`; resolve the account/mode mismatch rather than clearing membership or guessing a renewal date.