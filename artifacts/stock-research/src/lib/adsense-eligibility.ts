import type { ClerkAuthState } from "./membership-state";
import type { Membership } from "./membership-types";

/** Unknown membership and billing failures must never opt a subscriber into ads. */
export function canShowAds(
  authState: ClerkAuthState,
  loading: boolean,
  membership?: Membership,
): boolean {
  if (loading || authState === "unknown") return false;
  if (authState === "signed-out") return true;
  return membership?.authenticated === true
    && membership.premium === false
    && membership.role === "free"
    && !membership.billingUnavailable;
}

/** AdSense belongs on content pages, not authentication or account-management screens. */
export function isAdContentPage(path: string): boolean {
  return /^\/(13f|macro|stock|indexes|watchlist|model-portfolios)(\/|$)/.test(path);
}
