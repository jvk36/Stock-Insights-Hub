import { useId, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  useGetIndexSp500, getGetIndexSp500QueryKey,
  useGetIndexNasdaq100, getGetIndexNasdaq100QueryKey,
  useGetIndexSp400, getGetIndexSp400QueryKey,
  useGetIndexSp600, getGetIndexSp600QueryKey,
  useGetIndexDjia, getGetIndexDjiaQueryKey,
  useGetIndexAdrs, getGetIndexAdrsQueryKey,
} from "@workspace/api-client-react";
import { dedupeSuggestions, rankSuggestions, tickerPath } from "@/lib/ticker-search";

const STALE_TIME = 5 * 60 * 1000;

function useConstituentSuggestions() {
  const qs = [
    useGetIndexSp500({ query: { queryKey: getGetIndexSp500QueryKey(), staleTime: STALE_TIME } }),
    useGetIndexNasdaq100({ query: { queryKey: getGetIndexNasdaq100QueryKey(), staleTime: STALE_TIME } }),
    useGetIndexSp400({ query: { queryKey: getGetIndexSp400QueryKey(), staleTime: STALE_TIME } }),
    useGetIndexSp600({ query: { queryKey: getGetIndexSp600QueryKey(), staleTime: STALE_TIME } }),
    useGetIndexDjia({ query: { queryKey: getGetIndexDjiaQueryKey(), staleTime: STALE_TIME } }),
    useGetIndexAdrs({ query: { queryKey: getGetIndexAdrsQueryKey(), staleTime: STALE_TIME } }),
  ];
  const datas = qs.map((q) => q.data);
  const all = useMemo(() => dedupeSuggestions(datas.map((d) => d?.stocks)), datas); // eslint-disable-line react-hooks/exhaustive-deps
  const failed = qs.filter((q) => q.isError).length;
  const loading = qs.some((q) => q.isLoading);
  return { all, failed, loading, total: qs.length };
}

export default function TickerSearch({ size = "lg", autoFocus = false, onNavigate }: { size?: "lg" | "sm"; autoFocus?: boolean; onNavigate?: (symbol: string) => void }) {
  const [, setLocation] = useLocation();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const { all, failed, loading, total } = useConstituentSuggestions();
  const results = useMemo(() => rankSuggestions(all, value), [all, value]);
  const showList = open && value.trim().length > 0 && results.length > 0;

  const go = (raw: string) => {
    const path = tickerPath(raw);
    if (!path) return;
    setLocation(path);
    onNavigate?.(raw.trim().toUpperCase());
    setValue("");
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (results.length) setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      if (showList) { e.preventDefault(); setOpen(false); setActive(-1); }
    } else if (e.key === "Enter" && showList && active >= 0 && results[active]) {
      e.preventDefault();
      go(results[active].symbol);
    }
  };

  const lg = size === "lg";
  const status =
    failed === total
      ? "Suggestions unavailable. You can still enter any ticker."
      : failed > 0
        ? `Some suggestion lists are unavailable (${failed} of ${total}). Any ticker can still be entered.`
        : loading && all.length === 0
          ? "Loading suggestions..."
          : null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); go(value); }} className="w-full" role="search" data-testid="form-ticker-search">
      <label htmlFor={`${id}-input`} className="sr-only">Ticker symbol or company name</label>
      <div className={`flex gap-3 ${lg ? "flex-col sm:flex-row" : "flex-row"}`}>
        <div className="relative flex-1">
          <Search className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground ${lg ? "h-5 w-5" : "h-4 w-4"}`} />
          <Input
            ref={inputRef}
            id={`${id}-input`}
            autoFocus={autoFocus}
            autoComplete="off"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
            value={value}
            onChange={(e) => { setValue(e.target.value); setOpen(true); setActive(-1); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="Ticker or company, e.g. AAPL or Apple"
            data-testid="input-ticker-search"
            className={`w-full border-2 border-primary/30 bg-card font-mono shadow-sm focus-visible:border-primary focus-visible:ring-primary/20 ${lg ? "h-14 pl-12 text-lg" : "h-10 pl-10 text-sm"}`}
          />
          {showList && (
            <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-md border border-border bg-popover p-1 text-left shadow-lg">
              {results.map((s, i) => (
                <li
                  key={s.symbol}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-testid={`option-ticker-${s.symbol}`}
                  onMouseDown={(e) => { e.preventDefault(); go(s.symbol); }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm ${i === active ? "bg-primary/10 text-foreground" : "text-foreground"}`}
                >
                  <span className="w-16 shrink-0 font-mono font-semibold">{s.symbol}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.sector && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{s.sector}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          data-testid="button-view-insights"
          className={`inline-flex items-center justify-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${lg ? "h-14 px-6 text-base" : "h-10 px-4 text-sm whitespace-nowrap"}`}
        >
          View Insights
          <ArrowRight className={lg ? "h-5 w-5" : "h-4 w-4"} />
        </button>
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground text-left" data-testid="status-ticker-suggestions">
        {status ?? ""}
      </p>
    </form>
  );
}
