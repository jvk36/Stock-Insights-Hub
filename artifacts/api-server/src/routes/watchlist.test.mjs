import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { createRequirePremium } from "../lib/premium-middleware.ts";
import { createWatchlistRouter } from "./watchlist-router.ts";

const memberships = {
  paid: { role: "paid", subscriptionStatus: "active", currentPeriodEnd: null, deletionStartedAt: null },
  free: { role: "free", subscriptionStatus: null, currentPeriodEnd: null, deletionStartedAt: null },
};

const records = [
  { id: "aapl-a", clerkUserId: "user-a", ticker: "AAPL", addedAt: new Date("2025-01-01T00:00:00Z") },
  { id: "msft-b", clerkUserId: "user-b", ticker: "MSFT", addedAt: new Date("2025-01-02T00:00:00Z") },
];
const store = {
  async list(userId) {
    return records.filter((entry) => entry.clerkUserId === userId);
  },
  async add(userId, ticker) {
    const entry = { id: `${ticker}-${userId}`, clerkUserId: userId, ticker, addedAt: new Date() };
    records.push(entry);
    return entry;
  },
  async remove(userId, id) {
    const index = records.findIndex((entry) => entry.id === id && entry.clerkUserId === userId);
    if (index < 0) return undefined;
    return records.splice(index, 1)[0];
  },
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.log = { warn() {}, error() {} };
  next();
});
app.use(createRequirePremium(async (req) => {
  const userId = req.headers["x-test-user"];
  if (typeof userId !== "string") return null;
  return memberships[userId === "user-free" ? "free" : "paid"];
}));
app.use(createWatchlistRouter({
  getUserId: (req) => typeof req.headers["x-test-user"] === "string" ? req.headers["x-test-user"] : null,
  store,
  getMetrics: async (ticker) => ({ ticker, companyName: ticker, currentPrice: 100, peRatioForward: null, epsGrowthYoy: null, debtToEquity: null, ma200: null, ma50: null, rsi: null, shortInterestPct: null, putCallRatio: null, beta: null, impliedVolatility: null, lastUpdated: new Date().toISOString() }),
  getHistory: async (ticker, period) => ({ ticker, period, dataPoints: [] }),
}));

let server;
let baseUrl;
before(async () => {
  server = await new Promise((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers ?? {}) } });
}

test("signed-out and Free users cannot reach watchlist routes", async () => {
  assert.equal((await request("/watchlist")).status, 401);
  assert.equal((await request("/watchlist", { headers: { "x-test-user": "user-free" } })).status, 403);
});

test("list and metrics are scoped to the authenticated user", async () => {
  const userA = await request("/watchlist", { headers: { "x-test-user": "user-a" } });
  const userB = await request("/watchlist", { headers: { "x-test-user": "user-b" } });
  assert.deepEqual((await userA.json()).map((entry) => entry.ticker), ["AAPL"]);
  assert.deepEqual((await userB.json()).map((entry) => entry.ticker), ["MSFT"]);
  const metricsA = await request("/watchlist/bulk-metrics", { headers: { "x-test-user": "user-a" } });
  assert.deepEqual((await metricsA.json()).map((entry) => entry.ticker), ["AAPL"]);
});

test("valid symbols save without external market-data validation", async () => {
  for (const ticker of ["BRK.B", "BF-B", "^GSPC"]) {
    const response = await request("/watchlist/add", {
      method: "POST",
      headers: { "x-test-user": "user-a" },
      body: JSON.stringify({ ticker, clerkUserId: "user-b" }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).ticker, ticker);
  }
  const malformed = await request("/watchlist/add", {
    method: "POST",
    headers: { "x-test-user": "user-a" },
    body: JSON.stringify({ ticker: "AAPL!" }),
  });
  assert.equal(malformed.status, 400);
});

test("deletion requires both entry id and owner id", async () => {
  const denied = await request("/watchlist/msft-b", { method: "DELETE", headers: { "x-test-user": "user-a" } });
  assert.equal(denied.status, 404);
  const stillThere = await request("/watchlist", { headers: { "x-test-user": "user-b" } });
  assert.ok((await stillThere.json()).some((entry) => entry.id === "msft-b"));
  const removed = await request("/watchlist/msft-b", { method: "DELETE", headers: { "x-test-user": "user-b" } });
  assert.equal(removed.status, 204);
});