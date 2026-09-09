import { Router, type IRouter } from "express";
import { db, membershipsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getMembership, hasPremiumAccess } from "../lib/membership-auth";
import { createBillingPortal, createCheckout, createStripeCustomer, ensureMembershipPrices, refreshStripeEntitlement } from "../lib/stripe-client";

const router: IRouter = Router();

router.get("/membership/plans", (_req, res) => {
  res.json({ monthly: { amount: 15, interval: "month" }, annual: { amount: 150, interval: "year" } });
});

function getFrontendOrigin() {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("PUBLIC_APP_URL must use HTTPS");
    return url.origin;
  }
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (!replitDomain) throw new Error("PUBLIC_APP_URL or REPLIT_DOMAINS is required");
  return `https://${replitDomain}`;
}

router.get("/membership/me", async (req, res) => {
  let membership = await getMembership(req);
  if (!membership) return res.status(401).json({ authenticated: false, premium: false, role: "free" });
  membership = await refreshStripeEntitlement(membership);
  return res.json({
    authenticated: true, premium: hasPremiumAccess(membership), role: membership.role,
    email: membership.email, plan: membership.plan, subscriptionStatus: membership.subscriptionStatus,
    currentPeriodEnd: membership.currentPeriodEnd,
  });
});

router.post("/membership/checkout", async (req, res) => {
  let membership = await getMembership(req);
  if (!membership) return res.status(401).json({ error: "Sign in required" });
  if (membership.role === "admin") return res.status(400).json({ error: "Administrators already have premium access" });
  membership = await refreshStripeEntitlement(membership);
  if (hasPremiumAccess(membership)) return res.status(409).json({ error: "A premium subscription is already active" });
  const plan: "monthly" | "annual" | undefined = req.body?.plan;
  if (plan !== "monthly" && plan !== "annual") return res.status(400).json({ error: "Invalid plan" });
  const attemptId = req.body?.attemptId;
  if (typeof attemptId !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(attemptId)) {
    return res.status(400).json({ error: "Invalid checkout attempt" });
  }
  let customerId = membership.stripeCustomerId;
  if (!customerId) {
    const customer = await createStripeCustomer(membership.email, membership.clerkUserId);
    customerId = customer.id;
    await db.update(membershipsTable).set({ stripeCustomerId: customerId }).where(eq(membershipsTable.clerkUserId, membership.clerkUserId));
  }
  const prices = await ensureMembershipPrices();
  const origin = getFrontendOrigin();
  const basePath = typeof req.body?.basePath === "string" && /^\/[a-z0-9-]*$/i.test(req.body.basePath) ? req.body.basePath : "";
  const session = await createCheckout(
    customerId, prices[plan], membership.clerkUserId, plan, attemptId,
    `${origin}${basePath}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    `${origin}${basePath}/pricing`,
  );
  return res.json({ url: session.url });
});

router.post("/membership/portal", async (req, res) => {
  const membership = await getMembership(req);
  if (!membership) return res.status(401).json({ error: "Sign in required" });
  if (!membership.stripeCustomerId) return res.status(400).json({ error: "No billing account found" });
  const origin = getFrontendOrigin();
  const basePath = typeof req.body?.basePath === "string" && /^\/[a-z0-9-]*$/i.test(req.body.basePath) ? req.body.basePath : "";
  const session = await createBillingPortal(membership.stripeCustomerId, `${origin}${basePath}/account`);
  return res.json({ url: session.url });
});

router.get("/membership/admin/users", async (req, res) => {
  const membership = await getMembership(req);
  if (!membership) return res.status(401).json({ error: "Sign in required" });
  if (membership.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  const users = await db.select().from(membershipsTable).orderBy(desc(membershipsTable.createdAt));
  return res.json({ users });
});

export default router;