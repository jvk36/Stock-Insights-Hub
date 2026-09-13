import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { db, membershipDeletionsTable, membershipsTable } from "@workspace/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getMembership } from "../lib/membership-auth";
import { canDeleteMember, isAdministrator } from "../lib/membership-role";
import { isTrustedOrigin } from "../lib/trusted-origins";

const router: IRouter = Router();

router.use("/membership", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!isTrustedOrigin(req.get("origin"))) {
    return res.status(403).json({ error: "Request origin is not allowed" });
  }
  return next();
});

router.get("/membership/me", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const membership = await getMembership(req);
  if (!membership) return res.status(401).json({ authenticated: false, role: "free" });
  return res.json({ authenticated: true, role: membership.role, email: membership.email });
});

router.get("/membership/admin/users", async (req, res) => {
  const membership = await getMembership(req);
  if (!membership) return res.status(401).json({ error: "Sign in required" });
  if (!isAdministrator(membership.role)) return res.status(403).json({ error: "Administrator access required" });
  const users = await db.select().from(membershipsTable).orderBy(desc(membershipsTable.createdAt));
  return res.json({
    users: users.map((user) => ({
      clerkUserId: user.clerkUserId,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      deletionStartedAt: user.deletionStartedAt,
      deletable: user.clerkUserId !== membership.clerkUserId,
    })),
  });
});

router.delete("/membership/admin/users/:clerkUserId", async (req, res) => {
  const administrator = await getMembership(req);
  if (!administrator) return res.status(401).json({ error: "Sign in required" });
  if (!isAdministrator(administrator.role)) return res.status(403).json({ error: "Administrator access required" });

  const targetClerkUserId = req.params.clerkUserId;
  if (!/^user_[A-Za-z0-9]+$/.test(targetClerkUserId)) {
    return res.status(400).json({ error: "Invalid user" });
  }
  if (!canDeleteMember(administrator.clerkUserId, targetClerkUserId)) {
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
  return res.json({ deleted: true });
});

export default router;