import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const membershipsTable = pgTable(
  "memberships",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().default("free"),
    deletionStartedAt: timestamp("deletion_started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("memberships_email_idx").on(t.email),
    index("memberships_role_idx").on(t.role),
  ],
);

export type Membership = typeof membershipsTable.$inferSelect;

export const membershipDeletionsTable = pgTable("membership_deletions", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});