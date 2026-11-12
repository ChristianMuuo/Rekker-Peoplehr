# 10 — System Diagnostics, Observability & Alerting Foundations

## 1. Probe Endpoints (`artifacts/api-server/src/routes/health.ts`)

- **`GET /api/healthz`**: Fast unauthenticated process liveness check (`{ status: "ok" }`, zero secrets).
- **`GET /api/readyz`**: Dependency readiness returning `200 ready` or `503 degraded` checking runtime config validity (`validateRuntimeEnvironment`), live PostgreSQL `SELECT 1` (`checkDbHealth`), encryption key readiness, and optional ML/OpenAI/Daraja state — strictly zero secret material.
- **`GET /api/admin/diagnostics`**: Role-gated (`MODULE_PERMISSION_MATRIX.adminDiagnostics.readRoles`: `hr_admin`, `system_admin`, `auditor`) comprehensive diagnostics + Integration Registry + active config warnings/errors.

## 2. Structured Logging & Telemetry

- `logger.ts`: Pino structured JSON logger with automatic redaction on auth headers, cookies, session/demo headers, PII keys, and environment secret names.
- `pino-http` binds every HTTP log entry to `req.correlationId`.
- Security telemetry logs structured warning event `SECURITY_DECRYPT_FAILURE` on enc:v1/enc:v2 envelope corruption or key mismatch, and `AUDIT_PERSISTENCE_FAILED` on critical audit sink failures.

