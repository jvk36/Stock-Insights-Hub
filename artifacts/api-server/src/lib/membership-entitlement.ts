type EntitlementMembership = {
  role: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  deletionStartedAt: Date | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function hasStoredPremiumAccess(membership: EntitlementMembership | null) {
  if (!membership || membership.deletionStartedAt) return false;
  if (membership.role === "admin") return true;
  return membership.role === "paid" &&
    !!membership.subscriptionStatus &&
    ACTIVE_STATUSES.has(membership.subscriptionStatus) &&
    (!membership.currentPeriodEnd || membership.currentPeriodEnd > new Date());
}