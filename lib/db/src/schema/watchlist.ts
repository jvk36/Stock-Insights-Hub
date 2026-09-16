import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const watchlistTable = pgTable(
  "watchlist",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    ticker: text("ticker").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("watchlist_user_ticker_idx").on(t.clerkUserId, t.ticker),
    index("watchlist_user_added_at_idx").on(t.clerkUserId, t.addedAt),
  ],
);

export type WatchlistEntry = typeof watchlistTable.$inferSelect;