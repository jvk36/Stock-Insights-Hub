// Verified historical observations, not generated/estimated prices. Yahoo now
// retains only WBD's final session; the issuer's IR page preserves these closes.
export const WBD_PRICE_SOURCE = "https://ir.wbd.com/stock-information/stock-quote-and-chart/default.aspx";
export const WBD_SETTLEMENT_SOURCE = "https://ir.paramount.com/news-releases/news-release-details/paramount-completes-acquisition-warner-bros-discovery-creating";
export const NEBIUS_RENAME_SOURCE = "https://nebius.com/newsroom/nebius-group-n-v-announces-official-name-change-and-new-ticker-symbol";
export const WBD_VERIFIED_CLOSES: Record<string, number> = {
  "2026-08-17": 27.93, "2026-08-18": 28.48, "2026-08-19": 28.53,
  "2026-08-20": 28.23, "2026-08-21": 28.55, "2026-08-24": 28.70,
  "2026-08-25": 28.90, "2026-08-26": 28.75, "2026-08-27": 28.88,
  "2026-08-28": 28.77, "2026-08-31": 28.53, "2026-09-01": 28.32,
  "2026-09-02": 28.39, "2026-09-03": 28.37, "2026-09-04": 28.25,
  "2026-09-08": 28.12, "2026-09-09": 27.91, "2026-09-10": 28.20,
  "2026-09-11": 28.04, "2026-09-14": 28.10, "2026-09-15": 28.03,
  "2026-09-16": 28.07, "2026-09-17": 28.24, "2026-09-18": 27.80,
  "2026-09-21": 30.80, "2026-09-22": 30.83, "2026-09-23": 30.76,
  "2026-09-24": 30.84, "2026-09-25": 30.86, "2026-09-28": 30.90,
  "2026-09-29": 30.85, "2026-09-30": 30.95, "2026-10-01": 30.95,
  "2026-10-02": 30.94, "2026-10-05": 30.95,
};
export type CashSettlement = { ticker: string; date: string; price: number; source: string };
export const CLONING_SETTLEMENTS: CashSettlement[] = [
  // Official completion release: cash consideration includes the ticking fee.
  { ticker: "WBD", date: "2026-10-06", price: 31.01666668, source: WBD_SETTLEMENT_SOURCE },
];
