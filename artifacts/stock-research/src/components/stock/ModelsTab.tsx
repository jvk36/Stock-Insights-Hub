import { useState } from "react";
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
    { value: "graham", label: "Graham Growth", suitableFor: "Profitable growth companies with positive earnings and reasonably predictable long-term growth." },
    { value: "katsenelson", label: "Abs. PE", suitableFor: "Established profitable businesses whose quality, growth, and financial strength can justify a normalized P/E multiple." },
    { value: "evebit", label: "EV / EBIT", suitableFor: "Mature, capital-intensive businesses where depreciation is meaningful and capital structures differ across peers." },
    { value: "epv", label: "EPV", suitableFor: "Mature businesses with stable recurring operating earnings whose current earnings power can be valued without assuming growth." },
    { value: "owners", label: "Owner's Earnings", suitableFor: "Cash-generative businesses where reported earnings differ from the cash owners can withdraw after required reinvestment." },
    { value: "riv", label: "Residual Income", suitableFor: "Financial institutions and other businesses where book value is meaningful and free cash flow is difficult to interpret." },
    { value: "ddm", label: "Dividend Growth", suitableFor: "Mature dividend-paying companies with a consistent, sustainable record of dividend growth." },
  ];
  const [activeModel, setActiveModel] = useState("graham");
  const activeSuitability = tabs.find((tab) => tab.value === activeModel)?.suitableFor;

  return (
    <Tabs value={activeModel} onValueChange={setActiveModel} className="w-full">
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

      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Best suited to</p>
        <p className="mt-1 text-sm">{activeSuitability}</p>
      </div>

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
