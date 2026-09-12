import assert from "node:assert/strict";
import {
  classifyReit,
  defaultValuationBasis,
  extractAnnualAffoFromExhibitText,
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

for (const [concept, expectedMeasure] of [
  ["CoreFundsFromOperationsPerDilutedShare", "Core FFO"],
  ["CashFFOPerShare", "Cash FFO"],
  ["FundsAvailableForDistributionPerCommonShare", "FAD"],
]) {
  const alias = extractReportedAffo({
    facts: {
      issuer: {
        [concept]: {
          units: { "USD/shares": [fact] },
        },
      },
    },
  });
  assert.equal(alias.status, "reported");
  assert.equal(alias.perShare, 4.25);
  assert.match(alias.note, new RegExp(expectedMeasure));
}

const labelAlias = extractReportedAffo({
  facts: {
    issuer: {
      CompanySpecificMetric: {
        label: "Core FFO per diluted share",
        units: { "USD/shares": [fact] },
      },
    },
  },
});
assert.equal(labelAlias.status, "reported");
assert.match(labelAlias.note, /Core FFO/);

const annualEightK = extractReportedAffo({
  facts: {
    issuer: {
      CashFundsFromOperationsPerShare: {
        units: {
          "USD/shares": [{ ...fact, form: "8-K", fp: "CY" }],
        },
      },
    },
  },
});
assert.equal(annualEightK.status, "reported");
assert.match(annualEightK.source, /SEC 8-K/);

const ffoOnly = extractReportedAffo({
  facts: {
    issuer: {
      FundsFromOperationsPerShare: { units: { "USD/shares": [fact] } },
    },
  },
});
assert.equal(ffoOnly.status, "unavailable");

const rankedAliases = extractReportedAffo({
  facts: {
    issuer: {
      AdjustedFundsFromOperationsPerShare: {
        units: { "USD/shares": [fact] },
      },
      CoreFFOPerShare: {
        units: { "USD/shares": [{ ...fact, val: 4.5 }] },
      },
    },
  },
});
assert.equal(rankedAliases.status, "reported");
assert.equal(rankedAliases.perShare, 4.25);
assert.match(rankedAliases.note, /AFFO per share/);

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

const annualExhibit = extractAnnualAffoFromExhibitText(
  `<SEC-DOCUMENT>
    <DOCUMENT><TYPE>EX-99.1<TEXT><html><body>
      <div>Years ended December 31, 2025 December 31, 2024</div>
      <div>AFFO per common share (Diluted) 4.28 4.19</div>
    </body></html></TEXT></DOCUMENT>
  </SEC-DOCUMENT>`,
  "2025-12-31",
  "2026-02-24",
  "0000726728-26-000009",
);
assert.equal(annualExhibit.status, "reported");
assert.equal(annualExhibit.perShare, 4.28);
assert.match(annualExhibit.source, /SEC 8-K annual earnings exhibit/);

const quarterlyExhibit = extractAnnualAffoFromExhibitText(
  `<DOCUMENT><TYPE>EX-99.1<TEXT><html><body>
    <div>Three months ended December 31, 2025</div>
    <div>AFFO per common share (Diluted) 1.08 1.05</div>
  </body></html></TEXT></DOCUMENT>`,
  "2025-12-31",
  "2026-02-24",
  "test",
);
assert.equal(quarterlyExhibit.status, "unavailable");

const guidanceBeforeActuals = extractAnnualAffoFromExhibitText(
  `<DOCUMENT><TYPE>EX-99.1<TEXT><html><body>
    <div>Years ended December 31, 2025 December 31, 2024</div>
    <div>Earnings Guidance 2026 Guidance 2025 Actuals</div>
    <div>AFFO per share $4.38 - $4.42 $4.28</div>
    <div>Years ended December 31, 2025 December 31, 2024</div>
    <div>AFFO per common share (Diluted) 4.28 4.19</div>
  </body></html></TEXT></DOCUMENT>`,
  "2025-12-31",
  "2026-02-24",
  "test",
);
assert.equal(guidanceBeforeActuals.status, "reported");
assert.equal(guidanceBeforeActuals.perShare, 4.28);

console.log("REIT classification and AFFO extraction checks passed");