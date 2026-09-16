export const bgColors = {
  green: "bg-[hsl(142,76%,36%)] text-white",
  yellow: "bg-[hsl(45,93%,47%)] text-black",
  red: "bg-[hsl(0,84%,60%)] text-white",
  neutral: "bg-transparent text-foreground",
};

export function getPeColor(pe: number | null | undefined) {
  if (pe == null) return bgColors.neutral;
  if (pe <= 0) return bgColors.red;
  if (pe < 20) return bgColors.green;
  if (pe <= 40) return bgColors.yellow;
  return bgColors.red;
}

export function getEpsGrowthColor(eps: number | null | undefined) {
  if (eps == null) return bgColors.neutral;
  if (eps > 15) return bgColors.green;
  if (eps >= 5) return bgColors.yellow;
  return bgColors.red;
}

export function getDebtEquityColor(de: number | null | undefined) {
  if (de == null) return bgColors.neutral;
  if (de < 0.5) return bgColors.green;
  if (de <= 1.5) return bgColors.yellow;
  return bgColors.red;
}

export function getMaColor(price: number | null | undefined, ma: number | null | undefined) {
  if (price == null || ma == null) return bgColors.neutral;
  if (price > ma) return bgColors.green;
  return bgColors.yellow;
}

export function getRsiColor(rsi: number | null | undefined) {
  if (rsi == null) return bgColors.neutral;
  if (rsi < 30) return bgColors.green;
  if (rsi <= 70) return bgColors.yellow;
  return bgColors.red;
}

export function getShortInterestColor(si: number | null | undefined) {
  if (si == null) return bgColors.neutral;
  if (si < 3) return bgColors.green;
  if (si <= 5) return bgColors.yellow;
  return bgColors.red;
}

export function getPutCallColor(pcr: number | null | undefined) {
  if (pcr == null) return bgColors.neutral;
  if (pcr < 0.7) return bgColors.green;
  if (pcr <= 1.0) return bgColors.yellow;
  return bgColors.red;
}

export function formatNum(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "N/A";
  return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatPct(val: number | null | undefined): string {
  if (val == null) return "N/A";
  return val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

export function formatCurrency(val: number | null | undefined): string {
  if (val == null) return "N/A";
  return "$" + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
