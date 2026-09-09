import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { db, membershipDeletionsTable, membershipsTable } from "@workspace/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getMembership, hasPremiumAccess } from "../lib/membership-auth";
import { createBillingPortal, createCheckout, createStripeCustomer, deleteStripeBillingAccount, deleteStripeBillingAccountsForUser, ensureMembershipPrices, refreshStripeEntitlement } from "../lib/stripe-client";
import { isTrustedOrigin } from "../lib/trusted-origins";

const router: IRouter = Router();

router.use("/membership", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!isTrustedOrigin(req.get("origin"))) {
    return res.status(403).json({ error: "Request origin is not allowed" });
  }
  return next();
});

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
  if (membership.deletionStartedAt) return res.status(409).json({ error: "This account is being deleted" });
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
    try {
      const [updated] = await db.update(membershipsTable).set({ stripeCustomerId: customerId })
        .where(and(
          eq(membershipsTable.clerkUserId, membership.clerkUserId),
          isNull(membershipsTable.deletionStartedAt),
        ))
        .returning();
      if (updated) customerId = updated.stripeCustomerId!;
      else {
        await deleteStripeBillingAccount(customer.id);
        return res.status(409).json({ error: "This account is being deleted" });
      }
    } catch (error) {
      await deleteStripeBillingAccount(customerId);
      throw error;
    }
  }
  const prices = await ensureMembershipPrices();
  const [checkoutMembership] = await db.select().from(membershipsTable)
    .where(eq(membershipsTable.clerkUserId, membership.clerkUserId))
    .limit(1);
  if (!checkoutMembership || checkoutMembership.deletionStartedAt) {
    await deleteStripeBillingAccountsForUser(membership.clerkUserId, customerId);
    return res.status(409).json({ error: "This account is being deleted" });
  }
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
  if (membership.deletionStartedAt) return res.status(409).json({ error: "This account is being deleted" });
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
  return res.json({
    users: users.map((user) => ({
      clerkUserId: user.clerkUserId,
      email: user.email,
      role: user.role,
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      currentPeriodEnd: user.currentPeriodEnd,
      createdAt: user.createdAt,
      deletionStartedAt: user.deletionStartedAt,
      hasBillingAccount: Boolean(
        user.stripeCustomerId ||
        user.stripeSubscriptionId ||
        user.plan ||
        user.role === "paid"
      ),
      deletable: user.clerkUserId !== membership.clerkUserId,
    })),
  });
});

router.delete("/membership/admin/users/:clerkUserId", async (req, res) => {
  const administrator = await getMembership(req);
  if (!administrator) return res.status(401).json({ error: "Sign in required" });
  if (administrator.role !== "admin") return res.status(403).json({ error: "Administrator access required" });

  const targetClerkUserId = req.params.clerkUserId;
  if (!/^user_[A-Za-z0-9]+$/.test(targetClerkUserId)) {
    return res.status(400).json({ error: "Invalid user" });
  }
  if (targetClerkUserId === administrator.clerkUserId) {
    return res.status(400).json({ error: "You cannot delete your own administrator account" });
  }

  const [target] = await db.select().from(membershipsTable)
    .where(eq(membershipsTable.clerkUserId, targetClerkUserId))
    .limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (req.body?.confirmEmail !== target.email) {
    return res.status(400).json({ error: "Deletion confirmation does not match the user" });
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${targetClerkUserId}))`);
    await tx.insert(membershipDeletionsTable).values({ clerkUserId: targetClerkUserId })
      .onConflictDoNothing();
    await tx.update(membershipsTable).set({ deletionStartedAt: new Date() })
      .where(and(
        eq(membershipsTable.clerkUserId, targetClerkUserId),
        isNull(membershipsTable.deletionStartedAt),
      ));
  });

  const hasBillingAccount = Boolean(
    target.stripeCustomerId ||
    target.stripeSubscriptionId ||
    target.plan ||
    target.role === "paid"
  );
  let billingCleanup: "deleted" | "not_required" = "not_required";
  if (hasBillingAccount) {
    try {
      // Discover by immutable Clerk metadata as well as the locally stored ID so
      // checkout/delete races and earlier partial writes cannot orphan billing.
      await deleteStripeBillingAccountsForUser(targetClerkUserId, target.stripeCustomerId);
      billingCleanup = "deleted";
    } catch (error) {
      req.log.warn({ err: error, targetClerkUserId }, "Stripe cleanup failed during member deletion");
      return res.status(503).json({
        error: "Billing cleanup could not be completed because Stripe is unavailable. Reconnect Stripe, then retry deletion.",
        retryable: true,
        deletionPending: true,
      });
    }
  }

  try {
    await clerkClient.users.deleteUser(targetClerkUserId);
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "status" in error && error.status === 404)) {
      req.log.warn({ err: error, targetClerkUserId }, "Clerk cleanup failed during member deletion");
      return res.status(502).json({
        error: "The sign-in account could not be removed. Please retry deletion.",
        retryable: true,
        deletionPending: true,
      });
    }
  }
  await db.delete(membershipsTable).where(eq(membershipsTable.clerkUserId, targetClerkUserId));
  return res.json({ deleted: true, billingCleanup });
});

export default router;