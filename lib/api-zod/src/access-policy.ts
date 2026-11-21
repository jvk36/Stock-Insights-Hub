/** Shared by the UI and API. Do not simulate free access by changing a user's
 * paid membership: billing status, admin roles and ad eligibility stay real.
 *
 * Re-enable selected paywalls by setting paywallsEnabled=true and editing
 * premiumFeatures. Entries match a feature and its dot-separated descendants.
 */
export interface AccessPolicy {
  paywallsEnabled: boolean;
  premiumFeatures: readonly string[];
}
export const accessPolicy: AccessPolicy = {
  paywallsEnabled: false,
  premiumFeatures: [
    "lab.valuation.intrinsic-valuation", "lab.valuation.indicators",
    "lab.valuation.ratings", "lab.valuation.board-leadership",
    "lab.valuation.buybacks", "lab.valuation.insider-activity",
    "lab.valuation.analysis", "lab.valuation.models",
    "lab.performance", "lab.risk", "lab.portfolio",
    "screens.sp500.advanced", "screens.nasdaq100.advanced",
    "screens.sp400.advanced", "screens.sp600.advanced",
    "screens.djia.advanced", "screens.adrs.advanced",
    "portfolios.cloning", "portfolios.magic-formula",
    "portfolios.blind-trust", "portfolios.momentum", "portfolios.lazy",
  ],
};
export function isPremiumFeature(feature: string, policy: AccessPolicy = accessPolicy): boolean {
  return policy.paywallsEnabled && policy.premiumFeatures.some(p => feature === p || feature.startsWith(`${p}.`));
}
export function canAccessFeature(feature: string, paid: boolean, policy: AccessPolicy = accessPolicy): boolean {
  return !isPremiumFeature(feature, policy) || paid;
}

/** Public features may share source data with paid ones. Only gate a shared
 * resource when ALL of its consuming features are Premium.
 * This function must never be used for watchlists, accounts, billing or admin.
 */
export function apiRequiresPremium(rawPath: string, policy: AccessPolicy = accessPolicy): boolean {
  if (!policy.paywallsEnabled) return false;
  let path: string;
  try { path = decodeURIComponent(rawPath.split("?")[0]!).toLowerCase().replace(/^\/api(?=\/)/, ""); }
  catch { return true; }
  const stock = /^\/stock\/[^/]+\/([^/]+)\/?$/.exec(path);
  let consumers: string[] | undefined;
  if (stock) {
    const section = stock[1]!;
    const free = ["quote", "chart", "earnings-history", "financials", "news", "profile", "sec-filings"];
    if (free.includes(section)) return false;
    const aliases: Record<string, string> = {
      "screener-ratings": "ratings", "buyback-history": "buybacks",
      "insider-transactions": "insider-activity",
    };
    if (!["fundamentals", "intrinsic-valuation", "indicators", "screener-ratings",
      "board-leadership", "buyback-history", "insider-transactions", "analysis", "models"].includes(section)) return true;
    consumers = section === "fundamentals"
      ? ["lab.valuation.models", "lab.valuation.indicators", "lab.valuation.analysis"]
      : [`lab.valuation.${aliases[section] ?? section}`];
  } else if (/^\/performance\/[^/]+\/?$/.test(path)) {
    consumers = ["lab.performance", "lab.risk", "lab.portfolio"];
  } else {
    const model = /^\/model-portfolios\/([^/]+)(?:\/backtest)?\/?$/.exec(path);
    const screen = /^\/indexes\/([^/]+)\/metrics\/?$/.exec(path);
    if (model && ["cloning", "magic-formula", "blind-trust", "momentum", "lazy"].includes(model[1]!)) consumers = [`portfolios.${model[1]}`];
    if (screen && ["sp500", "nasdaq100", "sp400", "sp600", "djia", "adrs"].includes(screen[1]!)) consumers = [`screens.${screen[1]}.advanced`];
  }
  // Preserve the legacy deny-by-default behavior for unknown protected routes.
  return consumers ? consumers.every(f => isPremiumFeature(f, policy)) : true;
}
