import { useGetStockNews, getGetStockNewsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";

export default function NewsSection({ symbol }: { symbol: string }) {
  const { data, isLoading } = useGetStockNews(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockNewsQueryKey(symbol)
    }
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Latest News</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : !data?.news || data.news.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">No news available</div>
        ) : (
          <div className="divide-y divide-border/50">
            {data.news.map((item) => (
              <a 
                key={item.id} 
                href={item.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="group block py-5 first:pt-0 last:pb-0 hover:bg-muted/30 transition-colors -mx-6 px-6"
              >
                <div className="flex gap-4">
                  {item.thumbnail && (
                    <div className="shrink-0 hidden sm:block">
                      <img 
                        src={item.thumbnail} 
                        alt="" 
                        className="w-24 h-24 object-cover rounded border border-border"
                      />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      <span className="font-semibold text-primary">{item.publisher}</span>
                      <span>•</span>
                      <span>{formatDateTime(item.publishedAt)}</span>
                    </div>
                    <h3 className="font-medium text-lg leading-tight group-hover:text-primary transition-colors flex items-start gap-2">
                      {item.title}
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                    </h3>
                    {item.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
