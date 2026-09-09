import { createContext, useContext } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";

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
  const { isLoaded, isSignedIn } = useAuth();
  const query = useQuery({
    queryKey: ["membership", isSignedIn],
    enabled: isLoaded,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      if (!isSignedIn) return { authenticated: false, premium: false, role: "free" } as Membership;
      const response = await fetch("/api/membership/me", { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load membership");
      return response.json() as Promise<Membership>;
    },
  });
  return (
    <MembershipContext.Provider value={{
      membership: query.data,
      loading: !isLoaded || query.isLoading,
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