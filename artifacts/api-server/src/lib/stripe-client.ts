import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, membershipsTable, type Membership } from "@workspace/db";
import { eq } from "drizzle-orm";

const connectors = new ReplitConnectors();

async function stripeRequest<T>(path: string, method = "GET", fields?: Record<string, string>, idempotencyKey?: string) {
  const response = await connectors.proxy("stripe", path, {
    method,
    headers: fields ? {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    } : undefined,
    body: fields ? new URLSearchParams(fields).toString() : undefined,
  });
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Stripe request failed (${response.status})`);
  return payload;
}

type StripeProduct = { id: string };
type StripePrice = { id: string; unit_amount: number; metadata?: Record<string, string> };
type StripeCustomer = { id: string };
type StripeSession = { url: string | null };
type StripeSubscription = {
  id: string;
  status: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ current_period_end?: number; price?: { metadata?: Record<string, string> } }> };
};

export async function ensureMembershipPrices() {
  const found = await stripeRequest<{ data: StripeProduct[] }>(
    `/v1/products/search?query=${encodeURIComponent("metadata['app_key']:'stock_research_membership'")}`,
  );
  const product = found.data[0] ?? await stripeRequest<StripeProduct>("/v1/products", "POST", {
    name: "Stock Research Premium",
    description: "Full access to Stock Screens and Stock Insights",
    "metadata[app_key]": "stock_research_membership",
  });
  const listed = await stripeRequest<{ data: StripePrice[] }>(`/v1/prices?product=${product.id}&active=true&limit=100`);
  let monthly = listed.data.find((p) => p.metadata?.plan === "monthly" && p.unit_amount === 1500);
  let annual = listed.data.find((p) => p.metadata?.plan === "annual" && p.unit_amount === 15000);
  monthly ??= await stripeRequest<StripePrice>("/v1/prices", "POST", {
    product: product.id, currency: "usd", unit_amount: "1500",
    "recurring[interval]": "month", "metadata[plan]": "monthly",
  });
  annual ??= await stripeRequest<StripePrice>("/v1/prices", "POST", {
    product: product.id, currency: "usd", unit_amount: "15000",
    "recurring[interval]": "year", "metadata[plan]": "annual",
  });
  return { monthly: monthly.id, annual: annual.id };
}

export async function createStripeCustomer(email: string, clerkUserId: string) {
  return stripeRequest<StripeCustomer>("/v1/customers", "POST", {
    email, "metadata[clerkUserId]": clerkUserId,
  });
}

export async function createCheckout(customerId: string, priceId: string, clerkUserId: string, plan: string, successUrl: string, cancelUrl: string) {
  return stripeRequest<StripeSession>("/v1/checkout/sessions", "POST", {
    customer: customerId, mode: "subscription",
    "line_items[0][price]": priceId, "line_items[0][quantity]": "1",
    success_url: successUrl, cancel_url: cancelUrl,
    "subscription_data[metadata][clerkUserId]": clerkUserId,
    "subscription_data[metadata][plan]": plan,
  }, `membership-checkout-${clerkUserId}-${Math.floor(Date.now() / 1_800_000)}`);
}

export async function createBillingPortal(customerId: string, returnUrl: string) {
  return stripeRequest<StripeSession>("/v1/billing_portal/sessions", "POST", {
    customer: customerId, return_url: returnUrl,
  });
}

export async function refreshStripeEntitlement(membership: Membership) {
  if (!membership.stripeCustomerId || membership.role === "admin") return membership;
  const result = await stripeRequest<{ data: StripeSubscription[] }>(
    `/v1/subscriptions?customer=${membership.stripeCustomerId}&status=all&limit=20`,
  );
  const subscriptions = result.data.sort((a, b) => {
    const bEnd = b.current_period_end ?? b.items?.data?.[0]?.current_period_end ?? 0;
    const aEnd = a.current_period_end ?? a.items?.data?.[0]?.current_period_end ?? 0;
    return bEnd - aEnd;
  });
  const subscription = subscriptions.find((s) => ["active", "trialing"].includes(s.status)) ?? subscriptions[0];
  if (!subscription) {
    const [updated] = await db.update(membershipsTable).set({
      role: "free", stripeSubscriptionId: null, subscriptionStatus: null,
      currentPeriodEnd: null, plan: null, updatedAt: new Date(),
    }).where(eq(membershipsTable.clerkUserId, membership.clerkUserId)).returning();
    return updated ?? { ...membership, role: "free", stripeSubscriptionId: null, subscriptionStatus: null, currentPeriodEnd: null, plan: null };
  }
  const item = subscription.items?.data?.[0];
  const unixEnd = subscription.current_period_end ?? item?.current_period_end;
  const currentPeriodEnd = unixEnd ? new Date(unixEnd * 1000) : null;
  const premium = ["active", "trialing"].includes(subscription.status) &&
    !!currentPeriodEnd && currentPeriodEnd > new Date();
  const plan = subscription.metadata?.plan ?? item?.price?.metadata?.plan ?? null;
  const [updated] = await db.update(membershipsTable).set({
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    currentPeriodEnd,
    plan,
    role: premium ? "paid" : "free",
    updatedAt: new Date(),
  }).where(eq(membershipsTable.clerkUserId, membership.clerkUserId)).returning();
  return updated ?? membership;
}