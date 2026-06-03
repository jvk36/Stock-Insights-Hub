import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const GUIDE_CARDS = [
  {
    title: "PMI (Purchasing Managers' Index)",
    source: "ISM",
    frequency: "Monthly (1st business day)",
    what: "A survey-based leading indicator of economic activity in manufacturing (and services). Based on new orders, production, employment, supplier deliveries, and inventories.",
    ranges: [
      { range: "> 60", label: "Very Strong Expansion", cls: "text-emerald-400" },
      { range: "55 – 60", label: "Strong Expansion", cls: "text-emerald-400" },
      { range: "50 – 55", label: "Moderate Expansion", cls: "text-amber-400" },
      { range: "48 – 50", label: "Near Stall Speed", cls: "text-amber-400" },
      { range: "< 48", label: "Contraction", cls: "text-red-400" },
    ],
  },
  {
    title: "Yield Curve (2s10s Spread)",
    source: "US Treasury / Federal Reserve",
    frequency: "Daily",
    what: "The difference between the 10-year and 2-year Treasury yields. A positive spread (normal curve) indicates healthy growth expectations. Inversion has preceded every US recession since 1955.",
    ranges: [
      { range: "> +1.0%", label: "Steeply Normal — Growth expected", cls: "text-emerald-400" },
      { range: "0 to +1.0%", label: "Normal — Mild growth", cls: "text-emerald-400" },
      { range: "-0.5% to 0", label: "Inverted — Recession warning", cls: "text-amber-400" },
      { range: "< -0.5%", label: "Deeply Inverted — Strong recession signal", cls: "text-red-400" },
    ],
  },
  {
    title: "Nonfarm Payrolls (NFP)",
    source: "Bureau of Labor Statistics (BLS)",
    frequency: "Monthly (1st Friday)",
    what: "Monthly change in the number of employed people in the US, excluding farm workers, private household employees, and non-profit employees. The single most-watched labor market indicator.",
    ranges: [
      { range: "> 300K", label: "Very Strong — Labor market booming", cls: "text-emerald-400" },
      { range: "200K – 300K", label: "Strong — Well above trend", cls: "text-emerald-400" },
      { range: "100K – 200K", label: "Moderate — Near trend", cls: "text-amber-400" },
      { range: "0 – 100K", label: "Weak — Below trend", cls: "text-amber-400" },
      { range: "< 0", label: "Contraction — Job losses", cls: "text-red-400" },
    ],
  },
  {
    title: "PCE vs. CPI — What's the Difference?",
    source: "BEA (PCE) / BLS (CPI)",
    frequency: "Monthly",
    what: "Both measure consumer price inflation but differ in methodology. PCE (Personal Consumption Expenditures) is the Fed's preferred measure because it accounts for substitution effects (consumers switching to cheaper goods) and covers a broader range of spending. CPI is fixed-basket and typically runs 0.3–0.5% higher than PCE. The Fed's 2% target is based on Core PCE.",
    ranges: [
      { range: "Core PCE < 2%", label: "Below target — Easing possible", cls: "text-emerald-400" },
      { range: "Core PCE 2–2.5%", label: "On target — Neutral policy", cls: "text-emerald-400" },
      { range: "Core PCE 2.5–3.5%", label: "Above target — Hawkish bias", cls: "text-amber-400" },
      { range: "Core PCE > 3.5%", label: "Well above — Restrictive policy", cls: "text-red-400" },
    ],
  },
  {
    title: "Credit Spreads",
    source: "ICE BofA (via FRED)",
    frequency: "Daily",
    what: "The extra yield investors demand to hold corporate bonds over equivalent Treasury bonds. High-yield (HY/junk) spreads above 500bps signal financial stress. Investment-grade (IG) spread widening above 150bps signals corporate sector worry. Spreads are a real-time risk barometer.",
    ranges: [
      { range: "HY < 300bps", label: "Tight — Risk-on, low default risk", cls: "text-emerald-400" },
      { range: "HY 300–500bps", label: "Normal range", cls: "text-amber-400" },
      { range: "HY 500–700bps", label: "Wide — Stress building", cls: "text-amber-400" },
      { range: "HY > 700bps", label: "Crisis levels — Recession likely", cls: "text-red-400" },
    ],
  },
  {
    title: "Leading vs. Lagging Indicators",
    source: "Various",
    frequency: "Various",
    what: "Leading indicators change before the economy does — they predict future direction: ISM PMI, yield curve, initial jobless claims, building permits, stock prices. Lagging indicators confirm trends after the fact: unemployment rate, CPI, GDP, corporate profits. Coincident indicators move with the economy now: NFP, industrial production, personal income.",
    ranges: [
      { range: "Leading", label: "PMI, Yield Curve, Jobless Claims, Building Permits", cls: "text-blue-400" },
      { range: "Coincident", label: "NFP, Industrial Production, Personal Income", cls: "text-muted-foreground" },
      { range: "Lagging", label: "Unemployment Rate, CPI, GDP", cls: "text-purple-400" },
    ],
  },
];

const RELEASE_CALENDAR = [
  { frequency: "Weekly", release: "Initial Jobless Claims", date: "Thursday 8:30am ET" },
  { frequency: "Weekly", release: "Continuing Claims", date: "Thursday 8:30am ET" },
  { frequency: "Weekly", release: "EIA Crude Oil Inventories", date: "Wednesday 10:30am ET" },
  { frequency: "Monthly", release: "Nonfarm Payrolls (BLS)", date: "1st Friday 8:30am ET" },
  { frequency: "Monthly", release: "Unemployment Rate (U-3)", date: "1st Friday 8:30am ET" },
  { frequency: "Monthly", release: "ISM Manufacturing PMI", date: "1st Business Day" },
  { frequency: "Monthly", release: "ISM Services PMI", date: "3rd Business Day" },
  { frequency: "Monthly", release: "CPI (BLS)", date: "~10th–15th 8:30am ET" },
  { frequency: "Monthly", release: "Core CPI (BLS)", date: "~10th–15th 8:30am ET" },
  { frequency: "Monthly", release: "PPI (BLS)", date: "~12th–14th 8:30am ET" },
  { frequency: "Monthly", release: "Retail Sales (Census)", date: "~15th 8:30am ET" },
  { frequency: "Monthly", release: "Industrial Production (Fed)", date: "~15th–17th 9:15am ET" },
  { frequency: "Monthly", release: "JOLTS Job Openings", date: "~1st Tuesday (2-month lag)" },
  { frequency: "Monthly", release: "PCE / Core PCE (BEA)", date: "Last business day 8:30am ET" },
  { frequency: "Monthly", release: "Personal Income & Spending", date: "Last business day 8:30am ET" },
  { frequency: "Monthly", release: "Durable Goods Orders", date: "~25th 8:30am ET" },
  { frequency: "Monthly", release: "Building Permits / Housing Starts", date: "~18th–20th 8:30am ET" },
  { frequency: "Monthly", release: "Conference Board Consumer Confidence", date: "Last Tuesday" },
  { frequency: "Monthly", release: "Univ. of Michigan Consumer Sentiment", date: "2nd Friday (prelim)" },
  { frequency: "Monthly", release: "ADP National Employment Report", date: "Wednesday before BLS (2 days)" },
  { frequency: "Monthly", release: "Chicago Fed NFCI", date: "Friday" },
  { frequency: "Quarterly", release: "GDP (Advance Estimate, BEA)", date: "~Last week of month after quarter" },
  { frequency: "Quarterly", release: "GDP (2nd Estimate, BEA)", date: "~4 weeks after Advance" },
  { frequency: "Quarterly", release: "GDP (3rd Estimate, BEA)", date: "~4 weeks after 2nd" },
  { frequency: "As Needed", release: "FOMC Rate Decision", date: "8 meetings/year, 2pm ET" },
  { frequency: "As Needed", release: "Fed Chair Press Conference", date: "After each FOMC meeting" },
];

const freqBadgeClass: Record<string, string> = {
  "Weekly": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Monthly": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Quarterly": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "As Needed": "bg-muted text-muted-foreground border-border",
};

export default function MacroDiyGuideTab() {
  return (
    <div className="space-y-8">
      {/* a) How to Read Each Indicator */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          How To Read Each Indicator
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {GUIDE_CARDS.map((card) => (
            <Card key={card.title} className="flex flex-col">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold leading-snug">{card.title}</CardTitle>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  <span>📊 {card.source}</span>
                  <span>🗓 {card.frequency}</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 flex-1 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{card.what}</p>
                <div className="space-y-1.5">
                  {card.ranges.map((r) => (
                    <div key={r.range} className="flex items-start gap-2">
                      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap min-w-[80px]">{r.range}</span>
                      <span className={`text-xs font-medium leading-snug ${r.cls}`}>{r.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* b) Data Release Calendar */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Data Release Calendar
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Frequency</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Key Release</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Release Date / Time</th>
              </tr>
            </thead>
            <tbody>
              {RELEASE_CALENDAR.map((row, i) => (
                <tr
                  key={`${row.frequency}-${row.release}`}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                >
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${freqBadgeClass[row.frequency] ?? freqBadgeClass["As Needed"]}`}>
                      {row.frequency}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium">{row.release}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
