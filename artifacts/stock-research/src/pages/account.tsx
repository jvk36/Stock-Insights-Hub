import { ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { UserButton } from "@clerk/react";
import { useMembership } from "@/lib/membership";

export default function Account() {
  const { membership, loading } = useMembership();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading account…</div>;
  return (
    <div className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between"><Link href="/13f" className="text-sm font-medium text-primary">← Back to research</Link><UserButton /></div>
        <section className="mt-8 rounded-2xl border bg-card p-7 shadow-sm">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h1 className="mt-3 text-3xl font-bold">Your account</h1>
          <p className="mt-1 text-muted-foreground">{membership?.email}</p>
           <p className="mt-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">All research features are currently available to every visitor at no charge.</p>
          <div className="mt-6 grid gap-4 rounded-xl bg-muted/50 p-5 sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p><p className="mt-1 font-semibold capitalize">{membership?.role}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Research access</p><p className="mt-1 font-semibold">Included</p></div>
          </div>
          {membership?.role === "admin" ? (
            <Link href="/admin/members" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground">Manage members</Link>
          ) : <Link href="/stock" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground">Open Stock Insights</Link>}
        </section>
      </div>
    </div>
  );
}