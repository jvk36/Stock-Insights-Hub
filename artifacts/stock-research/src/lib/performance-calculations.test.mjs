import assert from "node:assert/strict";
import {
  annualizedReturn, subtractYears, resolvePeriod, trailingPeriod, growthOfInvestment,
  returnsHeatmap, rollingReturns, monthEnds, cagrPath, formatPct, isValidIsoDate, DAYS_PER_YEAR,
} from "./performance-calculations.ts";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Known CAGR: doubling over exactly 365.2425*N days
close(annualizedReturn("2000-01-01", 100, "2010-01-01", 200), Math.pow(2, DAYS_PER_YEAR / 3653) - 1);
close(annualizedReturn("2020-01-01", 100, "2021-01-01", 110), Math.pow(1.1, DAYS_PER_YEAR / 366) - 1);
assert.equal(annualizedReturn("2020-01-01", 100, "2020-01-01", 120), null); // zero duration
assert.equal(annualizedReturn("2020-01-02", 100, "2020-01-01", 120), null); // reversed
assert.ok(annualizedReturn("2020-01-01", 100, "2022-01-01", 50) < 0);

// Leap day handling
assert.equal(subtractYears("2024-02-29", 1), "2023-02-28");
assert.equal(subtractYears("2024-02-29", 4), "2020-02-29");
assert.equal(subtractYears("2023-03-01", 1), "2022-03-01");
assert.equal(isValidIsoDate("2023-02-29"), false);
assert.equal(isValidIsoDate("2024-02-29"), true);

// Synthetic test series: weekday sessions
function series(start, end, f) {
  const out = []; let t = Date.parse(start + "T00:00:00Z"); const e = Date.parse(end + "T00:00:00Z");
  let i = 0;
  while (t <= e) { const d = new Date(t); const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push({ date: d.toISOString().slice(0, 10), adjustedClose: f(i++, d) }); t += 86400000; }
  return out;
}
const px = series("2015-01-05", "2024-06-28", (i) => 100 * Math.pow(1.0003, i));

// Date boundaries: start on weekend -> first session on/after; end weekend -> last on/before
const r = resolvePeriod(px, "2016-01-02", "2017-01-01");
assert.ok(r.ok); assert.equal(r.start.date, "2016-01-04"); assert.equal(r.end.date, "2016-12-30");
assert.equal(resolvePeriod(px, "2017-01-01", "2016-01-01").ok, false);
assert.equal(resolvePeriod(px, "bad", "2016-01-01").ok, false);
assert.equal(resolvePeriod(px, "2016-01-04", "2016-01-04").ok, false);

// Incomplete history: start predating coverage by >7 days is unavailable, not relabeled
assert.equal(resolvePeriod(px, "2014-12-01", "2016-01-01").ok, false);
assert.equal(resolvePeriod(px, "2015-01-01", "2016-01-01").ok, true); // within tolerance
assert.equal(trailingPeriod(px, "2024-06-28", 10).ok, false);
const t5 = trailingPeriod(px, "2024-06-28", 5);
assert.ok(t5.ok); assert.equal(t5.start.date, "2019-06-28");

// Growth: common dates only, both normalized to 10000 on same date
const spy = px.filter((_, i) => i % 7 !== 3).map((p) => ({ ...p, adjustedClose: p.adjustedClose * 2 }));
const g = growthOfInvestment(px, spy, 3);
assert.ok(g.ok); close(g.points[0].stock, 10000); close(g.points[0].benchmark, 10000);
assert.equal(growthOfInvestment(px, spy, 15).ok, false);
const gs = growthOfInvestment(px, null, 1); assert.ok(gs.ok); assert.equal(gs.points[0].benchmark, null);

// Heatmap: missing months are null (not 0), listing month has no base, partial flags
const gap = px.filter((p) => !p.date.startsWith("2020-04"));
const rows = returnsHeatmap(gap, "2024-06-28", 10);
const r2020 = rows.find((x) => x.year === 2020);
assert.equal(r2020.months[3].value, null);
assert.equal(r2020.months[4].value, null); // May has no April base
const r2015 = rows.find((x) => x.year === 2015);
assert.equal(r2015.months[0].value, null); assert.equal(r2015.annual.value, null);
const r2024 = rows.find((x) => x.year === 2024);
assert.equal(r2024.annual.partial, true); assert.equal(r2024.months[5].partial, true);
assert.equal(r2024.months[6].value, null);
const mm = monthEnds(px); const feb = mm.find((p) => p.date.startsWith("2016-02")); const jan = mm.find((p) => p.date.startsWith("2016-01"));
close(rows.find((x) => x.year === 2016).months[1].value, feb.adjustedClose / jan.adjustedClose - 1);

// Rolling: first N years unavailable, negative values preserved
const down = series("2010-01-04", "2016-12-30", (i) => 100 * Math.pow(0.9996, i));
const roll = rollingReturns(down, 3);
assert.equal(roll[0].value, null);
assert.equal(roll.find((p) => p.date.startsWith("2012-11")).value, null);
const late = roll.find((p) => p.date.startsWith("2016-06"));
assert.ok(late.value < 0);
assert.equal(rollingReturns(down, 10).every((p) => p.value === null), true);

// CAGR path ends at resolved end and suppresses annualization before 1 year
const path = cagrPath(px, r);
assert.equal(path.at(-1).date, "2016-12-30"); assert.equal(path[0].cagr, null); assert.ok(Number.isFinite(path[1].cagr));
const short = resolvePeriod(px, "2016-03-01", "2016-05-15"); assert.ok(short.ok); assert.ok(Number.isFinite(short.cagr));
assert.equal(annualizedReturn("2020-01-01", 1, "2020-01-02", 1e12), null); // overflow guarded, never Infinity

// Internal gap/halt: no silent start/end shift beyond 7 days
const halted = px.filter((p) => !(p.date >= "2018-03-01" && p.date <= "2018-04-30"));
assert.equal(resolvePeriod(halted, "2018-03-05", "2019-01-01").ok, false);
assert.equal(resolvePeriod(halted, "2017-01-01", "2018-04-15").ok, false);
assert.equal(resolvePeriod(halted, "2017-01-01", "2018-05-02").ok, true);
const rh = rollingReturns(halted, 1);
assert.equal(rh.find((p) => p.date.startsWith("2019-03")).value, null);
assert.ok(rh.find((p) => p.date.startsWith("2019-06")).value !== null);
const gh = growthOfInvestment(halted.filter((p) => p.date <= "2021-03-31"), null, 3); assert.equal(gh.ok, false);

// Heatmap: annual base must be prior December; month close >7d short of month end unavailable
const noDec = px.filter((p) => !p.date.startsWith("2018-12"));
const hr = returnsHeatmap(noDec, "2024-06-28", 10);
assert.equal(hr.find((x) => x.year === 2019).annual.value, null);
assert.equal(hr.find((x) => x.year === 2018).annual.value, null); // no Dec close
const earlyEnd = px.filter((p) => !(p.date >= "2017-08-15" && p.date <= "2017-08-31"));
const er = returnsHeatmap(earlyEnd, "2024-06-28", 10).find((x) => x.year === 2017);
assert.equal(er.months[7].value, null); assert.equal(er.months[8].value, null);
const decs = mm.filter((p) => p.date.slice(5, 7) === "12");
close(rows.find((x) => x.year === 2017).annual.value, decs.find((p) => p.date.startsWith("2017")).adjustedClose / decs.find((p) => p.date.startsWith("2016")).adjustedClose - 1);

assert.equal(formatPct(null), "\u2014"); assert.equal(formatPct(-0.123), "\u221212.3%");
console.log("performance-calculations: all tests passed");
