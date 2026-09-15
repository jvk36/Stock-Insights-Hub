import type { Membership } from "./membership-types";

export type ClerkAuthState = "unknown" | "signed-in" | "signed-out";

export function getClerkAuthState(
  isLoaded: boolean,
  isSignedIn: boolean | undefined,
  userId: string | null | undefined,
): ClerkAuthState {
  if (!isLoaded) return "unknown";
  return isSignedIn === true && !!userId ? "signed-in" : "signed-out";
}

export const signedOutMembership: Membership = {
  authenticated: false,
  premium: false,
  role: "free",
};

export function membershipForAuthState(
  authState: ClerkAuthState,
  membership: Membership | undefined,
): Membership | undefined {
  return authState === "signed-in" ? membership : signedOutMembership;
}