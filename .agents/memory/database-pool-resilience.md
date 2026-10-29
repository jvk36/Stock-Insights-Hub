---
name: Database pool resilience
description: Idle PostgreSQL connection errors must not crash an otherwise healthy server.
---

Keep an error listener on the shared PostgreSQL pool. pg removes a broken idle client itself, but emits an error event that terminates Node if nobody handles it. Preserve rejection of active query failures; do not mask errors or automatically replay writes.

**Why:** Publishing encountered a PostgreSQL administrator disconnect during startup. The unhandled idle-pool event crashed the API even though its health endpoint had already returned 200.

**How to apply:** Maintain this distinction when changing database initialization or connection handling. Regression-test dropped idle clients and subsequent reconnection without terminating real database backends.
