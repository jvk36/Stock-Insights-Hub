import { parseFigiResolution, type FigiResolution } from "./cusip-resolution-policy";

type Dependencies = {
  fetcher?: typeof fetch; wait?: (ms: number) => Promise<void>;
  now?: () => number; intervalMs?: number;
};
/** Anonymous API: max 10 jobs/request. Serialize requests at <25/minute,
 * deduplicate overlapping imports, and respect Retry-After across all callers.
 */
export function createOpenFigiMapper(deps: Dependencies = {}) {
  const fetcher = deps.fetcher ?? fetch;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? 3100;
  let nextAt = 0;
  let queue: Promise<void> = Promise.resolve();
  const pending = new Map<string, Promise<FigiResolution>>();
  const recent = new Map<string, { until: number; resolution: FigiResolution }>();
  const temporary = (reason: string): FigiResolution => ({ status: "temporary", ticker: null, reason });

  function request(cusips: string[]): Promise<FigiResolution[]> {
    const work = queue.then(async () => {
      const delay = nextAt - now();
      if (delay > 0) await wait(delay);
      nextAt = now() + interval;
      try {
        const response = await fetcher("https://api.openfigi.com/v3/mapping", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cusips.map(cusip => ({
            idType: "ID_CUSIP", idValue: cusip, exchCode: "US",
            marketSecDes: "Equity", includeUnlistedEquities: true,
          }))),
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          if (response.status === 429) {
            const retry = response.headers.get("retry-after");
            const seconds = Number(retry);
            const retryAt = retry && !Number.isFinite(seconds) ? Date.parse(retry) : now() + (seconds > 0 ? seconds : 60) * 1000;
            nextAt = Math.max(nextAt, Number.isFinite(retryAt) ? retryAt : now() + 60_000);
          }
          return cusips.map(() => temporary(`OpenFIGI HTTP ${response.status}; retry later.`));
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data) || data.length !== cusips.length) {
          return cusips.map(() => temporary("OpenFIGI response does not match the requested batch."));
        }
        return data.map(parseFigiResolution);
      } catch {
        return cusips.map(() => temporary("OpenFIGI request failed or timed out; retry later."));
      }
    });
    queue = work.then(() => undefined, () => undefined);
    return work;
  }

  return async function mapCusips(raw: string[]): Promise<Map<string, FigiResolution>> {
    const cusips = [...new Set(raw.map(c => c.trim().toUpperCase()).filter(c => /^[A-Z0-9]{9}$/.test(c)))];
    const fresh = cusips.filter(c => !pending.has(c) && (recent.get(c)?.until ?? 0) <= now());
    for (let i = 0; i < fresh.length; i += 10) {
      const batch = fresh.slice(i, i + 10);
      const work = request(batch);
      batch.forEach((cusip, index) => {
        pending.set(cusip, work.then(results => {
          const result = results[index]!;
          // Keep completed results briefly too: a large caller may not have
          // committed its entire batch to PostgreSQL when another fund asks.
          recent.set(cusip, { until: now() + (result.status === "temporary" ? 120_000 : 300_000), resolution: result });
          return result;
        }).finally(() => pending.delete(cusip)));
      });
    }
    // Capture promises before they settle and leave the pending map.
    const entries = cusips.map(async c => [c, await (pending.get(c) ?? Promise.resolve(recent.get(c)!.resolution))] as const);
    if (recent.size > 20_000) for (const [c, f] of recent) if (f.until <= now()) recent.delete(c);
    return new Map(await Promise.all(entries));
  };
}

export const mapCusipsWithOpenFigi = createOpenFigiMapper();
