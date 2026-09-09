---
name: Stripe OAuth entitlement sync
description: How to keep paid access authoritative when the connected Stripe account does not expose a raw API key or webhook signing secret.
---

Treat a Replit-connected Stripe account as OAuth-proxied unless the connection explicitly provides a supported managed signing-secret mechanism. Do not assume templates that require a raw API key or webhook secret will work.

**Why:** This connection intentionally withholds raw Stripe credentials. Building around assumed secrets causes billing initialization to fail and can tempt unsafe credential storage.

**How to apply:** Use the connector's supported proxy or managed facilities. Keep entitlement checks fail-closed and preserve a direct authoritative Stripe lookup as a safety net when push synchronization is unavailable.