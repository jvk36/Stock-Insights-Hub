import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { tickerOwnershipHref } from "./ticker-link";

/** Lookup any ticker without restricting entries to our current fund holdings. */
export function TickerOwnershipLookup({ initialTicker = "" }: { initialTicker?: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [error, setError] = useState("");
  const [, navigate] = useLocation();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9^][A-Z0-9.^=_-]{0,31}$/.test(symbol)) {
      setError("Enter a valid ticker, for example AAPL or BRK.B.");
      return;
    }
    setError("");
    navigate(tickerOwnershipHref(symbol));
  }

  return (
    <form onSubmit={submit} className="space-y-2" role="search" aria-label="Hedge fund ownership lookup">
      <label htmlFor="blueprint-ticker" className="text-sm font-medium">Find hedge funds holding a ticker</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          id="blueprint-ticker"
          value={ticker}
          onChange={(event) => { setTicker(event.target.value); setError(""); }}
          placeholder="Enter ticker, e.g. AAPL"
          maxLength={32}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="sm:max-w-xs"
          aria-invalid={!!error}
          aria-describedby={error ? "blueprint-ticker-error" : "blueprint-ticker-help"}
          data-testid="input-blueprint-ticker"
        />
        <Button type="submit" data-testid="button-blueprint-ticker">
          <Search className="h-4 w-4 mr-2" /> View Fund Activity
        </Button>
      </div>
      {error ? (
        <p id="blueprint-ticker-error" role="alert" className="text-xs text-destructive">{error}</p>
      ) : (
        <p id="blueprint-ticker-help" className="text-xs text-muted-foreground">
          See reported holders, new buys, increases, trims and exits for the latest quarter.
        </p>
      )}
    </form>
  );
}
