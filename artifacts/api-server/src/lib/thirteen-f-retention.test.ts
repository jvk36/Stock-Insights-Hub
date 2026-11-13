import assert from "node:assert/strict";
import test from "node:test";
import { retainTopPositions, reportedValueMultiplier, tenYearReportCutoff, TOP_100_FUND_CIKS, MISCELLANEOUS_CUSIP } from "./thirteen-f-retention";

const holdings = (n: number) => Array.from({ length: n }, (_, i) => ({
  name: `Stock ${String(i).padStart(4, "0")}`, cusip: String(i), marketValueThousands: i + 1, shares: i + 10,
}));

test("SEC value units normalize to thousands, matching the existing dollar formatter", () => {
  const oldReported = 21_201_005;
  const newReported = 21_201_005_000;
  assert.equal(oldReported * reportedValueMultiplier("2022-11-14"), newReported * reportedValueMultiplier("2026-11-06"));
  assert.equal(newReported * reportedValueMultiplier("2026-11-06") * 1000, 21_201_005_000);
});

test("all 44 added managers, but not the original managers, have the retention policy", () => {
  assert.equal(TOP_100_FUND_CIKS.size, 44);
  assert.equal(TOP_100_FUND_CIKS.has("850529"), true);
  for (const cik of [
    "1517137", "1039565", "1418814", "1138995", "860643", "883965",
    "859804", "1096343", "1641864", "1050442", "948669", "1389403",
    "937394", "1063296", "807985", "1791786", "1135778", "1631014",
    "1697868", "1759760", "1317588", "934639", "1798849", "1631664",
    "1559771", "1314620", "1142062", "1070134", "1766504", "1773994",
    "1454502", "1657335",
  ]) assert.equal(TOP_100_FUND_CIKS.has(cik), true, cik);
  assert.equal(TOP_100_FUND_CIKS.has("1067983"), false);
});

test("retain exactly top 100 and sum the remainder without mutating the input", () => {
  const input = holdings(160);
  const result = retainTopPositions(input);
  assert.equal(result.positions.length, 100);
  assert.equal(result.positions[0]?.marketValueThousands, 160);
  assert.equal(result.positions[99]?.marketValueThousands, 61);
  assert.equal(result.miscellaneous?.name, "Miscellaneous");
  assert.equal(result.miscellaneous?.cusip, MISCELLANEOUS_CUSIP);
  assert.equal(result.miscellaneous?.marketValueThousands, 60 * 61 / 2);
  assert.equal(result.miscellaneous?.shares, 0);
  assert.equal(result.positions.reduce((s, r) => s + r.marketValueThousands, 0)
    + result.miscellaneous!.marketValueThousands, input.reduce((s, r) => s + r.marketValueThousands, 0));
  assert.equal(input[0]?.marketValueThousands, 1);
});

test("no summary at or below 100 positions, including an empty filing", () => {
  for (const n of [0, 1, 99, 100]) {
    const result = retainTopPositions(holdings(n));
    assert.equal(result.positions.length, n);
    assert.equal(result.miscellaneous, null);
  }
});

test("exactly 101 positions, ties, zero-value remainders and large dollar values", () => {
  const input = holdings(101).map(r => ({ ...r, marketValueThousands: 5_000_000_000 }));
  const result = retainTopPositions([...input].reverse());
  assert.equal(result.positions[0]?.name, "Stock 0000");
  assert.equal(result.miscellaneous?.marketValueThousands, 5_000_000_000);
  assert.equal(retainTopPositions(input.map(r => ({ ...r, marketValueThousands: 0 }))).miscellaneous?.marketValueThousands, 0);
});

test("rolling lookback uses calendar dates rather than a hard-coded inception", () => {
  assert.equal(tenYearReportCutoff(new Date("2026-11-13T12:00:00Z")), "2016-11-13");
  assert.equal(tenYearReportCutoff(new Date("2027-01-01T00:00:00Z")), "2017-01-01");
});
