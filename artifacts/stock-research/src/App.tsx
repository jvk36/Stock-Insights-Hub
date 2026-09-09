import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, UserButton } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import StockDetail from "@/pages/stock";
import MacroSummary from "@/pages/macro";
import StockIndexes from "@/pages/indexes";
import ThirteenFInsights from "@/pages/thirteen-f";
import Pricing from "@/pages/pricing";
import Account from "@/pages/account";
import AdminMembers from "@/pages/admin-members";
import { MembershipProvider, useMembership } from "@/lib/membership";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000, retry: 1 } } });

function PremiumRoute({ children }: { children: React.ReactNode }) {
  const { membership, loading } = useMembership();
  if (loading) return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Checking membership…</div>;
  return membership?.premium ? children : <Redirect to="/pricing" />;
}

function SignedInRoute({ children }: { children: React.ReactNode }) {
  const { membership, loading } = useMembership();
  if (loading) return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Checking account…</div>;
  return membership?.authenticated ? children : <Redirect to="/sign-in" />;
}

function AccountDock() {
  const { membership } = useMembership();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-card/95 p-2 pl-3 shadow-lg backdrop-blur">
      <Show when="signed-out"><a href={`${import.meta.env.BASE_URL}sign-in`} className="text-sm font-semibold text-primary">Sign in</a></Show>
      <Show when="signed-in">
        <a href={`${import.meta.env.BASE_URL}account`} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{membership?.role === "admin" ? "Admin" : membership?.premium ? "Premium" : "Free"}</a>
        <UserButton />
      </Show>
    </div>
  );
}

function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const Component = mode === "sign-in" ? SignIn : SignUp;
  return <div className="min-h-screen grid place-items-center bg-background px-4"><Component routing="path" path={`${basePath}/${mode}`} signUpUrl={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/account`} /></div>;
}

function Routes() {
  return <Switch>
    <Route path="/"><Redirect to="/13f" /></Route>
    <Route path="/13f" component={ThirteenFInsights} />
    <Route path="/13f/:slug" component={ThirteenFInsights} />
    <Route path="/macro" component={MacroSummary} />
    <Route path="/pricing" component={Pricing} />
    <Route path="/sign-in/*?">{() => <AuthPage mode="sign-in" />}</Route>
    <Route path="/sign-up/*?">{() => <AuthPage mode="sign-up" />}</Route>
    <Route path="/account">{() => <SignedInRoute><Account /></SignedInRoute>}</Route>
    <Route path="/admin/members">{() => <PremiumRoute><AdminMembers /></PremiumRoute>}</Route>
    <Route path="/indexes">{() => <PremiumRoute><StockIndexes /></PremiumRoute>}</Route>
    <Route path="/stock">{() => <PremiumRoute><StockDetail /></PremiumRoute>}</Route>
    <Route path="/stock/:symbol">{() => <PremiumRoute><StockDetail /></PremiumRoute>}</Route>
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || (import.meta.env.PROD ? "/api/__clerk" : undefined);
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={{ theme: shadcn, variables: { colorPrimary: "hsl(145 52% 30%)" } }}>
      <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><MembershipProvider><Routes /><AccountDock /></MembershipProvider></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>
    </ClerkProvider>
  );
}