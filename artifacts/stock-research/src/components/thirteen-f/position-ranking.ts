import type { ThirteenFSummaryPosition } from "@workspace/api-client-react";

export type PositionRankingMode = "bets" | "buys" | "sells";

export function rankPositions(positions: ThirteenFSummaryPosition[], mode: PositionRankingMode) {
  const value = (p: ThirteenFSummaryPosition) =>
    mode === "bets" ? p.portfolioPct : (mode === "buys" ? p.buyPct : p.sellPct) ?? 0;
  const key = (p: ThirteenFSummaryPosition) => p.ticker ?? `~${p.securityKey}`;
  return positions.filter((p) =>
    mode === "bets" ? p.activity !== "sell" && p.marketValue > 0
      : mode === "buys" ? (p.buyPct ?? 0) > 0 : (p.sellPct ?? 0) > 0,
  ).sort((a, b) => value(b) - value(a) || key(a).localeCompare(key(b)) || a.fundName.localeCompare(b.fundName));
}
