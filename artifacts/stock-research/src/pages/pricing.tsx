import { Check, Crown, LockKeyhole, TrendingUp } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useState } from "react";
import { postMembership, useMembership } from "@/lib/membership";

const features = ["Stock screens across major indexes", "Complete company research and filings", "Valuation models and analyst insights", "Board, buyback, and insider intelligence"];

export default function Pricing() {
  const { isSignedIn } = useAuth();
  const { membership } = useMembership();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function checkout(plan: "monthly" | "annual") {
    if (!isSignedIn) return setLocation("/sign-up");
    setBusy(plan); setError("");
    try {
      const result = await postMembership("checkout", { plan, basePath, attemptId: crypto.randomUUID() });
      if (!result.url) throw new Error("Checkout did not return a payment link. Please retry.");
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout could not be started");
      setBusy(undefined);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/13f" className="flex items-center gap-2 font-bold"><TrendingUp className="h-5 w-5 text-primary" /> Terminal</Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/13f" className="text-muted-foreground hover:text-foreground">Free insights</Link>
            {!isSignedIn && <Link href="/sign-in" className="rounded-md border px-3 py-2 font-medium">Sign in</Link>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><Crown className="h-6 w-6 text-primary" /></div>
          <p className="text-sm font-semibold uppercase tracking-[.2em] text-primary">Premium research</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Make better-informed decisions</h1>
          <p className="mt-4 text-lg text-muted-foreground">Unlock the complete stock research terminal. New accounts remain Free until payment succeeds. Cancel anytime.</p>
        </div>
        {membership?.premium ? (
          <div className="mx-auto mt-10 max-w-lg rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
            <Check className="mx-auto h-7 w-7 text-primary" />
            <h2 className="mt-2 font-semibold">Premium is active</h2>
            <Link href="/stock" className="mt-4 inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground">Open Stock Insights</Link>
          </div>
        ) : (
          <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
            {[
              { id: "monthly" as const, name: "Monthly", price: "$15", suffix: "/ month", note: "Flexible month-to-month access" },
              { id: "annual" as const, name: "Annual", price: "$150", suffix: "/ year", note: "Save $30 each year", featured: true },
            ].map((plan) => (
              <section key={plan.id} className={`relative rounded-2xl border bg-card p-7 shadow-sm ${plan.featured ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                {plan.featured && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Best value</span>}
                <h2 className="text-xl font-bold">{plan.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{plan.note}</p>
                <div className="mt-6"><span className="text-4xl font-bold">{plan.price}</span><span className="text-muted-foreground">{plan.suffix}</span></div>
                <ul className="mt-6 space-y-3 text-sm">{features.map((f) => <li key={f} className="flex gap-2"><Check className="h-5 w-5 shrink-0 text-primary" />{f}</li>)}</ul>
                <button onClick={() => checkout(plan.id)} disabled={!!busy} className="mt-7 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  <LockKeyhole className="h-4 w-4" />{busy === plan.id ? "Opening checkout…" : isSignedIn ? `Choose ${plan.name}` : "Create account to continue"}
                </button>
              </section>
            ))}
          </div>
        )}
        {error && <p className="mt-5 text-center text-sm text-destructive">{error}</p>}
      </main>
    </div>
  );
}