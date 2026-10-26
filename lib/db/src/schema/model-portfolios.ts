import { pgTable, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const modelPortfoliosTable = pgTable("model_portfolios", {
  slug: text("slug").primaryKey(),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const modelPortfolioEventsTable = pgTable("model_portfolio_events", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().references(() => modelPortfoliosTable.slug),
  date: text("date").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const modelPortfolioSnapshotsTable = pgTable("model_portfolio_snapshots", {
  slug: text("slug").notNull().references(() => modelPortfoliosTable.slug),
  date: text("date").notNull(),
  payload: jsonb("payload").notNull(),
}, (table) => [primaryKey({ columns: [table.slug, table.date] })]);

export const insertModelPortfolioSchema = createInsertSchema(modelPortfoliosTable);
export type ModelPortfolio = typeof modelPortfoliosTable.$inferSelect;
export type InsertModelPortfolio = typeof modelPortfoliosTable.$inferInsert;
