# Research access and paywalls

The shared policy is `lib/api-zod/src/access-policy.ts`, exported as
`@workspace/api-zod/access-policy`. Both the UI and API use it.

## Current free-access period

`paywallsEnabled: false` opens all research to anonymous and signed-in visitors,
including advanced screens, all five Algo-Portfolios, and every Risk & Returns
Lab feature. Membership loading or a billing outage does not block free research.
The pricing page displays a free-access notice rather than subscription offers.

This does **not** change account roles, paid status, subscription records,
existing Stripe renewals, webhooks, billing management, or paid members' ad-free
eligibility. It does not disable Stock Watch authentication/ownership or admin
authorization. Never set everybody's `membership.premium` to true.

## Re-enable selected paywalls

1. Set `paywallsEnabled: true`.
2. Keep only the desired features in `premiumFeatures`. The existing list
   preserves the former Premium boundaries.
3. Build and publish the UI and API together.

Feature keys:

- `portfolios.cloning` (WhaleShadow), `.magic-formula`, `.blind-trust`,
  `.momentum`, `.lazy`
- `lab.performance`, `lab.risk`, `lab.portfolio`
- `lab.valuation.intrinsic-valuation`, `.indicators`, `.ratings`,
  `.board-leadership`, `.buybacks`, `.insider-activity`, `.analysis`, `.models`
- `screens.sp500.advanced`, `screens.nasdaq100.advanced`,
  `screens.sp400.advanced`, `screens.sp600.advanced`,
  `screens.djia.advanced`, `screens.adrs.advanced`

Parent keys work: `portfolios` gates every strategy; `lab.valuation` gates all
the formerly paid valuation research; `screens` gates all advanced screening.
Overview and basic sector/country screens retain their original public access.
Omitting a listed feature makes it free even when other paywalls are enabled.

Performance, risk, and custom portfolio tools share adjusted-price history.
Models and several valuation views also share fundamentals. Their common API
data remains public if any consuming feature is free; individual feature
interfaces are gated separately. Unknown protected API paths fail closed when
paywalls are enabled.

Subscription purchase/management code is preserved. The free-access switch is
not permission to cancel, refund, or pause existing subscribers' renewals.
