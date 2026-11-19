import type { MouseEvent, ReactNode } from "react";
import { Link } from "wouter";

export function tickerOwnershipHref(ticker: string): string {
  return `/13f/ticker/${encodeURIComponent(ticker.trim().toUpperCase())}`;
}

/** Normal anchor to the Blueprint ownership page. Stops propagation so parent row handlers never fire. */
export function TickerOwnershipLink({
  ticker,
  className,
  children,
  testId,
}: {
  ticker: string;
  className?: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <Link
      href={tickerOwnershipHref(ticker)}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      className={className}
      aria-label={`See hedge fund ownership of ${ticker}`}
      data-testid={testId ?? `link-ticker-ownership-${ticker}`}
    >
      {children ?? ticker}
    </Link>
  );
}
