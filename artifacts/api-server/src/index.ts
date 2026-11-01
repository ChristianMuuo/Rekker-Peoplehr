import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}". Expected an integer between 1 and 65535.`);
}

const server = app.listen(port);

server.once("listening", () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err: Error) => {
  logger.error({ err, port }, "Error listening on port");
  process.exit(1);
});
