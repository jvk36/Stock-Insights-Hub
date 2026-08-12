import app from "./app";
import { logger } from "./lib/logger";
import { warmMacroCache } from "./routes/macro";
import { warmIndexMetricsCache } from "./routes/indexes";
import { initEdgarFetcher } from "./lib/edgar-fetcher";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Pre-warm macro indicators cache in background so first user request is fast
  warmMacroCache().catch(() => { /* non-fatal */ });

  // Pre-warm stock screener metrics for all indexes so filters are ready on first visit
  warmIndexMetricsCache();

  // Initialize 13F EDGAR fetcher: seeds Berkshire data and starts refresh scheduler
  initEdgarFetcher().catch((e) => logger.error({ err: e }, "EDGAR fetcher init failed"));
});
