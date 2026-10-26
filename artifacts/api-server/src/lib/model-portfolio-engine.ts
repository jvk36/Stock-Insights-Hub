import type {
  BlindTrustCandidate, BlindTrustHolding, BlindTrustAllocation,
  BlindTrustLedgerEvent, BlindTrustPerformance,
} from "@workspace/api-zod";

export const UNIVERSE = [
  { ticker: "BRK.A", providerSymbol: "BRK-A", name: "Berkshire Hathaway" },
  { ticker: "MKL", providerSymbol: "MKL", name: "Markel Corp" },
  { ticker: "FRFHF", providerSymbol: "FRFHF", name: "Fairfax Financial Holdings" },
  { ticker: "JEF", providerSymbol: "JEF", name: "Jefferies Financial Group" },
  { ticker: "L", providerSymbol: "L", name: "Loews Group" },
  { ticker: "HHH", providerSymbol: "HHH", name: "Howard Hughes" },
  { ticker: "PSUS", providerSymbol: "PSUS", name: "Pershing Square US" },
  { ticker: "BOC", providerSymbol: "BOC", name: "Boston Omaha" },
] as const;

export type Position = Pick<BlindTrustHolding, "ticker" | "name" | "entryDate" | "entryPrice" | "shares" | "costBasis" | "allocationPb">;
export type Action = { ticker: string; date: string; type: "split" | "dividend"; value: number };
export type ModelState = {
  version: 1;
  launchDate: string;
  inceptionDate: string | null;
  nextRebalanceDate: string | null;
  lastRebalanceDate: string | null;
  processedDate: string | null;
  positions: Position[];
  cash: number;
  candidates: BlindTrustCandidate[];
  refreshedAt: string | null;
  message: string | null;
  valuationGaps?: string[];
  inceptionPriceBasis?: "open" | "close";
};
export const BLIND_TRUST_INCEPTION_DATE = "2026-10-26";
export type OpeningSession = { date: string; prices: Record<string, number>; candidates: BlindTrustCandidate[] };
export type ModelValuation = BlindTrustPerformance & { priceBasis?: "open" | "close" };
export type Prices = Record<string, Record<string, number>>;
export type EngineEvent = BlindTrustAllocation | BlindTrustLedgerEvent;
export const INITIAL_CAPITAL = 30_000;

export function initialModelState(date: string): ModelState {
  return {
    version: 1, launchDate: date, inceptionDate: null, nextRebalanceDate: null,
    lastRebalanceDate: null, processedDate: null, positions: [], cash: INITIAL_CAPITAL,
    candidates: [], refreshedAt: null, message: "Awaiting the first complete trading session and verified candidate data.",
  };
}

export function rankCandidates(candidates: BlindTrustCandidate[]): BlindTrustCandidate[] {
  const ordered = candidates.map((candidate) => ({ ...candidate, rank: null as number | null, selected: false }))
    .sort((a, b) => {
      const av = a.status === "eligible" && a.priceToBook != null && a.priceToBook > 0 ? a.priceToBook : Infinity;
      const bv = b.status === "eligible" && b.priceToBook != null && b.priceToBook > 0 ? b.priceToBook : Infinity;
      return av === bv ? a.ticker.localeCompare(b.ticker) : av - bv;
    });
  let rank = 0;
  for (const candidate of ordered) {
    if (candidate.status === "eligible" && candidate.priceToBook != null && candidate.priceToBook > 0) {
      candidate.rank = ++rank;
      candidate.selected = rank <= 3;
    }
  }
  return ordered;
}

export function anniversary(inception: string, after: string): string {
  let year = Number(after.slice(0, 4));
  // Feb 29 anniversaries fall on Feb 28 in non-leap years.
  const month = Number(inception.slice(5, 7));
  const day = Number(inception.slice(8, 10));
  const value = (y: number) => {
    const maxDay = new Date(Date.UTC(y, month, 0)).getUTCDate();
    return `${y}-${String(month).padStart(2, "0")}-${String(Math.min(day, maxDay)).padStart(2, "0")}`;
  };
  if (value(year) <= after) year++;
  return value(year);
}

export function allocationBlocker(candidates: BlindTrustCandidate[], date: string): string | null {
  if (candidates.length !== UNIVERSE.length) return "Waiting for the complete eight-business universe.";
  if (candidates.some((candidate) => candidate.status === "temporary_error")) return "Allocation pending: temporary market-data gaps; existing holdings are unchanged.";
  if (candidates.some((candidate) => candidate.status === "eligible" && candidate.priceDate !== date)) {
    return "Allocation pending: eligible candidates do not have matching completed-session prices.";
  }
  const selected = rankCandidates(candidates).filter((candidate) => candidate.selected);
  if (selected.length < 3) return "Allocation pending: fewer than three businesses have a verified positive P/B.";
  if (selected.some((candidate) => candidate.priceDate !== date)) return "Allocation pending: selected businesses do not have matching completed-session prices.";
  return null;
}

export function allocate(
  state: ModelState, candidates: BlindTrustCandidate[], date: string, prices: Record<string, number>,
): { state: ModelState; events: EngineEvent[] } {
  const blocker = allocationBlocker(candidates, date);
  if (blocker) throw new Error(blocker);
  const selected = rankCandidates(candidates).filter((candidate) => candidate.selected);
  const equity = state.cash + state.positions.reduce((sum, position) => {
    const price = prices[position.ticker];
    if (!Number.isFinite(price) || price <= 0) throw new Error("Cannot sell a holding without its closing price");
    return sum + position.shares * price;
  }, 0);
  if (!Number.isFinite(equity) || equity <= 0) throw new Error("Invalid allocation equity");
  const scheduledDate = state.nextRebalanceDate ?? date;
  const id = `blind-trust:allocation:${scheduledDate}`;
  const events: EngineEvent[] = [];
  for (const position of state.positions) {
    events.push({
      id: `${id}:sell:${position.ticker}`, date, type: "sell", ticker: position.ticker,
      shares: position.shares, price: prices[position.ticker], cashChange: position.shares * prices[position.ticker],
    });
  }
  const target = equity / 3;
  const positions = selected.map((candidate) => {
    const price = prices[candidate.ticker];
    if (!Number.isFinite(price) || price <= 0) throw new Error("Missing execution price");
    const shares = target / price; // fractional model shares, not whole BRK.A shares
    events.push({
      id: `${id}:buy:${candidate.ticker}`, date, type: "buy", ticker: candidate.ticker,
      shares, price, cashChange: -target,
    });
    return {
      ticker: candidate.ticker, name: candidate.name, entryDate: date, entryPrice: price,
      shares, costBasis: target, allocationPb: candidate.priceToBook!,
    };
  });
  events.push({
    id, date, scheduledDate, type: state.inceptionDate ? "rebalance" : "inception",
    equity, amountPerPosition: target, tickers: positions.map((position) => position.ticker),
    note: scheduledDate < date ? "Executed at the first complete observed session after the due date; no historical P/B was invented." : null,
  });
  return {
    state: {
      ...state, positions, cash: Math.abs(equity - target * 3) < 1e-8 ? 0 : equity - target * 3,
      inceptionDate: state.inceptionDate ?? date, lastRebalanceDate: date,
      nextRebalanceDate: anniversary(state.inceptionDate ?? date, date), message: null,
    }, events,
  };
}

export function applyActions(state: ModelState, actions: Action[], date: string) {
  const next = structuredClone(state);
  const events: BlindTrustLedgerEvent[] = [];
  // Holdings are prior-close shares. Splits take effect before the session.
  const daily = actions.filter((action) => action.date === date)
    .sort((a, b) => (a.type === "split" ? 0 : 1) - (b.type === "split" ? 0 : 1));
  for (const action of daily) {
    const position = next.positions.find((p) => p.ticker === action.ticker);
    if (!position) continue;
    if (!Number.isFinite(action.value) || action.value <= 0) throw new Error("Invalid corporate action");
    const cashChange = action.type === "dividend" ? position.shares * action.value : 0;
    if (action.type === "split") {
      position.shares *= action.value;
      position.entryPrice /= action.value;
    } else next.cash += cashChange;
    events.push({
      id: `blind-trust:${action.type}:${action.ticker}:${date}`, date, type: action.type,
      ticker: action.ticker, shares: position.shares, price: action.value, cashChange,
    });
  }
  return { state: next, events };
}

export function advanceModel(state: ModelState, input: {
  candidates: BlindTrustCandidate[]; prices: Prices; actions: Action[]; observedAt: string; targetDate: string;
  opening?: OpeningSession;
}): { state: ModelState; events: EngineEvent[]; snapshots: ModelValuation[] } {
  let next: ModelState = { ...structuredClone(state), candidates: rankCandidates(input.candidates), refreshedAt: input.observedAt };
  const events: EngineEvent[] = [];
  const snapshots: ModelValuation[] = [];
  const openingInception = !state.inceptionDate && state.inceptionPriceBasis === "open";
  if (!state.inceptionDate && input.targetDate < state.launchDate && !openingInception) {
    next.message = "Awaiting the first completed trading session on or after launch. No pre-launch backtest is shown.";
    return { state: next, events, snapshots };
  }
  if (!next.inceptionDate) {
    const opening = input.opening;
    if (openingInception && (!opening || opening.date !== state.launchDate)) {
      next.message = `Awaiting verified ${state.launchDate} opening prices for inception. No closing prices will be substituted.`;
      return { state: next, events, snapshots };
    }
    const executionDate = openingInception ? opening!.date : input.targetDate;
    const executionCandidates = openingInception ? opening!.candidates : input.candidates;
    const blocker = allocationBlocker(executionCandidates, executionDate);
    if (blocker) { next.message = blocker; return { state: next, events, snapshots }; }
    const executionPrices = openingInception ? opening!.prices :
      Object.fromEntries(Object.entries(input.prices).map(([ticker, series]) => [ticker, series[input.targetDate]]));
    const initial = allocate(next, executionCandidates, executionDate, executionPrices);
    next = initial.state;
    next.processedDate = openingInception
      ? new Date(Date.parse(`${executionDate}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
      : executionDate;
    events.push(...initial.events);
    snapshots.push({ date: executionDate, value: INITIAL_CAPITAL, cash: next.cash, returnPercent: 0, priceBasis: openingInception ? "open" : "close" });
    if (!openingInception) return { state: next, events, snapshots };
  }
  const dates = [...new Set(Object.values(input.prices).flatMap((series) => Object.keys(series)))]
    .filter((date) => date > next.processedDate! && date <= input.targetDate).sort();
  for (const date of dates) {
    if (next.positions.some((position) => !Number.isFinite(input.prices[position.ticker]?.[date]) || input.prices[position.ticker][date] <= 0)) {
      next.valuationGaps = [...new Set([...(next.valuationGaps ?? []), date])].sort();
      next.message = `Last verified valuation: ${next.processedDate}. A holding is missing its ${date} closing price. No value is estimated for that session; processing will resume at the next complete session.`;
      // Do not move the ledger cursor yet. A later complete close can recover
      // without this historical quote ever becoming available.
      continue;
    }
    // Include every intervening action, even when its session could not be
    // valued. Only advance the cursor once all held securities can be valued.
    const eligibleActions = input.actions.filter((action) =>
      !(next.inceptionPriceBasis === "open" && action.date === next.inceptionDate));
    const actionDates = [...new Set(eligibleActions
      .filter((action) => action.date > next.processedDate! && action.date <= date)
      .map((action) => action.date))].sort();
    for (const actionDate of actionDates) {
      const applied = applyActions(next, eligibleActions, actionDate);
      next = applied.state;
      events.push(...applied.events);
    }
    next.valuationGaps = (next.valuationGaps ?? []).filter((gap) => gap !== date);
    const prices = Object.fromEntries(Object.entries(input.prices).map(([ticker, series]) => [ticker, series[date]]));
    // Missing past fundamental observations must never be replaced with today's
    // book values. A missed rebalance executes at the current observed session.
    if (next.nextRebalanceDate && date >= next.nextRebalanceDate && date === input.targetDate) {
      const blocker = allocationBlocker(input.candidates, date);
      if (blocker) next.message = blocker;
      else {
        const allocation = allocate(next, input.candidates, date, prices);
        next = allocation.state;
        events.push(...allocation.events);
      }
    }
    const value = next.cash + next.positions.reduce((sum, p) => sum + p.shares * prices[p.ticker], 0);
    next.processedDate = date;
    snapshots.push({ date, value, cash: next.cash, returnPercent: (value / INITIAL_CAPITAL - 1) * 100, priceBasis: "close" });
  }
  // Retry a data-delayed allocation even if today's valuation already exists.
  if (next.nextRebalanceDate && next.nextRebalanceDate <= input.targetDate && next.processedDate === input.targetDate) {
    const blocker = allocationBlocker(input.candidates, input.targetDate);
    if (blocker) next.message = blocker;
    else {
      const prices = Object.fromEntries(Object.entries(input.prices).map(([ticker, series]) => [ticker, series[input.targetDate]]));
      const allocation = allocate(next, input.candidates, input.targetDate, prices);
      next = allocation.state;
      events.push(...allocation.events);
      const value = next.cash + next.positions.reduce((sum, p) => sum + p.shares * prices[p.ticker], 0);
      snapshots.push({ date: input.targetDate, value, cash: next.cash, returnPercent: (value / INITIAL_CAPITAL - 1) * 100 });
    }
  }
  if (!next.nextRebalanceDate || next.nextRebalanceDate > input.targetDate) {
    if (next.processedDate === input.targetDate) next.message = null;
  }
  return { state: next, events, snapshots };
}
