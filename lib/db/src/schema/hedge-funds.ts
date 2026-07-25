import {
  pgTable,
  text,
  serial,
  bigint,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Hedge Funds ──────────────────────────────────────────────────────────────

export const hedgeFundsTable = pgTable(
  "hedge_funds",
  {
    id:        serial("id").primaryKey(),
    cik:       text("cik").notNull(),
    name:      text("name").notNull(),
    slug:      text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("hedge_funds_cik_idx").on(t.cik),
    uniqueIndex("hedge_funds_slug_idx").on(t.slug),
  ],
);

export const insertHedgeFundSchema = createInsertSchema(hedgeFundsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHedgeFund = z.infer<typeof insertHedgeFundSchema>;
export type HedgeFund = typeof hedgeFundsTable.$inferSelect;

// ─── SEC 13F Filings ──────────────────────────────────────────────────────────

export const sec13fFilingsTable = pgTable(
  "sec_13f_filings",
  {
    id:              serial("id").primaryKey(),
    fundCik:         text("fund_cik").notNull(),
    periodLabel:     text("period_label").notNull(),   // e.g. "Q1 2026"
    reportDate:      text("report_date").notNull(),    // YYYY-MM-DD
    filingDate:      text("filing_date").notNull(),    // YYYY-MM-DD
    accessionNumber: text("accession_number").notNull(),
    // Total portfolio value in thousands of dollars (from 13F cover page, or computed from holdings)
    totalValueThousands: bigint("total_value_thousands", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sec_13f_filings_accession_idx").on(t.accessionNumber),
    index("sec_13f_filings_cik_period_idx").on(t.fundCik, t.periodLabel),
  ],
);

export const insertSec13fFilingSchema = createInsertSchema(sec13fFilingsTable).omit({ id: true, createdAt: true });
export type InsertSec13fFiling = z.infer<typeof insertSec13fFilingSchema>;
export type Sec13fFiling = typeof sec13fFilingsTable.$inferSelect;

// ─── SEC 13F Holdings ─────────────────────────────────────────────────────────
// One row per (filing, name) after deduplication. SH/equity-only rows.

export const sec13fHoldingsTable = pgTable(
  "sec_13f_holdings",
  {
    id:               serial("id").primaryKey(),
    filingId:         bigint("filing_id", { mode: "number" }).notNull(),
    name:             text("name").notNull(),
    ticker:           text("ticker"),                  // null if unresolved
    cusip:            text("cusip").notNull(),          // last CUSIP seen for this name
    // market value in thousands of dollars
    marketValueThousands: bigint("market_value_thousands", { mode: "number" }).notNull(),
    shares:           bigint("shares", { mode: "number" }).notNull(),
  },
  (t) => [
    index("sec_13f_holdings_filing_idx").on(t.filingId),
    uniqueIndex("sec_13f_holdings_filing_name_idx").on(t.filingId, t.name),
  ],
);

export const insertSec13fHoldingSchema = createInsertSchema(sec13fHoldingsTable).omit({ id: true });
export type InsertSec13fHolding = z.infer<typeof insertSec13fHoldingSchema>;
export type Sec13fHolding = typeof sec13fHoldingsTable.$inferSelect;

// ─── CUSIP → Ticker Map ───────────────────────────────────────────────────────

export const cusipTickerMapTable = pgTable(
  "cusip_ticker_map",
  {
    cusip:     text("cusip").primaryKey(),
    ticker:    text("ticker"),            // null if lookup failed / not found
    source:    text("source").notNull(),  // "openfigi" | "manual" | "not_found"
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
);

export const insertCusipTickerMapSchema = createInsertSchema(cusipTickerMapTable);
export type InsertCusipTickerMap = z.infer<typeof insertCusipTickerMapSchema>;
export type CusipTickerMap = typeof cusipTickerMapTable.$inferSelect;
