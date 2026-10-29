import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { createWatchlistRouter } from "./watchlist-router.ts";

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

test("signed-out users cannot read or modify any watchlist data", async () => {
  for (const [path, options] of [
    ["/watchlist", {}],
    ["/watchlist/bulk-metrics", {}],
    ["/stocks/AAPL/history", {}],
    ["/watchlist/add", { method: "POST", body: JSON.stringify({ ticker: "AAPL" }) }],
    ["/watchlist/aapl-a", { method: "DELETE" }],
  ]) {
    assert.equal((await request(path, options)).status, 401, path);
  }
});

test("Free users can add, list, view metrics and history, and remove their own stocks", async () => {
  const headers = { "x-test-user": "user-free" };
  const added = await request("/watchlist/add", { method: "POST", headers, body: JSON.stringify({ ticker: "VTI" }) });
  assert.equal(added.status, 201);
  const entry = await added.json();
  const listed = await request("/watchlist", { headers });
  assert.deepEqual((await listed.json()).map((item) => item.ticker), ["VTI"]);
  const metrics = await request("/watchlist/bulk-metrics", { headers });
  assert.equal(metrics.status, 200);
  assert.deepEqual((await metrics.json()).map((item) => item.ticker), ["VTI"]);
  assert.equal((await request("/stocks/VTI/history", { headers })).status, 200);
  assert.equal((await request("/watchlist/aapl-a", { method: "DELETE", headers })).status, 404);
  assert.equal((await request(`/watchlist/${entry.id}`, { method: "DELETE", headers })).status, 204);
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