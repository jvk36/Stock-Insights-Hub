import { useState } from "react";
import { useGetStockFinancials, getGetStockFinancialsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinancialPeriod } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const LABEL_MAP: Record<string, string> = {
  totalRevenue: "Total Revenue",
  costOfRevenue: "Cost of Revenue",
  grossProfit: "Gross Profit",
  operatingExpense: "Operating Expenses",
  operatingIncome: "Operating Income",
  netIncome: "Net Income",
  ebitda: "EBITDA",
  totalAssets: "Total Assets",
  totalLiabilities: "Total Liabilities",
  totalStockholderEquity: "Stockholder Equity",
  cashAndCashEquivalents: "Cash & Equivalents",
  inventory: "Inventory",
  totalDebt: "Total Debt",
  operatingCashFlow: "Operating Cash Flow",
  investingCashFlow: "Investing Cash Flow",
  financingCashFlow: "Financing Cash Flow",
  freeCashFlow: "Free Cash Flow",
  capitalExpenditure: "Capital Expenditure"
};

function formatLabel(key: string): string {
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  // CamelCase to Title Case
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase());
}

export default function Financials({ symbol }: { symbol: string }) {
  const [period, setPeriod] = useState<"quarterly" | "annual">("quarterly");

  const { data, isLoading } = useGetStockFinancials(symbol, { period }, {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockFinancialsQueryKey(symbol, { period })
    }
  });

  const renderTable = (periods: FinancialPeriod[]) => {
    if (!periods || periods.length === 0) return <div className="p-8 text-center text-muted-foreground">No data available</div>;

    // Get all unique keys from all periods to ensure we show all rows
    const keys = new Set<string>();
    periods.forEach(p => Object.keys(p.data).forEach(k => keys.add(k)));
    const sortedKeys = Array.from(keys).sort(); // Sort or order specifically if needed

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[250px] sticky left-0 bg-card z-10 shadow-[1px_0_0_0_hsl(var(--border))]">Metric</TableHead>
              {periods.map(p => (
                <TableHead key={p.date} className="text-right font-mono min-w-[120px]">
                  {formatDate(p.date)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedKeys.map(key => (
              <TableRow key={key} className="hover:bg-muted/30">
                <TableCell className="font-medium sticky left-0 bg-card/95 backdrop-blur z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                  {formatLabel(key)}
                </TableCell>
                {periods.map(p => (
                  <TableCell key={`${p.date}-${key}`} className="text-right font-mono text-muted-foreground">
                    {formatNumber(p.data[key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Financial Statements</CardTitle>
        <div className="flex items-center space-x-2">
          <Label htmlFor="period-toggle" className="text-sm cursor-pointer" onClick={() => setPeriod("quarterly")}>Quarterly</Label>
          <Switch 
            id="period-toggle" 
            checked={period === "annual"} 
            onCheckedChange={(checked) => setPeriod(checked ? "annual" : "quarterly")}
            className="data-[state=checked]:bg-primary"
          />
          <Label htmlFor="period-toggle" className="text-sm cursor-pointer" onClick={() => setPeriod("annual")}>Annual</Label>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !data ? (
          <div className="p-8 text-center text-muted-foreground">Failed to load financials.</div>
        ) : (
          <Tabs defaultValue="income" className="w-full">
            <TabsList className="bg-muted/50 border border-border w-full justify-start rounded-none sm:rounded-md mb-4 px-1 py-1 h-auto overflow-x-auto">
              <TabsTrigger value="income" className="data-[state=active]:bg-card">Income Statement</TabsTrigger>
              <TabsTrigger value="balance" className="data-[state=active]:bg-card">Balance Sheet</TabsTrigger>
              <TabsTrigger value="cash" className="data-[state=active]:bg-card">Cash Flow</TabsTrigger>
            </TabsList>
            
            <TabsContent value="income" className="m-0 border border-border rounded-md">
              {renderTable(data.incomeStatement)}
            </TabsContent>
            <TabsContent value="balance" className="m-0 border border-border rounded-md">
              {renderTable(data.balanceSheet)}
            </TabsContent>
            <TabsContent value="cash" className="m-0 border border-border rounded-md">
              {renderTable(data.cashFlow)}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
