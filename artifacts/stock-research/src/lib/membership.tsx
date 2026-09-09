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
      if (!response.ok) throw new Error("Unable to load membership");
      return response.json() as Promise<Membership>;
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
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as { url?: string };
}