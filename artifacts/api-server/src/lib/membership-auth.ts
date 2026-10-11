import type { Request } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, membershipDeletionsTable, membershipsTable } from "@workspace/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { hasStoredPremiumAccess } from "./membership-entitlement";
import { createRequirePremium } from "./premium-middleware";
import { verifyStripeMembership } from "./stripe-membership";

export async function getMembership(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const user = await clerkClient.users.getUser(userId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  if (!primary?.emailAddress || primary.verification?.status !== "verified") return null;
  const email = primary.emailAddress.trim().toLowerCase();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const membership = await db.transaction(async (tx) => {
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
  if (!membership) return null;
  if (membership.role === "admin" || membership.deletionStartedAt ||
    !membership.stripeSubscriptionId || !membership.stripeCustomerId) {
    return { ...membership, billingUnavailable: false };
  }
  // Do not hold a DB transaction/advisory lock while waiting for Stripe.
  const verification = await verifyStripeMembership({
    stripeSubscriptionId: membership.stripeSubscriptionId,
    stripeCustomerId: membership.stripeCustomerId,
  });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [deleted] = await tx.select().from(membershipDeletionsTable)
      .where(eq(membershipDeletionsTable.clerkUserId, userId)).limit(1);
    if (deleted) return null;
    if (verification.update) {
      await tx.update(membershipsTable).set({ ...verification.update, updatedAt: new Date() })
        .where(and(
          eq(membershipsTable.clerkUserId, userId),
          eq(membershipsTable.stripeSubscriptionId, membership.stripeSubscriptionId!),
          eq(membershipsTable.stripeCustomerId, membership.stripeCustomerId!),
          ne(membershipsTable.role, "admin"),
          isNull(membershipsTable.deletionStartedAt),
        ));
    }
    const [current] = await tx.select().from(membershipsTable)
      .where(eq(membershipsTable.clerkUserId, userId)).limit(1);
    return current ? { ...current, billingUnavailable: verification.billingUnavailable } : null;
  });
}

export function hasPremiumAccess(membership: Awaited<ReturnType<typeof getMembership>>) {
  return hasStoredPremiumAccess(membership);
}

export const requirePremium = createRequirePremium(getMembership);