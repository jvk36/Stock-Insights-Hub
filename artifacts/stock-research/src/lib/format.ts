export function formatNumber(num: number | null | undefined, currencySymbol = "$"): string {
  if (num == null) return "-";
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${currencySymbol}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${currencySymbol}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${currencySymbol}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${currencySymbol}${(abs / 1e3).toFixed(2)}K`;
  return `${sign}${currencySymbol}${abs.toFixed(2)}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", KRW: "₩",
  CAD: "CA$", AUD: "A$", CHF: "Fr ", HKD: "HK$", SGD: "S$",
  INR: "₹", BRL: "R$", MXN: "MX$", SEK: "kr ", NOK: "kr ", DKK: "kr ",
  NZD: "NZ$", ZAR: "R", TWD: "NT$", THB: "฿", IDR: "Rp",
};

export function getCurrencySymbol(code: string | null | undefined): string {
  if (!code) return "$";
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? `${code} `;
}

export function formatCurrency(num: number | null | undefined, digits = 2): string {
  if (num == null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(num);
}

export function formatPercent(num: number | null | undefined): string {
  if (num == null) return "-";
  return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}
