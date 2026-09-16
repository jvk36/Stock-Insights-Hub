import { logger } from "./logger.ts";

type YahooSession = { cookie: string; expiresAt: number };
let cachedSession: YahooSession | null = null;

async function createSession(): Promise<YahooSession> {
  const response = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockResearch/1.0)" },
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Failed to obtain Yahoo Finance session cookie");
  return { cookie, expiresAt: Date.now() + 30 * 60_000 };
}

export async function getSession() {
  if (cachedSession && cachedSession.expiresAt > Date.now()) return cachedSession;
  logger.info("Refreshing Yahoo Finance session");
  cachedSession = await createSession();
  return cachedSession;
}

export async function yahooFetch(url: string, retries = 1): Promise<unknown> {
  const session = await getSession();
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; StockResearch/1.0)",
      Accept: "application/json",
      Cookie: session.cookie,
    },
  });
  if (response.status === 401 && retries > 0) {
    cachedSession = null;
    return yahooFetch(url, retries - 1);
  }
  if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
  return response.json();
}