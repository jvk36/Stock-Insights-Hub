import assert from "node:assert/strict";
import test from "node:test";
import { createIndexAccess } from "./index-access.ts";

function check(path, method = "GET") {
  let premiumChecks = 0;
  let passed = 0;
  createIndexAccess(() => { premiumChecks++; })(
    { path, method }, {}, () => { passed++; },
  );
  return { premiumChecks, passed };
}

test("all six sector/country constituent lists are free", () => {
  for (const index of ["sp500", "nasdaq100", "sp400", "sp600", "djia", "adrs"]) {
    assert.deepEqual(check(`/indexes/${index}`), { premiumChecks: 0, passed: 1 });
  }
});

test("advanced screening metrics, unknown endpoints and writes remain Premium", () => {
  for (const index of ["sp500", "nasdaq100", "sp400", "sp600", "djia", "adrs"]) {
    assert.deepEqual(check(`/indexes/${index}/metrics`), { premiumChecks: 1, passed: 0 });
  }
  assert.deepEqual(check("/indexes/new-feature"), { premiumChecks: 1, passed: 0 });
  assert.deepEqual(check("/indexes/sp500", "POST"), { premiumChecks: 1, passed: 0 });
});
