# ADR 002: Database Access and Connection Pool Standardization

- **Status:** Accepted (Phase 1 Foundation)
- **Date:** 2026-11-11
- **Context:** Previously, `lib/db/src/index.ts` created a new PostgreSQL `pg.Pool` instance per Proxy property access when `DATABASE_URL` was absent at import time or delayed, risking connection exhaustion, lacked bounded pool timeouts and connection caps, and provided no graceful pool shutdown hook or active readiness probe. Additionally, `lib/db/migrations/0002_peopleos_enterprise_upgrades.sql` referenced nonexistent tables `"organizations"` and `"employees"` instead of `"peopleos_organizations"` and `"peopleos_employees"`.
- **Decision:** Standardize `lib/db/src/index.ts` on a single cached singleton `_pool` & `_db` instance (`max` configurable via `PG_POOL_MAX`, 30s idle timeout, 5s connection timeout), expose `checkDbHealth(timeoutMs)` (`SELECT 1`) and `closeDbPool()`, enforce fail-closed startup in `artifacts/api-server/src/index.ts` & graceful shutdown on `SIGTERM`/`SIGINT`, and reconcile migrations (`0002` fixed table references + additive `0003_phase1_enterprise_foundation.sql` adding `created_by_user_id` on `peopleos_payroll_runs` and document metadata columns).
- **Consequences:** Eliminates pool leaks, surfaces accurate database readiness on `/api/readyz` and `/api/admin/diagnostics`, persists Maker-Checker creator identity directly in Postgres, and provides idempotent additive migrations (static SQL validated via schema inspection; live PostgreSQL execution deferred until a PostgreSQL instance is attached).

