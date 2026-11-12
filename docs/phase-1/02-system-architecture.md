# 02 — System Architecture & Request Lifecycle

## 1. Layer Topology

Rekker PeopleOS separates presentation, transport security, domain authorization, transactional persistence, AI orchestration, and Python ML execution cleanly:

```
[Browser SPA: artifacts/peopleos (React 19 + Clerk + TanStack Query)]
        │ customFetch (throws ApiError on any HTTP 4xx/5xx; X-Correlation-Id)
        ▼
[Express 5 Edge: artifacts/api-server/src/app.ts]
  1. applySecurityHeaders (nosniff, DENY framing, HSTS in prod, strict Referrer/Permissions)
  2. X-Correlation-Id middleware & pinoHttp request logger (PII-redacted)
  3. CLERK_PROXY_PATH middleware
  4. Strict Origin Allowlist Check (403 CORS_ORIGIN_DENIED if unknown Origin) -> cors()
  5. ClerkMiddleware (CLERK_SECRET_KEY) OR explicit non-production Demo Sandbox
  6. Sliding-window per-client IP/user rate limiters (/api/ai 40/min, /api 300/min)
        │
        ▼
[Access & Domain Authorization Layer]
  - middlewares/peopleosAccess.ts (fail-closed tenant resolution, Clerk vs Demo mutual exclusion)
  - lib/authorization.ts (MODULE_PERMISSION_MATRIX, canReadEmployeeProfile IDOR guard)
        │
        ├──▶ [Route Modules] peopleos, leave, payroll, documents, hrCases, workforceErp, audit, health, ai
        │          │
        │          ├──▶ [lib/security.ts] enc:v2 AES-256-GCM key ring + upload magic/MIME validation
        │          ├──▶ [lib/auditService.ts] atomic tx + AuditPersistenceError (fail-closed critical)
        │          ├──▶ [@workspace/db] Singleton PostgreSQL Pool + Drizzle ORM (ACID db.transaction)
        │          └──▶ [lib/mlBridge.ts] Python CLI / HTTP ML engine bridge
        ▼
[Global Sanitized Error Handler] -> { error, code, correlationId } (no stack traces in prod)
```

## 2. Startup & Graceful Shutdown (`artifacts/api-server/src/index.ts`)

1. Startup executes `validateRuntimeEnvironment(process.env, { throwOnFatal: true })` BEFORE opening the HTTP listener. Invalid production configs (`demo` auth in prod, missing Clerk keys, weak/missing `PEOPLEOS_ENCRYPTION_KEY`, wildcard CORS, missing `DATABASE_URL`) abort startup immediately.
2. Process signal handlers (`SIGTERM`, `SIGINT`, `uncaughtException`) close the Express HTTP server and drain `@workspace/db` via `closeDbPool()` cleanly.

## 3. Stale Domain Terminology Cleanup

Removed legacy `"Rekker Breweries Kenya Ltd"` fallback org naming, `"Brewmaster"` / `"Industrial Brewing Thermal Safety Kit"` fixture drift, and `rekker.co.ke` M-Pesa callback URLs across backend middleware, payment adapter, mock stores, and test fixtures.

