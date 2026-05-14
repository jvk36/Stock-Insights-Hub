import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetStockModels } from "@workspace/api-client-react";
import GrahamModel from "./models/GrahamModel";
import EvEbitModel from "./models/EvEbitModel";
import DdmModel from "./models/DdmModel";
import KatsenelsonModel from "./models/KatsenelsonModel";
import EpvModel from "./models/EpvModel";
import OwnersEarningsModel from "./models/OwnersEarningsModel";
import RivModel from "./models/RivModel";

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

  const tabs = [
    { value: "graham", label: "Graham Growth" },
    { value: "katsenelson", label: "Abs. PE" },
    { value: "evebit", label: "EV / EBIT" },
    { value: "epv", label: "EPV" },
    { value: "owners", label: "Owner's Earnings" },
    { value: "riv", label: "Residual Income" },
    { value: "ddm", label: "Dividend Growth" },
  ];

  return (
    <Tabs defaultValue="graham" className="w-full">
      <TabsList className="bg-card border border-border h-auto p-1 flex flex-wrap gap-1">
        {tabs.map(t => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="mt-4">
        <TabsContent value="graham" className="mt-0">
          <GrahamModel data={data.graham} currentPrice={data.graham.currentPrice ?? null} />
        </TabsContent>
        <TabsContent value="katsenelson" className="mt-0">
          <KatsenelsonModel data={data.katsenelson} currentPrice={data.katsenelson.currentPrice ?? null} />
        </TabsContent>
        <TabsContent value="evebit" className="mt-0">
          <EvEbitModel data={data.evEbit} currentPrice={data.graham.currentPrice ?? null} />
        </TabsContent>
        <TabsContent value="epv" className="mt-0">
          <EpvModel data={data.epv} currentPrice={data.epv.currentPrice ?? null} />
        </TabsContent>
        <TabsContent value="owners" className="mt-0">
          <OwnersEarningsModel data={data.ownersEarnings} currentPrice={data.ownersEarnings.currentPrice ?? null} />
        </TabsContent>
        <TabsContent value="riv" className="mt-0">
          <RivModel data={data.riv} currentPrice={data.riv.currentPrice ?? null} />
        </TabsContent>
        <TabsContent value="ddm" className="mt-0">
          <DdmModel data={data.ddm} currentPrice={data.ddm.currentPrice ?? null} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
