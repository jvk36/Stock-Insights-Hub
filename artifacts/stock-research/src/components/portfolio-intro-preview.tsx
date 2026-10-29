import { PremiumFeatureNotice } from "@/components/premium-feature-notice";

const INTROS = {
  cloning: {
    title: "Cloning",
    rationale: "Follow the largest disclosed new buys and position increases of the superinvestors tracked by Hedge Fund Blueprint. The premise is to benefit from their research and conviction through a transparent, repeatable equity-selection process.",
    rules: "Each quarter, select each tracked manager’s largest buy or increase by added portfolio weight, skip managers with no qualifying activity, and rank the resulting picks. Buy ten distinct stocks with equal allocations from an initial $30,000. Sell all holdings and buy the newly selected portfolio 45 days after each quarter-end, using that session’s closing prices (or the next trading day’s close). The model begins August 15, 2026, with execution on the next trading session.",
    expectations: "A concentrated, long-only equity strategy seeking long-term capital appreciation—not guaranteed absolute or uncorrelated returns. 13F disclosures are delayed, omit shorts and other exposures, and may no longer reflect a manager’s current holdings. Market risk, concentration and copying at different prices can materially affect results.",
  },
  "magic-formula": {
    title: "Magic Formula",
    rationale: "A systematic adaptation of Joel Greenblatt’s approach: seek businesses that combine an attractive purchase price with strong returns on operating capital. The universe is the S&P 500, excluding Financials and Utilities and companies without valid required inputs.",
    rules: "Rank eligible companies by earnings yield (EBIT / enterprise value) and standard Greenblatt return on capital (EBIT / (net working capital + net property, plant and equipment)). Combine the two ranks, breaking equal combined scores alphabetically. Divide $30,000 into four $7,500 groups: buy ranks 1–5 initially, then 6–10, 11–15 and 16–20 at three-month intervals. Freeze rankings annually; replace each group after a year using sale proceeds and available dividend cash. The initial group uses October 27, 2026 opening prices.",
    expectations: "Seeks long-term equity appreciation from value and business quality. It is not market-neutral or a promise of positive returns in every market. Value stocks can underperform for years, accounting data arrives with a lag, and rankings are not a full appraisal of business risks.",
  },
  "blind-trust": {
    title: "Blind Trust",
    rationale: "Invest in permanent-capital businesses whose managers can redeploy retained capital among operating businesses, acquisitions, investments, debt reduction and buybacks. The strategy delegates ongoing capital-allocation decisions to these businesses while applying a consistent valuation screen.",
    rules: "Screen Berkshire Hathaway (BRK.A), Markel (MKL), Fairfax Financial (FRFHF), Jefferies (JEF), Loews (L), Howard Hughes (HHH), Pershing Square USA (PSUS) and Boston Omaha (BOC). Rank by the lowest positive price-to-book ratio using consistent USD inputs; use officially published NAV per share for PSUS. Allocate $10,000 to each of the top three at inception on October 26, 2026 using opening prices. Recompute and allocate the then-current total equally to the top three annually. Hold dividends as cash until rebalancing.",
    expectations: "Seeks long-term compounding and capital appreciation, not inherently uncorrelated or guaranteed absolute returns. Permanent capital does not protect the investor’s principal. Three-stock concentration, leverage, weak capital allocation, accounting differences and value traps can cause substantial losses.",
  },
  momentum: {
    title: "Momentum",
    rationale: "A diversified trend-following allocation across equities, real estate and government bonds. Rather than forecasting the economy, it uses a simple price-trend rule to adapt exposure across assets that can behave differently under changing market conditions.",
    rules: "Screen six ETFs: VTI (U.S. equities), VEU (international equities), VWO (emerging markets), VNQ (REITs), TLT (long-term U.S. Treasuries) and TIP (inflation-protected Treasuries). Allocate the initial $30,000 equally among ETFs trading strictly above their own 200-day simple moving average. Review and fully reallocate every three months, anchored to October 26, 2026. If none qualifies, hold cash. Dividends accumulate in cash until rebalancing.",
    expectations: "Aims to reduce dependence on any one market and pursue absolute-return potential, but it is not guaranteed to be uncorrelated or profitable in falling markets. Trend signals can lag reversals and repeatedly whipsaw; correlated sell-offs can hurt several assets at once, and cash can miss market rebounds.",
  },
  lazy: {
    title: "Lazy",
    rationale: "A David Swensen-inspired diversified allocation, drawing on the long-term principles in Unconventional Success: A Fundamental Approach. Fixed weights spread exposure across domestic and international stocks, real estate, nominal government bonds and inflation-protected bonds.",
    rules: "Allocate $30,000 at inception on October 26, 2026: VTI 30%, VNQ 20%, VEU 15%, VWO 5%, TIP 15% and IEI 15%. This is 50% equities, 20% real estate and 30% bonds. Rebalance the then-current portfolio back to these fixed weights every three months, including accumulated dividend cash. Unlike Momentum, allocation does not depend on a price-trend screen.",
    expectations: "Seeks long-term growth and more balanced exposure across economic environments. Diversification can reduce reliance on a single asset class, but does not ensure positive absolute returns or independence from markets. Stocks, property and bonds can decline together; interest-rate risk, inflation and currency exposure remain.",
  },
};

export function PortfolioIntroPreview({ strategy }: { strategy: keyof typeof INTROS }) {
  const intro = INTROS[strategy];
  return (
    <section className="space-y-6" data-testid={`intro-preview-${strategy}`}>
      <h2 className="text-xl font-bold">{intro.title} — Introduction</h2>
      <div className="max-w-4xl space-y-5 text-sm leading-6 text-foreground/85">
        <div><h3 className="font-semibold text-foreground mb-1">Strategy and investment rationale</h3><p>{intro.rationale}</p></div>
        <div><h3 className="font-semibold text-foreground mb-1">How the strategy works</h3><p>{intro.rules}</p></div>
        <div><h3 className="font-semibold text-foreground mb-1">Return expectations and risks</h3><p>{intro.expectations}</p></div>
        <p className="text-xs text-muted-foreground">Hypothetical portfolios for education only, not investment advice. Fractional shares are allowed. Taxes, fees and slippage are not modeled. Past or simulated performance does not guarantee future results.</p>
      </div>
      <PremiumFeatureNotice feature={`${intro.title} portfolio holdings, performance and transaction details`} />
    </section>
  );
}
