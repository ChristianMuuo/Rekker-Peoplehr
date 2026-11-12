# ADR 001: Modular Monolith over Premature Microservices

- **Status:** Accepted (Phase 1 Foundation)
- **Date:** 2026-11-11
- **Context:** Rekker PeopleOS runs as a pnpm monorepo (`artifacts/api-server` Express 5 + `artifacts/peopleos` React 19 SPA + `services/ml-engine` Python ML CLI/HTTP service + `@workspace/db` Drizzle ORM + `@workspace/api-zod` / `@workspace/api-client-react`). Breaking the HRMS/Payroll/RBAC/ERP core into distributed microservices now would add distributed transaction complexity across PostgreSQL payroll runs, leave approvals, and compliance audit events without operational maturity.
- **Decision:** Keep the modular monolith architecture anchored on `artifacts/api-server` organized by strict domain route modules (`peopleos.ts`, `leave.ts`, `payroll.ts`, `documents.ts`, `hrCases.ts`, `workforceErp.ts`, `audit.ts`, `health.ts`, `ai.ts`, etc.) sharing unified middleware (`peopleosAccess.ts`, `authorization.ts`, `auditService.ts`, `security.ts`) and ACID PostgreSQL transactions via `@workspace/db`, while keeping Python compute isolated in `services/ml-engine`.
- **Consequences:** Enables single-database ACID transactions (`db.transaction`) linking business mutations and critical audit logs (`AuditPersistenceError`), deterministic CI/CD builds, and clear future extraction seams along domain module boundaries.

