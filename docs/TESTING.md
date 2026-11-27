# Testing & Quality Assurance (`TESTING.md`)

## Automated Checks
```bash
pnpm run lint        # ESLint on core TypeScript modules
pnpm run typecheck   # Strict TypeScript check across all 9 workspace packages
pnpm run test        # Node.js test runner across all suites in @workspace/api-server
pnpm run build       # Production bundle builds (api-server, peopleos, mockup-sandbox)
```

## Key Test Suites (`artifacts/api-server/tests/`)
- `leave-engine.test.ts` — Deterministic `LeaveAdvisor` outcomes, Kenya statutory defaults (paternity = 14 days / 2 weeks), end-to-end `apply -> recommend -> approve -> balance deducted -> audit -> cancel` lifecycle, rejection non-deduction, and atomic rollback on audit failure.
- `leave-db-integration.test.ts` — Real PostgreSQL (`@electric-sql/pglite`) migration test for `0008_production_core.sql`, ledger idempotency constraints, SQL transaction rollback, hash-chained audit hashing, `argon2id` login/logout session cookies, and `leaveAdmin` + audit CSV endpoints.
- `leave-calendar.test.ts` — Monthly leave calendar, KDPA 2019 peer/manager privacy redaction, and working-day preview.
- `phase4-workforce-erp.test.ts` — Shift conflict detection, leave conflict blocking, and competency validation.
- `stage1-authorization-audit.test.ts`, `phase1-security.test.ts`, `peopleos-upgrades.test.ts` — RBAC, cross-tenant isolation, confidential HR cases, and Maker-Checker payroll controls.
