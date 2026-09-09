import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

type Member = { clerkUserId: string; email: string; role: string; plan?: string; subscriptionStatus?: string; currentPeriodEnd?: string; createdAt: string };
export default function AdminMembers() {
  const query = useQuery({
    queryKey: ["admin-members"],
    queryFn: async () => {
      const r = await fetch("/api/membership/admin/users", { credentials: "include" });
      if (!r.ok) throw new Error(r.status === 403 ? "Administrator access required" : "Could not load members");
      return r.json() as Promise<{ users: Member[] }>;
    },
  });
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <main className="mx-auto max-w-6xl">
        <Link href="/account" className="text-sm font-medium text-primary">← Account</Link>
        <h1 className="mt-5 text-3xl font-bold">Members</h1>
        <p className="mt-1 text-muted-foreground">Identity, role, and current Stripe entitlement.</p>
        {query.isLoading && <p className="mt-8 text-muted-foreground">Loading members…</p>}
        {query.error && <p className="mt-8 text-destructive">{query.error.message}</p>}
        {query.data && <div className="mt-7 overflow-x-auto rounded-xl border bg-card"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40"><tr>{["Email","Role","Plan","Status","Paid through","Joined"].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{query.data.users.map(u => <tr key={u.clerkUserId} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{u.email}</td><td className="px-4 py-3 capitalize">{u.role}</td><td className="px-4 py-3 capitalize">{u.plan ?? "—"}</td><td className="px-4 py-3 capitalize">{u.subscriptionStatus ?? "—"}</td><td className="px-4 py-3">{u.currentPeriodEnd ? new Date(u.currentPeriodEnd).toLocaleDateString() : "—"}</td><td className="px-4 py-3">{new Date(u.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
      </main>
    </div>
  );
}