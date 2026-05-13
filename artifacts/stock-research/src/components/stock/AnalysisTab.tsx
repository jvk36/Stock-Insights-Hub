import { useGetStockAnalysis, getGetStockAnalysisQueryKey } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import DcfAnalysis from "./analysis/DcfAnalysis";
import ReverseDcfAnalysis from "./analysis/ReverseDcfAnalysis";
import MoatAnalysis from "./analysis/MoatAnalysis";

interface Props {
  symbol: string;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}

export default function AnalysisTab({ symbol }: Props) {
  const { data, isLoading, isError } = useGetStockAnalysis(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockAnalysisQueryKey(symbol),
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">
        Unable to load analysis data. This may occur for ETFs, funds, or thinly traded securities without full financial statements.
      </div>
    );
  }

  return (
    <Tabs defaultValue="dcf" className="w-full">
      <TabsList className="bg-card border border-border h-auto p-1 mb-6">
        <TabsTrigger
          value="dcf"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm"
        >
          DCF Valuation
        </TabsTrigger>
        <TabsTrigger
          value="reverse-dcf"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm"
        >
          Reverse DCF
        </TabsTrigger>
        <TabsTrigger
          value="moat"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm"
        >
          MOAT Analysis
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dcf" className="mt-0">
        <DcfAnalysis dcfInputs={data.dcfInputs} />
      </TabsContent>

      <TabsContent value="reverse-dcf" className="mt-0">
        <ReverseDcfAnalysis dcfInputs={data.dcfInputs} />
      </TabsContent>

      <TabsContent value="moat" className="mt-0">
        <MoatAnalysis moatRows={data.moatRows} />
      </TabsContent>
    </Tabs>
  );
}
