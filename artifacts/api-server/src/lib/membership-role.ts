export function membershipRole(
  email: string,
  adminEmail: string | undefined,
): "admin" | "free" {
  return adminEmail?.trim().toLowerCase() === email.trim().toLowerCase()
    ? "admin"
    : "free";
}

export function isAdministrator(role: string): boolean {
  return role === "admin";
}

export function canDeleteMember(
  administratorClerkUserId: string,
  targetClerkUserId: string,
): boolean {
  return administratorClerkUserId !== targetClerkUserId;
}