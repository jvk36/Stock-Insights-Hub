import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// pg removes broken idle clients before emitting this event. Without a listener,
// a database restart/disconnect becomes an unhandled error and crashes Node.
// Do not retry queries here: in-flight operations must still report failures.
pool.on("error", (error: Error & { code?: string }) => {
  console.error("PostgreSQL idle connection closed; the pool will replace it.", {
    code: error.code,
  });
});
export const db = drizzle(pool, { schema });

export * from "./schema";
