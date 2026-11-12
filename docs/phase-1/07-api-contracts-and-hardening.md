# 07 — API Contracts, Validation, CORS & Error Handling

## 1. Strict Origin Allowlist CORS (`artifacts/api-server/src/app.ts`)

- Replaced wildcard-reflective `cors({ credentials: true, origin: true })` with explicit `parseAllowedOrigins` (`PEOPLEOS_ALLOWED_ORIGINS`) validation.
- In production (`NODE_ENV=production`), wildcard `*` and missing `PEOPLEOS_ALLOWED_ORIGINS` fail startup validation.
- Cross-origin requests from unapproved origins are rejected explicitly before route execution with `HTTP 403 CORS_ORIGIN_DENIED` without setting `Access-Control-Allow-Origin`.

## 2. Correlation IDs & Sanitized Error Envelope

- Every API request reads a validated `X-Correlation-Id` (`^[a-zA-Z0-9._-]{8,128}$`) or assigns a cryptographic UUID, echoes `X-Correlation-Id` in response headers, binds it into `pinoHttp`, and propagates it into critical audit event records (`[cid:...]`).
- Global error handler returns standardized JSON `{ error, code, correlationId }`, redacting internal error messages in production (`status >= 500` -> `"An internal server error occurred."`).

## 3. OpenAPI & Schema Reconciliation (`lib/api-spec/openapi.yaml`, `@workspace/api-zod`)

- Synchronized `OrganizationRole` across `openapi.yaml`, `lib/api-zod/src/generated/types/organizationRole.ts`, `lib/api-zod/src/generated/api.ts`, and `lib/api-client-react/src/generated/api.schemas.ts` to cover all 15 enterprise roles (`hr_director`, `hr_officer`, `finance_manager`, `production_supervisor`, `warehouse_supervisor`, `sales_manager`, etc.).
- Added API contract entries for `/readyz`, `/admin/diagnostics`, `/security/status`, `/employees/{employeeId}/profile-360`, `/hr-cases`, and `/workforce-erp/executive-summary` while preserving all existing frontend React Query `operationId` hooks.
