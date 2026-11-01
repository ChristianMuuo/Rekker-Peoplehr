import app from "./app";
import { logger } from "./lib/logger";

// Vercel may provide PORT at runtime; use a conventional fallback when it does not.
const rawPort = process.env.PORT?.trim() || "3000";
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(
    `Invalid PORT value: "${rawPort}". Expected an integer between 1 and 65535.`,
  );
}

const server = app.listen(port);

server.once("listening", () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err: Error) => {
  logger.error({ err, port }, "Error listening on port");
  process.exit(1);
});
