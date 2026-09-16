CREATE TABLE IF NOT EXISTS "watchlist" (
  "id" text PRIMARY KEY NOT NULL,
  "clerk_user_id" text NOT NULL,
  "ticker" text NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_user_ticker_idx" ON "watchlist" ("clerk_user_id", "ticker");
CREATE INDEX IF NOT EXISTS "watchlist_user_added_at_idx" ON "watchlist" ("clerk_user_id", "added_at");