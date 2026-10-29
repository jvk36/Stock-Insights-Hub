import { Link } from "wouter";
import { LockKeyhole, TrendingUp } from "lucide-react";

export function StockWatchSignInNotice() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 min-h-14 py-2 flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-tight">Terminal</span>
          </div>
          <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:w-auto">
            {[
              ["/macro", "Macro Summary"],
              ["/13f", "Hedge Fund Blueprint"],
              ["/stock", "Stock Insights"],
              ["/model-portfolios", "Algo-Portfolios"],
              ["/indexes", "Stock Screens"],
            ].map(([href, title]) => (
              <Link key={href} href={href} className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap">{title}</Link>
            ))}
            <span aria-current="page" className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md whitespace-nowrap">Stock Watch</span>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Stock Watch</h1>
        <section className="max-w-2xl rounded-xl border border-border bg-card p-6 sm:p-8 space-y-4" data-testid="stock-watch-sign-in-notice">
          <LockKeyhole className="h-6 w-6 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Sign in to use Stock Watch</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Stock Watch is free, but you must be signed in to use it. Sign in or create an account to build and manage your personal watchlist.
          </p>
          <p className="text-sm text-muted-foreground">No Premium subscription is required.</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/sign-in" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" data-testid="stock-watch-sign-in">Sign in</Link>
            <Link href="/sign-up" className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted" data-testid="stock-watch-sign-up">Sign up</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
