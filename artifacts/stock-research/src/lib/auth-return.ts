const RETURN_KEY = "stock-research:auth-return";

/** Accept only app-local destinations, never external URLs or another auth page. */
export function safeAuthReturn(value: string | null, basePath = ""): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://app.invalid");
    if (url.origin !== "https://app.invalid") return null;
    if (basePath && !url.pathname.startsWith(`${basePath}/`) && url.pathname !== basePath) return null;
    const path = url.pathname.slice(basePath.length);
    if (/^\/sign-(in|up)(\/|$)/.test(path)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function rememberAuthReturn(path: string, basePath: string) {
  const safe = safeAuthReturn(path, basePath);
  if (safe) {
    try { sessionStorage.setItem(RETURN_KEY, safe); } catch { /* Explicit return URLs still work if storage is disabled. */ }
  }
}

export function getAuthReturn(search: string, basePath: string): string {
  const explicit = safeAuthReturn(new URLSearchParams(search).get("redirect_url"), basePath);
  if (explicit) return explicit;
  try {
    const saved = safeAuthReturn(sessionStorage.getItem(RETURN_KEY), basePath);
    if (saved) return saved;
  } catch { /* A direct sign-in without storage uses the public landing tab. */ }
  return `${basePath}/13f`;
}
