import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetStockModels } from "@workspace/api-client-react";
import GrahamModel from "./models/GrahamModel";
import EvEbitModel from "./models/EvEbitModel";
import DdmModel from "./models/DdmModel";

interface Props {
  symbol: string;
}

export default function ModelsTab({ symbol }: Props) {
  const { data, isLoading, error } = useGetStockModels(symbol);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        Loading model data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-destructive text-sm">
        Failed to load model data. Please try again.
      </div>
    );
  }

  return (
    <Tabs defaultValue="graham" className="w-full">
      <TabsList className="bg-card border border-border h-auto p-1 inline-flex gap-1">
        <TabsTrigger value="graham" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
          Graham Growth
        </TabsTrigger>
        <TabsTrigger value="evebit" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
          EV / EBIT
        </TabsTrigger>
        <TabsTrigger value="ddm" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
          Dividend Growth
        </TabsTrigger>
      </TabsList>

      <div className="mt-4">
        <TabsContent value="graham" className="mt-0">
          <GrahamModel data={data.graham} currentPrice={data.graham.currentPrice ?? null} />
        </TabsContent>
        <TabsContent value="evebit" className="mt-0">
          <EvEbitModel data={data.evEbit} currentPrice={data.graham.currentPrice ?? null} />
        </TabsContent>
        <TabsContent value="ddm" className="mt-0">
          <DdmModel data={data.ddm} currentPrice={data.ddm.currentPrice ?? null} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
