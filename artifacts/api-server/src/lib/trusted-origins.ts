function normalizedOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function getTrustedOrigins() {
  const origins = new Set<string>();
  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim();
  if (publicAppUrl) {
    const origin = normalizedOrigin(publicAppUrl);
    if (origin) origins.add(origin);
  }
  for (const domain of process.env.REPLIT_DOMAINS?.split(",") ?? []) {
    const trimmed = domain.trim();
    if (trimmed) origins.add(`https://${trimmed}`);
  }
  if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT?.trim();
    if (port) {
      origins.add(`http://localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
    }
  }
  return origins;
}

export function isTrustedOrigin(origin: string | undefined) {
  return !!origin && getTrustedOrigins().has(normalizedOrigin(origin) ?? "");
}