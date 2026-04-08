import { useGetSecFilings, getGetSecFilingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { ExternalLink, FileText, FolderOpen } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SecFilings({ symbol }: { symbol: string }) {
  const { data, isLoading } = useGetSecFilings(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetSecFilingsQueryKey(symbol)
    }
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">SEC Filings</CardTitle>
        {data?.cik && (
          <a
            href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${data.cik}&type=&dateb=&owner=include&count=40`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            CIK: {data.cik} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.filings || data.filings.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No SEC filings available.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[150px] text-right">Date Filed</TableHead>
                <TableHead className="w-[80px] text-right">Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.filings.map((filing) => (
                <TableRow
                  key={filing.id}
                  className="group hover:bg-muted/30 cursor-pointer"
                  onClick={() => window.open(filing.documentUrl ?? filing.url, "_blank")}
                >
                  <TableCell className="font-mono font-medium text-primary">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      {filing.type}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm group-hover:text-primary transition-colors">
                    {filing.description || filing.type}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm font-mono">
                    {formatDate(filing.filedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {filing.documentUrl && (
                        <a
                          href={filing.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open document"
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <a
                        href={filing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Filing index"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </a>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
