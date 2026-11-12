# 06 — Database Architecture, Migrations & Transaction Safety

## 1. Connection Pool Standardization (`lib/db/src/index.ts`)

- Replaced per-access Proxy pool creation with a lazily initialized singleton `_pool` and `_db` cached at module scope (`max` bounded by `PG_POOL_MAX ?? 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`).
- Added `checkDbHealth(timeoutMs)` running `SELECT 1` with timeout protection for `/api/readyz` & `/api/admin/diagnostics`, plus `closeDbPool()` invoked during graceful `SIGTERM`/`SIGINT` server shutdown.

## 2. Reconciled SQL Migrations & Schema Integrity

- **Fixed Migration Defect (`lib/db/migrations/0002_peopleos_enterprise_upgrades.sql`)**: Corrected foreign-key targets from nonexistent `"organizations"` / `"employees"` to `"peopleos_organizations"` / `"peopleos_employees"`.
- **Additive Phase 1 Migration (`lib/db/migrations/0003_phase1_enterprise_foundation.sql` & `lib/db/src/schema/peopleos.ts`)**:
  - Added `created_by_user_id text` and index on `peopleos_payroll_runs` so Maker-Checker creator accountability persists across server restarts in PostgreSQL.
  - Added `mime_type`, `checksum_sha256`, and `uploaded_by_user_id` on `peopleos_documents` with upload lookup index.
  - Added partial/composite query indexes (`peopleos_audit_org_created_idx`, `peopleos_payroll_runs_org_period_idx`, `peopleos_leave_req_org_status_idx`).

> **Environment Execution Note:** During Phase 1 verification on this Windows workstation, Linux Docker Engine is unavailable (`docker info` unreachable) and `DATABASE_URL` is unset in the sandbox runtime. Migrations `0002` and `0003` were verified statically against `lib/db/src/schema/peopleos.ts`; live `psql` / Drizzle migration execution against PostgreSQL remains to be run when provisioning the target database instance.

## 3. Atomic Transactions & Fail-Closed Critical Audit Logging

- Enhanced `recordAuditEvent()` in `artifacts/api-server/src/lib/auditService.ts` to accept transactional handle `tx`, `correlationId`, and `critical?: boolean` (`AuditPersistenceError`, HTTP `503 AUDIT_PERSISTENCE_UNAVAILABLE`).
- Wrapped high-risk DB mutations inside `db.transaction(async (tx) => ...)` atomically alongside `critical: true` audit inserts:
  - `POST /api/employees`, `PATCH /api/employees/:employeeId`, `POST /api/peopleos/employees/import`
  - `POST /api/payroll/runs`, `POST /api/payroll/approve`, `POST /api/payroll/runs/:runId/disburse-mpesa`
  - `POST /api/documents`
  - (`POST /api/leave-requests/:requestId/decision` already executed transactionally)

