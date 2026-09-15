import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const membershipsTable = pgTable(
  "memberships",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().default("free"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"),
    plan: text("plan"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    deletionStartedAt: timestamp("deletion_started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("memberships_email_idx").on(t.email),
    uniqueIndex("memberships_stripe_customer_idx").on(t.stripeCustomerId),
    index("memberships_role_idx").on(t.role),
  ],
);

export type Membership = typeof membershipsTable.$inferSelect;

export const membershipDeletionsTable = pgTable("membership_deletions", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});