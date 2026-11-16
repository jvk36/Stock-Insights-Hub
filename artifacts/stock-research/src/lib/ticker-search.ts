export interface TickerSuggestion {
  symbol: string;
  name: string;
  sector: string;
}

export function normalizeTicker(input: string): string {
  return input.trim().toUpperCase();
}

export function tickerPath(input: string): string | null {
  const t = normalizeTicker(input);
  return t ? `/stock/${encodeURIComponent(t)}` : null;
}

export function dedupeSuggestions(lists: Array<TickerSuggestion[] | undefined>): TickerSuggestion[] {
  const seen = new Map<string, TickerSuggestion>();
  for (const list of lists) {
    for (const s of list ?? []) {
      const key = normalizeTicker(s.symbol ?? "");
      if (key && !seen.has(key)) seen.set(key, { symbol: key, name: s.name ?? "", sector: s.sector ?? "" });
    }
  }
  return [...seen.values()];
}

/** Ranks: exact ticker, ticker prefix, name prefix/word prefix, name contains. */
export function rankSuggestions(all: TickerSuggestion[], query: string, limit = 8): TickerSuggestion[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const scored: Array<[number, TickerSuggestion]> = [];
  for (const s of all) {
    const name = s.name.toUpperCase();
    let score = -1;
    if (s.symbol === q) score = 0;
    else if (s.symbol.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.split(/[\s.,&()-]+/).some((w) => w.startsWith(q))) score = 3;
    else if (q.length >= 3 && name.includes(q)) score = 4;
    if (score >= 0) scored.push([score, s]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].symbol.length - b[1].symbol.length || a[1].symbol.localeCompare(b[1].symbol));
  return scored.slice(0, limit).map(([, s]) => s);
}
