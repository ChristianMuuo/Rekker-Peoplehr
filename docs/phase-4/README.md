# Rekker PeopleOS — Phase 4 Documentation Suite
## ERP Workforce Connections, Operational Scheduling & Competency Management

This directory contains the technical architecture, domain models, algorithm specifications, and verification records for Phase 4 of the Rekker PeopleOS roadmap.

---

## Documents in this Suite

1. **[01-phase-4-architecture-and-summary.md](./01-phase-4-architecture-and-summary.md)**  
   *High-level architecture, authoritative data sources, PostgreSQL database schemas (`lib/db`), and monorepo verification results.*

2. **[02-production-scheduling-and-competency.md](./02-production-scheduling-and-competency.md)**  
   *Manufacturing line configurations, shift templates, 4-gate conflict validation engine, and peer shift swap workflows.*

3. **[03-replacement-matcher-and-warehouse-equipment.md](./03-replacement-matcher-and-warehouse-equipment.md)**  
   *Missing shift coverage alerts, hard eligibility exclusion filters, 4-factor transparent ranking formula, and warehouse equipment competency lifecycles.*

4. **[04-driver-compliance-sales-and-integrations.md](./04-driver-compliance-sales-and-integrations.md)**  
   *Distribution fleet driver compliance, dynamic server-date expiry alerts, hard vehicle dispatch blocking, commercial sales territories, and honest integration readiness.*

---

## Quick Reference: Test Suite Execution

To execute the complete 50-test automated verification suite:

```bash
# Run API server unit and integration tests (including phase4-workforce-erp.test.ts)
pnpm --filter @workspace/api-server run test

# Run full monorepo typecheck across all 9 packages
pnpm run typecheck

# Run production build (esbuild server + Vite frontend)
pnpm run build
```
