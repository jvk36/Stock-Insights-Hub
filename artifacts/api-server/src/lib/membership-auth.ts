import type { Request } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, membershipDeletionsTable, membershipsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { membershipRole } from "./membership-role";

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
    const role = membershipRole(email, adminEmail);
    await tx.insert(membershipsTable).values({ clerkUserId: userId, email, role })
      .onConflictDoUpdate({
        target: membershipsTable.clerkUserId,
        set: { email, role, updatedAt: new Date() },
      });
    const [membership] = await tx.select().from(membershipsTable).where(eq(membershipsTable.clerkUserId, userId)).limit(1);
    return membership ?? null;
  });
}