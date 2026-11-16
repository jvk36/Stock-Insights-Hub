import test from "node:test";
import assert from "node:assert/strict";
import { safeAuthReturn, rememberAuthReturn, getAuthReturn } from "./auth-return.ts";

test("preserves the originating tab, query and hash", () => {
  assert.equal(safeAuthReturn("/13f?view=stats#holdings"), "/13f?view=stats#holdings");
  assert.equal(safeAuthReturn("/stock/WIT"), "/stock/WIT");
  assert.equal(safeAuthReturn("/model-portfolios/momentum"), "/model-portfolios/momentum");
});

test("rejects external destinations and auth loops", () => {
  for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "/sign-in", "/sign-up/sso-callback", "/bad\npath", null]) {
    assert.equal(safeAuthReturn(path), null);
  }
});

test("respects artifact base paths and normalized paths", () => {
  assert.equal(safeAuthReturn("/research/indexes?sector=Tech", "/research"), "/research/indexes?sector=Tech");
  assert.equal(safeAuthReturn("/indexes", "/research"), null);
  assert.equal(safeAuthReturn("/research/../sign-in", "/research"), null);
  assert.equal(safeAuthReturn("/research/sign-up", "/research"), null);
});

test("return URL wins over the saved tab, and auth callbacks cannot overwrite it", () => {
  const entries = new Map();
  globalThis.sessionStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
  rememberAuthReturn("/watchlist", "");
  rememberAuthReturn("/sign-in/sso-callback", "");
  assert.equal(getAuthReturn("", ""), "/watchlist");
  assert.equal(getAuthReturn("?redirect_url=%2F13f%3Fview%3Dstats", ""), "/13f?view=stats");
  assert.equal(getAuthReturn("?redirect_url=https%3A%2F%2Fevil.example", ""), "/watchlist");
  delete globalThis.sessionStorage;
});

test("uses the public landing tab when storage is unavailable", () => {
  assert.equal(getAuthReturn("", ""), "/13f");
  assert.equal(getAuthReturn("", "/research"), "/research/13f");
});
