import crypto from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { validateRuntimeEnvironment } from "./config/env";
import { logger } from "./lib/logger";
import { applySecurityHeaders, createRateLimiter } from "./lib/security";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { isDemoAuthPermitted } from "./middlewares/peopleosAccess";

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

const CORRELATION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function resolveAllowedOrigin(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!origin) return true;
  const runtime = validateRuntimeEnvironment(env, { throwOnFatal: false });
  return runtime.allowedOrigins.includes(origin);
}

const app: Express = express();

const runtimeConfig = validateRuntimeEnvironment(process.env, { throwOnFatal: false });

app.disable("x-powered-by");
app.set("trust proxy", runtimeConfig.trustProxy);
app.use(applySecurityHeaders);

// Validate/assign correlation ID across every request & response
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers["x-correlation-id"] ?? req.headers["x-request-id"];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const cid =
    typeof candidate === "string" && CORRELATION_ID_RE.test(candidate.trim())
      ? candidate.trim()
      : crypto.randomUUID();
  req.correlationId = cid;
  res.setHeader("X-Correlation-Id", cid);
  next();
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as Request).correlationId ?? crypto.randomUUID(),
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

// Top-level liveness probe for cloud load balancers, container orchestrators & deployment platforms
app.get(["/health", "/healthz"], (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Reject unapproved cross-origin requests explicitly; never reflect arbitrary origins with credentials
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && !resolveAllowedOrigin(origin, process.env)) {
    res.status(403).json({
      error: "Cross-origin request rejected by PeopleOS CORS allowlist.",
      code: "CORS_ORIGIN_DENIED",
      correlationId: req.correlationId,
    });
    return;
  }
  next();
});

app.use(
  cors({
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Correlation-Id",
      "X-Request-Id",
      "X-PeopleOS-Org-Id",
      "X-PeopleOS-User-Id",
      "X-PeopleOS-Role",
      "X-PeopleOS-Auth",
    ],
    origin(origin, callback) {
      callback(null, resolveAllowedOrigin(origin, process.env));
    },
  }),
);

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
      (req as { auth?: { userId: string | null } }).auth = {
        userId:
          req.headers["x-peopleos-auth"] === "signed-out"
            ? null
            : ((req.headers["x-peopleos-user-id"] as string) || "user_demo_admin_01"),
      };
    } else {
      (req as { auth?: { userId: string | null } }).auth = { userId: null };
    }
    next();
  });
}

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

// Global standardized & sanitized error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, correlationId: req.correlationId }, "Unhandled Express route error");
  if (res.headersSent) return;
  const status =
    typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 500;
  const code =
    typeof (err as { code?: string })?.code === "string"
      ? (err as { code: string }).code
      : status >= 500
        ? "INTERNAL_SERVER_ERROR"
        : "REQUEST_ERROR";
  const message =
    process.env.NODE_ENV === "production" && status >= 500
      ? "An internal server error occurred."
      : err instanceof Error
        ? err.message
        : "Unexpected error.";
  res.status(status).json({
    error: message,
    code,
    correlationId: req.correlationId,
  });
});

export default app;
