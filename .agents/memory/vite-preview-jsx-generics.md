---
name: Generic JSX in instrumented previews
description: Replit's development component instrumentation can corrupt explicit generic JSX even when production builds pass.
---

Prefer inferred generic props instead of explicit JSX type arguments in components rendered through the development preview.

**Why:** The development Cartographer plugin inserted metadata into a generic JSX tag before its type argument, producing malformed JSX and a Babel parse error. TypeScript and the production build both passed because production did not run that instrumentation.

**How to apply:** If preview reports an unexpected token beside injected component metadata and a generic type argument, remove the explicit JSX type argument and rely on prop inference. Verify the rendered preview, not only the production build; do not disable instrumentation to hide the issue.
