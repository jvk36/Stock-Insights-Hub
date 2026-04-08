import { useState } from "react";
import { useLocation } from "wouter";
import { Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function Home() {
  const [, setLocation] = useLocation();
  const [symbol, setSymbol] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      setLocation(`/stock/${symbol.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md flex flex-col items-center space-y-8"
      >
        <div className="flex items-center space-x-3 text-primary">
          <TrendingUp className="w-10 h-10" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Terminal</h1>
        </div>

        <form onSubmit={handleSubmit} className="w-full relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Enter Stock Symbol (e.g. AAPL)"
            className="w-full pl-12 pr-4 py-6 text-lg bg-card border-border shadow-lg font-mono focus-visible:ring-primary uppercase"
            autoFocus
          />
          <Button 
            type="submit" 
            className="absolute right-2 top-1/2 -translate-y-1/2"
            disabled={!symbol.trim()}
          >
            Search
          </Button>
        </form>

        <div className="flex gap-4 text-sm text-muted-foreground font-mono">
          <span>Try:</span>
          {['AAPL', 'MSFT', 'GOOGL', 'NVDA'].map(s => (
            <button 
              key={s}
              onClick={() => setLocation(`/stock/${s}`)}
              className="hover:text-primary transition-colors hover:underline"
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
