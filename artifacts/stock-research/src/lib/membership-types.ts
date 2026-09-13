export type Membership = {
  authenticated: boolean;
  role: "free" | "admin";
  email?: string;
};