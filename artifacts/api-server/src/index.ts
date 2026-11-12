import { closeDbPool } from "@workspace/db";
import app from "./app";
import { getSafeEnvironmentSummary, validateRuntimeEnvironment } from "./config/env";
import { logger } from "./lib/logger";

const config = validateRuntimeEnvironment(process.env, {
  throwOnFatal: process.env.NODE_ENV === "production",
});

for (const warning of config.warnings) {
  logger.warn({ warning }, "Runtime configuration warning");
}

logger.info(
  { config: getSafeEnvironmentSummary(config) },
  "PeopleOS runtime configuration initialized",
);

const server = app.listen(config.port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: config.port, authMode: config.authMode }, "Server listening");
});

let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Initiating graceful server shutdown");

  const forceTimer = setTimeout(() => {
    logger.error("Forced shutdown after graceful timeout");
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  server.close(async (closeErr) => {
    if (closeErr) {
      logger.error({ err: closeErr }, "HTTP server close error");
    }
    try {
      await closeDbPool();
      logger.info("PostgreSQL connection pool closed");
      process.exit(closeErr ? 1 : 0);
    } catch (poolErr) {
      logger.error({ err: poolErr }, "Error closing PostgreSQL pool");
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled Promise Rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught Exception; shutting down safely");
  void gracefulShutdown("uncaughtException");
});
