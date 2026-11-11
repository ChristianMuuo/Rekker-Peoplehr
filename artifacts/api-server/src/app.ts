import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { applySecurityHeaders, createRateLimiter } from "./lib/security";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { isDemoAuthPermitted } from "./middlewares/peopleosAccess";

const app: Express = express();

app.disable("x-powered-by");
app.use(applySecurityHeaders);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (process.env.CLERK_SECRET_KEY) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  app.use((req, _res, next) => {
    if (isDemoAuthPermitted()) {
      (req as any).auth = {
        userId:
          (req.headers["x-peopleos-user-id"] as string) || "user_demo_admin_01",
      };
    } else {
      (req as any).auth = { userId: null };
    }
    next();
  });
}

// Rate limits: tighter budget on AI agent invocations & statutory/payroll writes
app.use(
  "/api/ai",
  createRateLimiter({
    windowMs: 60_000,
    maxRequests: 40,
    keyPrefix: "ai",
  }),
);
app.use(
  "/api",
  createRateLimiter({
    windowMs: 60_000,
    maxRequests: 300,
    keyPrefix: "api",
  }),
);

app.use("/api", router);

// Global sanitized error handler (never leaks stack traces in production)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled Express route error");
  if (res.headersSent) return;
  const status =
    typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 500;
  const message =
    process.env.NODE_ENV === "production" && status >= 500
      ? "An internal server error occurred."
      : err instanceof Error
        ? err.message
        : "Unexpected error.";
  res.status(status).json({ error: message });
});

export default app;
