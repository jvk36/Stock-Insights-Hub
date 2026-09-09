import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, UserButton } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { CheckCircle2, MailCheck } from "lucide-react";
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
  const { membership, loading, authState } = useMembership();
  if (authState === "unknown" || loading) return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Checking membership…</div>;
  if (authState === "signed-out") return <Redirect to="/pricing" />;
  return membership?.premium ? children : <Redirect to="/pricing" />;
}

function SignedInRoute({ children }: { children: React.ReactNode }) {
  const { membership, loading, authState } = useMembership();
  if (authState === "unknown" || loading) return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Checking account…</div>;
  if (authState === "signed-out") return <Redirect to="/sign-in" />;
  return membership?.authenticated ? children : <Redirect to="/sign-in" />;
}

function AccountDock() {
  const { membership, authState } = useMembership();
  const signedIn = authState === "signed-in";
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-card/95 p-2 pl-3 shadow-lg backdrop-blur">
      {!signedIn && <a href={`${import.meta.env.BASE_URL}sign-in`} className="text-sm font-semibold text-primary">Sign in</a>}
      {signedIn && <>
        <a href={`${import.meta.env.BASE_URL}account`} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{membership?.role === "admin" ? "Admin" : membership?.premium ? "Premium" : membership ? "Free" : "Account"}</a>
        <UserButton />
      </>}
    </div>
  );
}

function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const Component = mode === "sign-in" ? SignIn : SignUp;
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className={`mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-8 ${mode === "sign-up" ? "lg:grid-cols-[0.9fr_1.1fr]" : ""}`}>
        {mode === "sign-up" && (
          <aside className="order-2 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8 lg:order-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MailCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">Verify your email to finish</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              After you create your account, we’ll email you a one-time verification code. Enter it in the clearly labeled code field to activate your account.
            </p>
            <ol className="mt-6 space-y-4 text-sm">
              {[
                "Check the inbox for the email address you entered.",
                "Copy the one-time code from the verification email.",
                "Enter the code in the verification field and select Continue.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span><strong>Step {index + 1}.</strong> {step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 rounded-lg border bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
              Didn’t receive it? Check spam, confirm the email address, then use Clerk’s resend-code link below the verification field.
            </p>
          </aside>
        )}
        <main className="order-1 flex justify-center lg:order-2">
          <Component
            routing="path"
            path={`${basePath}/${mode}`}
            signUpUrl={`${basePath}/sign-up`}
            signInUrl={`${basePath}/sign-in`}
            fallbackRedirectUrl={`${basePath}/account`}
            appearance={{
              elements: {
                cardBox: "w-[440px] max-w-full shadow-xl",
                headerTitle: "text-2xl font-bold",
                headerSubtitle: "text-sm text-muted-foreground",
                formFieldLabel: "text-sm font-semibold text-foreground",
                formFieldInput: "h-12 border-2 border-input bg-background text-base text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20",
                formButtonPrimary: "h-11 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90",
                footerActionLink: "font-semibold text-primary hover:text-primary/80",
                identityPreviewText: "text-foreground",
                formResendCodeLink: "font-semibold text-primary underline underline-offset-4",
                otpCodeFieldInput: "h-14 w-12 border-2 border-input bg-background text-xl font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
              },
            }}
          />
        </main>
      </div>
    </div>
  );
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
  const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} afterSignOutUrl={`${basePath}/pricing`} appearance={{ theme: shadcn, variables: { colorPrimary: "hsl(145 52% 30%)" } }}>
      <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><MembershipProvider><Routes /><AccountDock /></MembershipProvider></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>
    </ClerkProvider>
  );
}