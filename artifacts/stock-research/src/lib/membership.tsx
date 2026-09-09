import { createContext, useContext, useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Membership = {
  authenticated: boolean;
  premium: boolean;
  role: "free" | "paid" | "admin";
  email?: string;
  plan?: string | null;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
};

const MembershipContext = createContext<{
  membership?: Membership;
  loading: boolean;
  refresh: () => Promise<unknown>;
}>({ loading: true, refresh: async () => undefined });

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
  const wasSignedIn = useRef(false);
  const query = useQuery({
    queryKey: ["membership", userId],
    enabled: isLoaded && isSignedIn && !!userId,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch("/api/membership/me", { credentials: "include" });
      const data = await readMembershipResponse(response);
      if (!response.ok) throw new Error(membershipError(response, data));
      if (!("authenticated" in data)) throw new Error("The server returned an invalid membership response.");
      return data as Membership;
    },
  });
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      wasSignedIn.current = true;
      return;
    }
    queryClient.clear();
    if (wasSignedIn.current) {
      wasSignedIn.current = false;
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      window.location.replace(`${basePath}/13f`);
    }
  }, [isLoaded, isSignedIn, queryClient]);

  const signedOutMembership: Membership = {
    authenticated: false,
    premium: false,
    role: "free",
  };
  const membership = isSignedIn ? query.data : signedOutMembership;
  return (
    <MembershipContext.Provider value={{
      membership,
      loading: !isLoaded || (!!isSignedIn && query.isLoading),
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