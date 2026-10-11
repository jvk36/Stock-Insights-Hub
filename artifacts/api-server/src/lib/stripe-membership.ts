import { ReplitConnectors } from "@replit/connectors-sdk";
import { createSubscriptionVerifier } from "./subscription-verification";
import { logger } from "./logger";

export const verifyStripeMembership = createSubscriptionVerifier(async (id) => {
  if (!/^sub_[A-Za-z0-9]+$/.test(id)) throw new Error("Invalid subscription ID");
  // Resolve credentials in the running environment, never copy sandbox keys
  // into production or cache a credential-bearing client.
  const stripeFetch = new ReplitConnectors().createProxyFetch("stripe");
  const response = await stripeFetch(`/v1/subscriptions/${encodeURIComponent(id)}`, {
    method: "GET",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Stripe subscription lookup unavailable");
  return response.json();
}, Date.now, () => {
  // Do not log provider bodies, customer details, or credential-bearing errors.
  logger.warn("Stripe membership verification unavailable; retaining stored expiry");
});
