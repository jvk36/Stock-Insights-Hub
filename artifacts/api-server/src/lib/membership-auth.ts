import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, membershipDeletionsTable, membershipsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { refreshStripeEntitlement } from "./stripe-client";
import { hasStoredPremiumAccess } from "./membership-entitlement";

export async function getMembership(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const user = await clerkClient.users.getUser(userId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  if (!primary?.emailAddress || primary.verification?.status !== "verified") return null;
  const email = primary.emailAddress.trim().toLowerCase();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [deleted] = await tx.select().from(membershipDeletionsTable)
      .where(eq(membershipDeletionsTable.clerkUserId, userId))
      .limit(1);
    if (deleted) return null;
    const [existing] = await tx.select().from(membershipsTable).where(eq(membershipsTable.clerkUserId, userId)).limit(1);
    const role = adminEmail && email === adminEmail
      ? "admin"
      : existing?.role === "paid"
        ? "paid"
        : "free";
    await tx.insert(membershipsTable).values({ clerkUserId: userId, email, role })
      .onConflictDoUpdate({
        target: membershipsTable.clerkUserId,
        set: { email, role, updatedAt: new Date() },
      });
    const [membership] = await tx.select().from(membershipsTable).where(eq(membershipsTable.clerkUserId, userId)).limit(1);
    return membership ?? null;
  });
}

export function hasPremiumAccess(membership: Awaited<ReturnType<typeof getMembership>>) {
  return hasStoredPremiumAccess(membership);
}

export async function requirePremium(req: Request, res: Response, next: NextFunction) {
  try {
    let membership = await getMembership(req);
    if (!membership) return res.status(401).json({ error: "Sign in required" });
    try {
      membership = await refreshStripeEntitlement(membership);
    } catch (error) {
      req.log.warn(
        { err: error, clerkUserId: membership.clerkUserId },
        "Stripe entitlement refresh failed during premium authorization",
      );
      if (!hasPremiumAccess(membership)) {
        return res.status(503).json({
          error: "Unable to verify Premium membership while billing is unavailable",
        });
      }
    }
    if (!hasPremiumAccess(membership)) return res.status(403).json({ error: "Premium membership required" });
    res.locals.membership = membership;
    return next();
  } catch (error) {
    req.log.error({ err: error }, "Membership authorization failed");
    return res.status(500).json({ error: "Unable to verify membership" });
  }
}