// Stripe can report billing periods on subscription items (new API versions)
// or on the subscription itself (older versions).
type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  current_period_end?: number;
  items?: { data: Array<{
    current_period_end?: number;
    price?: { recurring?: { interval?: string } | null };
  }> };
};

export type SubscriptionIdentity = {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
};

export type SubscriptionUpdate = {
  role: "paid" | "free";
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  plan?: "monthly" | "annual";
};

export type VerificationResult = {
  update: SubscriptionUpdate | null;
  billingUnavailable: boolean;
};

export function subscriptionUpdate(
  raw: unknown,
  identity: SubscriptionIdentity,
  now = Date.now(),
): SubscriptionUpdate {
  if (!raw || typeof raw !== "object") throw new Error("Invalid subscription");
  const subscription = raw as StripeSubscription;
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer : subscription.customer?.id;
  if (subscription.id !== identity.stripeSubscriptionId || customerId !== identity.stripeCustomerId) {
    throw new Error("Subscription ownership mismatch");
  }
  const statuses = ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"];
  if (!statuses.includes(subscription.status)) throw new Error("Unknown subscription status");
  const items = subscription.items?.data ?? [];
  const itemEnds = items.map((item) => item.current_period_end);
  const validTimestamp = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value > 0 &&
    Number.isFinite(new Date(value * 1000).getTime());
  const periodSeconds = validTimestamp(subscription.current_period_end)
    ? subscription.current_period_end
    : itemEnds.length > 0 && itemEnds.every(validTimestamp) ? Math.min(...itemEnds) : null;
  const currentPeriodEnd = periodSeconds === null ? null : new Date(periodSeconds * 1000);
  const active = subscription.status === "active" || subscription.status === "trialing";
  // Never turn a malformed active response into an unlimited entitlement.
  if (active && !currentPeriodEnd) throw new Error("Subscription period unavailable");
  const intervals = new Set(items.map((item) => item.price?.recurring?.interval));
  const plan = intervals.size === 1 && intervals.has("year") ? "annual"
    : intervals.size === 1 && intervals.has("month") ? "monthly" : undefined;
  return {
    role: active && currentPeriodEnd!.getTime() > now ? "paid" : "free",
    subscriptionStatus: subscription.status,
    currentPeriodEnd,
    ...(plan ? { plan } : {}),
  };
}

// Cache provider results, not membership rows. DB deletion/ownership guards still
// run on every request. Coalesce concurrent Premium requests into one lookup.
export function createSubscriptionVerifier(
  readSubscription: (id: string) => Promise<unknown>,
  now: () => number = Date.now,
  onFailure: () => void = () => {},
) {
  const cache = new Map<string, { expires: number; result: VerificationResult }>();
  const pending = new Map<string, Promise<VerificationResult>>();
  return async function verify(identity: SubscriptionIdentity): Promise<VerificationResult> {
    const key = `${identity.stripeCustomerId}:${identity.stripeSubscriptionId}`;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.result;
    const running = pending.get(key);
    if (running) return running;
    const request = (async () => {
      let result: VerificationResult;
      try {
        result = {
          update: subscriptionUpdate(await readSubscription(identity.stripeSubscriptionId), identity, now()),
          billingUnavailable: false,
        };
      } catch {
        // A 404 may mean wrong Stripe account/mode, not a cancellation.
        // Keep the stored entitlement; its original expiry remains enforced.
        onFailure();
        result = { update: null, billingUnavailable: true };
      }
      const ttl = result.billingUnavailable || result.update?.role !== "paid" ? 15_000 : 60_000;
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: now() + ttl, result });
      return result;
    })();
    pending.set(key, request);
    try {
      return await request;
    } finally {
      pending.delete(key);
    }
  };
}
