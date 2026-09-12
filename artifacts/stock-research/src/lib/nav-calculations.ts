export interface NavParams {
  propertyValue: number;
  otherAssets: number;
  totalLiabilities: number;
  sharesOutstanding: number;
  currentPrice: number | null;
}

export interface NavResult {
  grossAssetValue: number;
  netAssetValue: number;
  navPerShare: number;
  priceDifference: number | null;
  premiumDiscountPct: number | null;
}

export function calculateNav(params: NavParams): NavResult | null {
  const values = [
    params.propertyValue,
    params.otherAssets,
    params.totalLiabilities,
    params.sharesOutstanding,
  ];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    params.sharesOutstanding <= 0
  ) {
    return null;
  }

  const grossAssetValue = params.propertyValue + params.otherAssets;
  const netAssetValue = grossAssetValue - params.totalLiabilities;
  const navPerShare = netAssetValue / params.sharesOutstanding;
  const validPrice =
    params.currentPrice != null &&
    Number.isFinite(params.currentPrice) &&
    params.currentPrice > 0;

  return {
    grossAssetValue,
    netAssetValue,
    navPerShare,
    priceDifference: validPrice ? params.currentPrice! - navPerShare : null,
    premiumDiscountPct:
      validPrice && navPerShare > 0
        ? ((params.currentPrice! - navPerShare) / navPerShare) * 100
        : null,
  };
}