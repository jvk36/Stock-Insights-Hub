import { useState } from "react";
import { useLocation } from "wouter";
import TickerSearch from "@/components/stock/TickerSearch";
import { tickerOwnershipHref } from "./ticker-link";

/** Lookup any ticker without restricting entries to our current fund holdings. */
export function TickerOwnershipLookup({ initialTicker = "" }: { initialTicker?: string }) {
  const [error, setError] = useState("");
  const [, navigate] = useLocation();

  function submit(symbol: string) {
    if (!/^[A-Z0-9^][A-Z0-9.^=_-]{0,31}$/.test(symbol)) {
      setError("Enter a valid ticker, for example AAPL or BRK.B.");
      return;
    }
    setError("");
    navigate(tickerOwnershipHref(symbol));
  }

  return (
    <section className="space-y-2" aria-label="Hedge fund ownership lookup">
      <p className="text-sm font-medium">Find hedge funds holding a ticker</p>
      <div className="max-w-2xl">
        <TickerSearch
          size="sm"
          initialValue={initialTicker}
          onSelect={submit}
          onValueChange={() => setError("")}
          buttonLabel="View Fund Activity"
          inputTestId="input-blueprint-ticker"
          buttonTestId="button-blueprint-ticker"
        />
      </div>
      {error ? (
        <p id="blueprint-ticker-error" role="alert" className="text-xs text-destructive">{error}</p>
      ) : (
        <p id="blueprint-ticker-help" className="text-xs text-muted-foreground">
          See reported holders, new buys, increases, trims and exits for the latest quarter.
        </p>
      )}
    </section>
  );
}
