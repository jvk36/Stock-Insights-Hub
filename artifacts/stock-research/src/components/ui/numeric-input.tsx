import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
}

export function NumericInput({ value, onChange, min, max, className, placeholder }: NumericInputProps) {
  const [display, setDisplay] = useState(() => String(value));
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDisplay(String(value));
    }
  }, [value]);

  function clamp(n: number): number {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const s = e.target.value;
    setDisplay(s);
    const n = parseFloat(s);
    if (!isNaN(n) && isFinite(n)) {
      const c = clamp(n);
      committed.current = c;
      onChange(c);
    }
  }

  function handleBlur() {
    const n = parseFloat(display);
    if (isNaN(n) || !isFinite(n)) {
      setDisplay(String(committed.current));
    } else {
      const c = clamp(n);
      committed.current = c;
      onChange(c);
      setDisplay(String(c));
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "font-mono",
        className
      )}
    />
  );
}
