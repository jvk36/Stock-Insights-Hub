import { Link } from "wouter";
import { LockKeyhole } from "lucide-react";

export function PremiumFeatureNotice({ feature }: { feature: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-6 space-y-3" data-testid="premium-feature-notice">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <LockKeyhole className="h-4 w-4 text-primary" />{feature} is a Premium feature
      </h3>
      <p className="text-sm text-muted-foreground">Become a Premium subscriber to unlock this feature. Already subscribed? Sign in to access it.</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/pricing" className="font-semibold text-primary underline underline-offset-2">Explore Premium</Link>
        <Link href="/sign-in" className="text-muted-foreground underline underline-offset-2">Sign in</Link>
      </div>
    </div>
  );
}
