import assert from "node:assert/strict";
import {
  classifyReit,
  defaultValuationBasis,
  extractReportedAffo,
} from "./reit-affo.ts";

assert.equal(classifyReit("Technology", "Software—Infrastructure").kind, "non_reit");
const equityReit = classifyReit("Real Estate", "REIT—Industrial");
const mortgageReit = classifyReit("Real Estate", "REIT—Mortgage");
assert.equal(equityReit.kind, "equity_reit");
assert.equal(mortgageReit.kind, "mortgage_reit");
assert.equal(defaultValuationBasis(equityReit), "affo");
assert.equal(defaultValuationBasis(mortgageReit), "affo");
assert.equal(
  classifyReit("Real Estate", "Real Estate—Development").kind,
  "unknown",
);
assert.equal(
  classifyReit("Financial Services", "Mortgage Finance").kind,
  "non_reit",
);
assert.equal(
  defaultValuationBasis(classifyReit("Real Estate", "Real Estate Services")),
  "fcf",
);
assert.equal(classifyReit(null, null).kind, "unknown");

const fact = {
  start: "2025-01-01",
  end: "2025-12-31",
  val: 4.25,
  filed: "2026-02-15",
  form: "10-K",
  fp: "FY",
};
const reported = extractReportedAffo({
  facts: {
    issuer: {
      AdjustedFundsFromOperationsPerShare: {
        units: { "USD/shares": [fact] },
      },
    },
  },
});
assert.equal(reported.status, "reported");
assert.equal(reported.perShare, 4.25);
assert.equal(reported.period, "2025-12-31");

const ffoOnly = extractReportedAffo({
  facts: {
    issuer: {
      FundsFromOperationsPerShare: { units: { "USD/shares": [fact] } },
    },
  },
});
assert.equal(ffoOnly.status, "unavailable");

const conflicting = extractReportedAffo({
  facts: {
    issuer: {
      AdjustedFundsFromOperationsPerShare: {
        units: { "USD/shares": [fact, { ...fact, val: 4.5 }] },
      },
    },
  },
});
assert.equal(conflicting.status, "unavailable");

const totalOnly = extractReportedAffo({
  facts: {
    issuer: {
      AdjustedFundsFromOperations: {
        units: { USD: [{ ...fact, val: 1_000_000_000 }] },
      },
    },
  },
});
assert.equal(totalOnly.status, "reported");
assert.equal(totalOnly.total, 1_000_000_000);
assert.equal(totalOnly.perShare, null);

console.log("REIT classification and AFFO extraction checks passed");