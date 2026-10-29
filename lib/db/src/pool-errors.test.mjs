import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pool } from "./index.ts";

after(async () => { await pool.end(); });

test("a dropped idle connection is logged without crashing and the pool reconnects", async () => {
  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();

  const error = Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
  const messages = [];
  const originalError = console.error;
  console.error = (...args) => { messages.push(args); };
  try {
    // Exercise pg's idle-client removal and pool error event, without killing a
    // real backend or changing database contents.
    assert.doesNotThrow(() => client.emit("error", error));
    assert.equal(messages.length, 1);
    assert.equal(messages[0][1].code, "57P01");
  } finally {
    console.error = originalError;
  }

  const result = await pool.query("SELECT 1 AS recovered");
  assert.equal(result.rows[0].recovered, 1);
});

test("query failures still reject rather than silently succeeding", async () => {
  await assert.rejects(pool.query("SELECT 1 / 0"), { code: "22012" });
  const result = await pool.query("SELECT 1 AS recovered");
  assert.equal(result.rows[0].recovered, 1);
});
