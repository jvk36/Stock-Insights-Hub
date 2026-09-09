import { CreditCard, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { UserButton } from "@clerk/react";
import { postMembership, useMembership } from "@/lib/membership";

export default function Account() {
  const { membership, loading } = useMembership();
  const [busy, setBusy] = useState(false);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading account…</div>;
  return (
    <div className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between"><Link href="/13f" className="text-sm font-medium text-primary">← Back to research</Link><UserButton /></div>
        <section className="mt-8 rounded-2xl border bg-card p-7 shadow-sm">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h1 className="mt-3 text-3xl font-bold">Your account</h1>
          <p className="mt-1 text-muted-foreground">{membership?.email}</p>
          <div className="mt-6 grid gap-4 rounded-xl bg-muted/50 p-5 sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Access</p><p className="mt-1 font-semibold capitalize">{membership?.role}{membership?.premium ? " · Premium" : ""}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p><p className="mt-1 font-semibold capitalize">{membership?.plan ?? (membership?.role === "admin" ? "Owner access" : "Free")}</p></div>
            {membership?.currentPeriodEnd && <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Paid through</p><p className="mt-1 font-semibold">{new Date(membership.currentPeriodEnd).toLocaleDateString()}</p></div>}
            {membership?.subscriptionStatus && <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1 font-semibold capitalize">{membership.subscriptionStatus}</p></div>}
          </div>
          {membership?.role === "admin" ? (
            <Link href="/admin/members" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground">Manage members</Link>
          ) : membership?.premium ? (
            <button disabled={busy} onClick={async () => { setBusy(true); try { const r = await postMembership("portal", { basePath }); if (r.url) window.location.assign(r.url); } finally { setBusy(false); } }} className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground"><CreditCard className="h-4 w-4" />{busy ? "Opening…" : "Manage billing"}</button>
          ) : <Link href="/pricing" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground">Upgrade to Premium</Link>}
        </section>
      </div>
    </div>
  );
}