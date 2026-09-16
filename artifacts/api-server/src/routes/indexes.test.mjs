import assert from "node:assert/strict";
import { test } from "node:test";
import { DJIA_SEED, isValidDjiaRoster } from "./indexes.ts";

test("rejects annual performance rows as a DJIA roster", () => {
  const annualRows = Array.from({ length: 30 }, (_, i) => ({
    symbol: i === 0 ? "-0.49" : "40.45",
    name: String(1896 + i),
    sector: "-1.20",
  }));
  assert.equal(isValidDjiaRoster(annualRows), false);
});

test("accepts a 30-company ticker roster with meaningful sectors", () => {
  const roster = Array.from({ length: 30 }, (_, i) => ({
    symbol: `T${String(i).padStart(2, "0")}`,
    name: `Company ${i}`,
    sector: i % 2 ? "Financials" : "Industrials",
  }));
  assert.equal(isValidDjiaRoster(roster), true);
});

test("canonical Dow seed is a valid 30-company roster", () => {
  assert.equal(DJIA_SEED.length, 30);
  assert.equal(isValidDjiaRoster(DJIA_SEED), true);
  assert.ok(DJIA_SEED.every((stock) => stock.sector.length > 0));
});