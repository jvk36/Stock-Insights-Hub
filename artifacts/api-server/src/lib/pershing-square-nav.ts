import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import { load } from "cheerio";

const execFileAsync = promisify(execFile);
const CURL_BIN = (() => {
  try { return execSync("which curl", { encoding: "utf8", timeout: 5_000 }).trim(); }
  catch { return "curl"; }
})();
export const PSUS_NAV_SOURCE = "https://www.pershingsquareusa.com/";
export type OfficialNav = { value: number; date: string; source: string };

export function parsePershingSquareNav(html: string, asOf: string): OfficialNav {
  const $ = load(html);
  const block = $(".current-nav-update--block").filter((_i, node) =>
    $(node).find("li").toArray().some((li) => $(li).find("strong").text().trim() === "PSUS")).first();
  const row = block.find("li").filter((_i, li) => /NAV\s*\/\s*Share/i.test($(li).text())).first();
  const rawValue = row.find("strong").text().trim();
  const dateMatch = block.find("small").text().match(/as\s+of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!/^\$\s*[\d,]+(?:\.\d+)?$/.test(rawValue) || !dateMatch) throw new Error("Official PSUS USD NAV/share or reporting date could not be verified");
  const value = Number(rawValue.replace(/[$,\s]/g, ""));
  const [, month, day, year] = dateMatch;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  const age = Date.parse(`${asOf}T00:00:00Z`) - timestamp;
  if (!(value > 0) || !Number.isFinite(value) || !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== date || age < 0 || age > 21 * 86_400_000) {
    throw new Error("Official PSUS NAV/share is invalid, future-dated or stale");
  }
  return { value, date, source: PSUS_NAV_SOURCE };
}

export async function fetchPershingSquareNav(asOf: string): Promise<OfficialNav> {
  const { stdout } = await execFileAsync(CURL_BIN, [
    "--fail", "--silent", "--show-error", "--location", "--max-time", "20", PSUS_NAV_SOURCE,
  ], { timeout: 25_000, maxBuffer: 2 * 1024 * 1024 });
  return parsePershingSquareNav(stdout, asOf);
}
