export type Membership = {
  authenticated: boolean;
  premium: boolean;
  role: "free" | "paid" | "admin";
  email?: string;
  plan?: string | null;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
};