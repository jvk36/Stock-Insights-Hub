import type { NextFunction, Request, Response } from "express";
import { hasStoredPremiumAccess } from "./membership-entitlement.ts";

export type PremiumMembership = {
  role: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  deletionStartedAt: Date | null;
};

export function createRequirePremium(resolveMembership: (req: Request) => Promise<PremiumMembership | null>) {
  return async function requirePremiumMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      const membership = await resolveMembership(req);
      if (!membership) return res.status(401).json({ error: "Sign in required" });
      if (!hasStoredPremiumAccess(membership)) return res.status(403).json({ error: "Premium membership required" });
      res.locals.membership = membership;
      return next();
    } catch (error) {
      req.log.error({ err: error }, "Membership authorization failed");
      return res.status(500).json({ error: "Unable to verify membership" });
    }
  };
}