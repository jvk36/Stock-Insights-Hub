import { createContext, useContext, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClerkAuthState,
  membershipForAuthState,
  type ClerkAuthState,
} from "./membership-state";
import type { Membership } from "./membership-types";

export type { Membership } from "./membership-types";

const MembershipContext = createContext<{
  membership?: Membership;
  loading: boolean;
  authState: ClerkAuthState;
  refresh: () => Promise<unknown>;
}>({ loading: true, authState: "unknown", refresh: async () => undefined });

type MembershipResponse = { url?: string; error?: string; message?: string };

async function readMembershipResponse(response: Response): Promise<MembershipResponse> {
  const raw = await response.text();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed as MembershipResponse : {};
  } catch {
    return {};
  }
}

function membershipError(response: Response, data: MembershipResponse): string {
  if (data.error) return data.error;
  if (data.message) return data.message;
  if (response.status === 401) return "Your session expired. Sign in and retry.";
  if (response.status === 403) return "This request is not allowed from the current page.";
  if (response.status === 409) return "This account cannot be changed right now. Refresh and retry.";
  if (response.status === 502 || response.status === 503) return "Billing is temporarily unavailable. Please retry shortly.";
  return `The request could not be completed (server returned ${response.status}).`;
}

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const authState = getClerkAuthState(isLoaded, isSignedIn, userId);
  const membershipQueryKey = ["membership", authState === "signed-in" ? userId : null] as const;
  const query = useQuery({
    queryKey: membershipQueryKey,
    enabled: authState === "signed-in",
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/membership/me", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      const data = await readMembershipResponse(response);
      if (!response.ok) throw new Error(membershipError(response, data));
      if (!("authenticated" in data)) throw new Error("The server returned an invalid membership response.");
      return data as Membership;
    },
  });
  useEffect(() => {
    if (authState === "signed-in") return;
    void queryClient.cancelQueries({ queryKey: ["membership"] }).then(() => {
      queryClient.removeQueries({ queryKey: ["membership"] });
    });
  }, [authState, queryClient]);

  const membership = membershipForAuthState(authState, query.data);
  return (
    <MembershipContext.Provider value={{
      membership,
      loading: authState === "unknown" || (authState === "signed-in" && query.isLoading),
      authState,
      refresh: query.refetch,
    }}>
      {children}
    </MembershipContext.Provider>
  );
}

export function useMembership() {
  return useContext(MembershipContext);
}

export async function postMembership(path: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`/api/membership/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readMembershipResponse(response);
  if (!response.ok) throw new Error(membershipError(response, data));
  return data;
}