import assert from "node:assert/strict";
import { calculateDcf } from "./dcf-calculations.ts";

const base = {
  g1: 4,
  g2: 3,
  g3: 2,
  termG: 1,
  discount: 10,
  cashFlow: 5,
  shares: 1,
  netDebt: 0,
};

const affo = calculateDcf(base);
assert.ok(affo);
assert.equal(affo.intrinsicValue, affo.totalPV);

const fcf = calculateDcf({
  ...base,
  cashFlow: 5_000_000_000,
  shares: 1_000_000_000,
  netDebt: 2_000_000_000,
});
const noDebt = calculateDcf({
  ...base,
  cashFlow: 5_000_000_000,
  shares: 1_000_000_000,
  netDebt: 0,
});
assert.ok(fcf && noDebt);
assert.equal(noDebt.intrinsicValue - fcf.intrinsicValue, 2);
assert.equal(calculateDcf({ ...base, cashFlow: 0 }), null);
assert.equal(calculateDcf({ ...base, discount: 1 }), null);

console.log("FCF and AFFO DCF calculation checks passed");