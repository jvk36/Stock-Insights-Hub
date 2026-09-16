import { and, asc, eq } from "drizzle-orm";
import { db, watchlistTable } from "@workspace/db";
import { createWatchlistRouter, type WatchlistStore } from "./watchlist-router";

const productionStore: WatchlistStore = {
  async list(clerkUserId) {
    return db.select().from(watchlistTable).where(eq(watchlistTable.clerkUserId, clerkUserId)).orderBy(asc(watchlistTable.addedAt));
  },
  async add(clerkUserId, ticker) {
    try {
      const [entry] = await db.insert(watchlistTable).values({ id: crypto.randomUUID(), clerkUserId, ticker }).returning();
      return entry;
    } catch (error) {
      if (String(error).includes("watchlist_user_ticker_idx")) {
        const duplicate = new Error("Duplicate ticker");
        duplicate.name = "DuplicateTicker";
        throw duplicate;
      }
      throw error;
    }
  },
  async remove(clerkUserId, id) {
    const [deleted] = await db.delete(watchlistTable)
      .where(and(eq(watchlistTable.id, id), eq(watchlistTable.clerkUserId, clerkUserId))).returning();
    return deleted;
  },
};

export { createWatchlistRouter };
export default createWatchlistRouter({ store: productionStore });