import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import StockDetail from "@/pages/stock";
import MacroSummary from "@/pages/macro";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function HomeRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/stock/AAPL");
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/stock/:symbol" component={StockDetail} />
      <Route path="/macro" component={MacroSummary} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
