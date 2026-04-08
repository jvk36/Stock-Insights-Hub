import { useGetStockProfile, getGetStockProfileQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Globe, Users, Building } from "lucide-react";
import { formatNumber } from "@/lib/format";

export default function CompanyProfile({ symbol }: { symbol: string }) {
  const { data: profile, isLoading } = useGetStockProfile(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockProfileQueryKey(symbol)
    }
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 space-y-6">
          <Skeleton className="h-6 w-1/3" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center text-muted-foreground">
          Profile data not available.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Company Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-1">{profile.longName}</h2>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {profile.sector && <span>Sector: <strong className="text-foreground">{profile.sector}</strong></span>}
            {profile.industry && <span>Industry: <strong className="text-foreground">{profile.industry}</strong></span>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          <div className="flex items-center gap-3 text-sm">
            <Building className="w-4 h-4 text-muted-foreground" />
            <span>Headquarters</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {profile.address}, {profile.city}, {profile.state} {profile.country}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span>Employees</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {profile.employees ? formatNumber(profile.employees).replace('$', '') : "-"}
          </div>

          {profile.website && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span>Website</span>
              </div>
              <div className="text-sm">
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {profile.website}
                </a>
              </div>
            </>
          )}
        </div>

        {profile.description && (
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-medium mb-2">Description</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {profile.description}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
