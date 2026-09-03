import { useGetBoardLeadership, getGetBoardLeadershipQueryKey } from "@workspace/api-client-react";
import { AlertCircle, ShieldAlert, Users, Briefcase, ExternalLink, FileText, CheckCircle2, XCircle, Info, Loader2 } from "lucide-react";

const formatCurrency = (val: number | null | undefined) => {
  if (val == null) return "—";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
};

const formatShares = (val: number | null | undefined) => {
  if (val == null) return "—";
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
  return val.toLocaleString();
};

const combinedEquityAwards = (
  stockAwards: number | null | undefined,
  optionAwards: number | null | undefined,
) => {
  if (stockAwards == null && optionAwards == null) return null;
  return (stockAwards ?? 0) + (optionAwards ?? 0);
};

const CampaignStatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    active: "bg-destructive/10 text-destructive border-destructive/20",
    recent: "bg-primary/10 text-primary border-primary/20",
    concluded: "bg-muted text-muted-foreground border-border",
    settled: "bg-success/10 text-success border-success/20",
    unknown: "bg-secondary text-secondary-foreground border-border"
  };
  
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${colors[status.toLowerCase()] || colors.unknown}`}>
      {status}
    </span>
  );
};

export default function BoardLeadershipTab({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useGetBoardLeadership(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetBoardLeadershipQueryKey(symbol)
    }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
        <p className="text-sm font-medium uppercase tracking-widest">Loading Board & Leadership</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="border border-destructive/20 bg-destructive/5 rounded-md p-6 flex items-start gap-3 text-destructive">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-sm">Failed to load board and leadership data</h3>
          <p className="text-sm opacity-80 mt-1">There was an error fetching the proxy and governance details for this symbol. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="board-leadership-tab">
      <div className="flex flex-wrap gap-4 items-center bg-card border border-border p-3 rounded-md text-sm">
        <div className="flex items-center gap-2 text-muted-foreground border-r border-border pr-4">
          <Info className="w-4 h-4" />
          <span>Data as of {data.dataAsOf}</span>
        </div>
        
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-1.5 text-xs">
            {data.coverage.proxyAvailable ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
            <span className={data.coverage.proxyAvailable ? "text-foreground" : "text-muted-foreground"}>Proxy Statement</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {data.coverage.executiveCompensationAvailable ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
            <span className={data.coverage.executiveCompensationAvailable ? "text-foreground" : "text-muted-foreground"}>Exec Comp</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {data.coverage.boardRosterAvailable ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
            <span className={data.coverage.boardRosterAvailable ? "text-foreground" : "text-muted-foreground"}>Board Roster</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
            <span>Filings Reviewed:</span>
            <span className="font-mono font-medium text-foreground">{data.coverage.activistFilingsReviewed}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Executive Leadership */}
          <div className="border border-border bg-card rounded-md overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wider text-foreground">
                <Briefcase className="w-4 h-4 text-primary" />
                Executive Leadership
              </h3>
            </div>
            
            {!data.coverage.executiveCompensationAvailable && (
               <div className="px-4 py-3 bg-secondary/30 text-secondary-foreground text-xs border-b border-border flex items-start gap-2">
                 <AlertCircle className="w-4 h-4 shrink-0" />
                 <span>Detailed executive compensation is currently unavailable. Displaying best available current roster.</span>
               </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 font-medium">Executive</th>
                    <th className="px-4 py-2 font-medium text-right">Age</th>
                    <th className="px-4 py-2 font-medium text-right">Shares Owned</th>
                    <th className="px-4 py-2 font-medium text-right">Base Salary</th>
                    <th className="px-4 py-2 font-medium text-right">Stock & Options</th>
                    <th className="px-4 py-2 font-medium text-right">Total Comp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.executives.map(exec => (
                    <tr key={exec.name} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          {exec.name}
                          {exec.isFounder && <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Founder</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 whitespace-normal max-w-[250px]">{exec.title}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{exec.age || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono">{formatShares(exec.sharesOwned)}</div>
                        {exec.ownershipDate && <div className="text-[10px] text-muted-foreground">as of {exec.ownershipDate}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(exec.compensation?.salary)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(combinedEquityAwards(
                          exec.compensation?.stockAwards,
                          exec.compensation?.optionAwards,
                        ))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {formatCurrency(exec.compensation?.total)}
                        {exec.compensation?.fiscalYear && <div className="text-[10px] text-muted-foreground font-sans font-normal mt-0.5">FY{exec.compensation.fiscalYear}</div>}
                      </td>
                    </tr>
                  ))}
                  {data.executives.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No executive data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Board of Directors */}
          <div className="border border-border bg-card rounded-md overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wider text-foreground">
                <Users className="w-4 h-4 text-primary" />
                Board of Directors
              </h3>
            </div>
            
            {!data.coverage.boardRosterAvailable && (
               <div className="px-4 py-3 bg-secondary/30 text-secondary-foreground text-xs border-b border-border flex items-start gap-2">
                 <AlertCircle className="w-4 h-4 shrink-0" />
                 <span>Detailed board roster is currently unavailable. Displaying best available proxy data.</span>
               </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 font-medium">Director</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Age</th>
                    <th className="px-4 py-2 font-medium text-right">Tenure</th>
                    <th className="px-4 py-2 font-medium text-center">Next Election</th>
                    <th className="px-4 py-2 font-medium text-right">Shares Owned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.boardMembers.map((member, i) => (
                    <tr key={`${member.name}-${i}`} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          {member.name}
                          {member.isFounder && <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Founder</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 whitespace-normal max-w-[250px]" title={member.occupation || member.role || ''}>
                          {member.occupation || member.role || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {member.isIndependent === true && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">Independent</span>}
                        {member.isIndependent === false && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground uppercase tracking-wider">Insider</span>}
                        {member.isIndependent == null && <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{member.age || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div>{member.directorSince || '—'}</div>
                        {member.tenureYears != null && <div className="text-[10px] text-muted-foreground mt-0.5">{member.tenureYears} yrs</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {member.upForElection ? (
                            <span className="w-2 h-2 rounded-full bg-destructive" title="Up for election"></span>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-success" title="Not up for election"></span>
                          )}
                          <span>{member.electionYear || '—'}</span>
                        </div>
                        {member.electionTerm && <div className="text-[10px] text-muted-foreground mt-0.5 text-center truncate max-w-[120px]">{member.electionTerm}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatShares(member.sharesOwned)}
                      </td>
                    </tr>
                  ))}
                  {data.boardMembers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No board member data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Activist Campaigns */}
          <div className="border border-border bg-card rounded-md overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wider text-foreground">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Activist Campaigns
              </h3>
            </div>
            
            <div className="p-4 border-b border-border bg-card">
              <p className="text-sm leading-relaxed text-foreground">{data.activistSummary || 'No recent activist campaign activity summarized.'}</p>
            </div>

            <div className="divide-y divide-border">
              {data.activistCampaigns.length > 0 ? data.activistCampaigns.map((campaign, i) => (
                <div key={i} className="p-4 hover:bg-muted/10 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <div className="font-medium text-foreground">{campaign.activistName}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <span>{campaign.filingDate}</span>
                        <span>•</span>
                        <span className="uppercase tracking-wider font-mono">{campaign.form}</span>
                      </div>
                    </div>
                    <CampaignStatusBadge status={campaign.status} />
                  </div>
                  
                  {campaign.objective && (
                    <div className="mt-3">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Objective</span>
                      <p className="text-sm">{campaign.objective}</p>
                    </div>
                  )}
                  
                  <div className="mt-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Status Detail</span>
                    <p className="text-sm text-muted-foreground">{campaign.statusDetail}</p>
                  </div>

                  {campaign.sourceUrl && (
                    <a href={campaign.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline mt-4">
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Source Filing
                    </a>
                  )}
                </div>
              )) : (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No active or recent campaigns found.
                </div>
              )}
            </div>
          </div>

          {/* Sources */}
          <div className="border border-border bg-card rounded-md overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wider text-foreground">
                <FileText className="w-4 h-4 text-primary" />
                Sources & Filings
              </h3>
            </div>
            <div className="divide-y divide-border">
              {data.sources.length > 0 ? data.sources.map((source, i) => (
                <div key={i} className="p-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-foreground">{source.label}</div>
                    {source.filingDate && <div className="text-xs text-muted-foreground mt-0.5">{source.filingDate}</div>}
                  </div>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 shrink-0 ml-4">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">Unavailable</span>
                  )}
                </div>
              )) : (
                 <div className="p-4 text-center text-sm text-muted-foreground">No source documents listed.</div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
