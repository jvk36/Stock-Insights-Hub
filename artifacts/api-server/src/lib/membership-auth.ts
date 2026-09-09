import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, membershipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { refreshStripeEntitlement } from "./stripe-client";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function getMembership(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const user = await clerkClient.users.getUser(userId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  if (!primary?.emailAddress || primary.verification?.status !== "verified") return null;
  const email = primary.emailAddress.trim().toLowerCase();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const [existing] = await db.select().from(membershipsTable).where(eq(membershipsTable.clerkUserId, userId)).limit(1);
  const role = adminEmail && email === adminEmail
    ? "admin"
    : existing?.role === "paid"
      ? "paid"
      : "free";
  await db.insert(membershipsTable).values({ clerkUserId: userId, email, role })
    .onConflictDoUpdate({
      target: membershipsTable.clerkUserId,
      set: { email, role, updatedAt: new Date() },
    });
  const [membership] = await db.select().from(membershipsTable).where(eq(membershipsTable.clerkUserId, userId)).limit(1);
  return membership ?? null;
}

export function hasPremiumAccess(membership: Awaited<ReturnType<typeof getMembership>>) {
  if (!membership) return false;
  if (membership.role === "admin") return true;
  return membership.role === "paid" &&
    !!membership.subscriptionStatus &&
    ACTIVE_STATUSES.has(membership.subscriptionStatus) &&
    (!membership.currentPeriodEnd || membership.currentPeriodEnd > new Date());
}

export async function requirePremium(req: Request, res: Response, next: NextFunction) {
  try {
    let membership = await getMembership(req);
    if (!membership) return res.status(401).json({ error: "Sign in required" });
    membership = await refreshStripeEntitlement(membership);
    if (!hasPremiumAccess(membership)) return res.status(403).json({ error: "Premium membership required" });
    res.locals.membership = membership;
    return next();
  } catch (error) {
    req.log.error({ err: error }, "Membership authorization failed");
    return res.status(500).json({ error: "Unable to verify membership" });
  }
}