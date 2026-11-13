# Rekker PeopleOS — Database Operations & Migration Runbook

**Scope:** PostgreSQL Architecture, Migration History, Disaster Recovery & Performance Tuning  
**Database Engine:** PostgreSQL 15+  
**ORM / Schema Manager:** Drizzle ORM  
**Version:** 1.0.0 (Phase 6 Production Release)  

---

## 1. Database Architecture & Multi-Tenancy

Rekker PeopleOS utilizes a shared-schema, row-level multi-tenant architecture with composite primary and secondary indexes.

```
+-------------------------------------------------------------+
|                      PostgreSQL Cluster                     |
|                                                             |
|   +-----------------------------------------------------+   |
|   | Organization Tenant (organizationId: 'rekker-ke')   |   |
|   |  - Employees Table (AES-256-GCM Encrypted PII)      |   |
|   |  - Payroll Runs & Items (Maker-Checker Enforced)    |   |
|   |  - Confidential HR Cases (Sealed Notes Firewall)    |   |
|   |  - Workforce Shifts & Equipment Certifications      |   |
|   |  - ML Models & Evaluation Lineage Tables            |   |
|   |  - Immutable Audit Log Table (Zero Update/Delete)   |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

### Connection Pool Configuration
In production environments, configure connection pooling via PgBouncer or native RDS/Cloud SQL connection limits:
- `DATABASE_URL`: `postgres://<user>:<password>@<host>:5432/<dbname>?sslmode=require`
- `PGPOOL_MAX`: 20 connections per API container
- `STATEMENT_TIMEOUT`: 15,000 ms (prevents long-running runaway queries)

---

## 2. Complete Migration History (0001–0007)

Every database evolution in PeopleOS is tracked in versioned SQL migration scripts located in `lib/db/migrations/`:

| Migration File | Phase | Key Schema Additions | Idempotency & Safety |
|---|---|---|---|
| `0001_enterprise_hrms.sql` | Baseline | Core organizations, users, employees, payroll runs, payslips, audit log | `CREATE TABLE IF NOT EXISTS` |
| `0002_peopleos_enterprise_upgrades.sql` | Upgrades | Department codes, job grades, statutory bands, leave balances | Non-destructive column additions |
| `0003_phase1_enterprise_foundation.sql` | Phase 1 | Encryption envelope columns (`enc:v2`), auth session tokens, tenant keys | Zero data loss modifications |
| `0004_phase2_core_enterprise_hr.sql` | Phase 2 | Visual org chart hierarchy (`reports_to_id`), bulk import batches, recruitment ATS tables | Foreign keys with `SET NULL` / `CASCADE` |
| `0005_phase4_erp_workforce_operations.sql` | Phase 4 | Shifts, warehouse certifications, driver licensing, sales commissions, heatmap views | Indexed operational tables |
| `0006_phase5_ai_governance.sql` | Phase 5 | AI tool audit logs, human approval queue, ML model registry, evaluation results | Audit and governance persistence |
| `0007_phase6_enterprise_hardening.sql` | Phase 6 | Composite performance indexes on payroll items, HR cases, and shift scheduling | `CREATE INDEX IF NOT EXISTS` (Zero table locks) |

### Migration Verification: 0007 Enterprise Hardening
Migration `0007_phase6_enterprise_hardening.sql` adds performance indexes to eliminate sequential scans across high-volume production tables:
```sql
CREATE INDEX IF NOT EXISTS "peopleos_payroll_items_emp_idx" 
  ON "peopleos_payroll_items" ("employee_id");

CREATE INDEX IF NOT EXISTS "hr_cases_org_submitter_idx" 
  ON "hr_cases" ("organization_id", "submitted_by_user_id");

CREATE INDEX IF NOT EXISTS "hr_cases_org_case_no_idx" 
  ON "hr_cases" ("organization_id", "case_number");

CREATE INDEX IF NOT EXISTS "workforce_shifts_org_emp_idx" 
  ON "workforce_shifts" ("organization_id", "employee_id");
```

---

## 3. Migration Execution Procedures

### Applying Pending Migrations
To apply all unapplied migrations to the target database:
```bash
# Push schema directly with Drizzle kit
pnpm run db:push

# Or run programmatic migration script
pnpm run db:migrate
```

### Pre-Deployment Verification
Before applying migrations to a staging or production instance:
1. Verify database connectivity:
   ```bash
   curl -I https://api.peopleos.rekker.co.ke/health/database
   ```
2. Verify pending migration compatibility without modifying existing tables:
   ```bash
   pnpm run typecheck:libs
   ```

---

## 4. Backup & Disaster Recovery Strategy

Rekker PeopleOS requires a zero-data-loss recovery strategy conforming to statutory financial and HR record compliance.

### Automated Backup Schedule
- **Full Logical Snapshots (`pg_dump`)**: Nightly at 01:00 EAT (UTC+3) retained for 90 days.
- **Physical WAL Archiving**: Continuous WAL streaming to encrypted Cloud Storage / S3 with 14-day Point-In-Time Recovery (PITR) window.

### On-Demand Backup Command
```bash
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="peopleos_backup_$(date +%Y%m%d_%H%M%S).dump" \
  "$DATABASE_URL"
```

### Restoration Verification Runbook
To test backup restoration into an isolated staging instance:
1. Create a clean test database:
   ```bash
   createdb -h localhost -U postgres peopleos_restore_test
   ```
2. Restore the custom-format dump:
   ```bash
   pg_restore -h localhost -U postgres -d peopleos_restore_test peopleos_backup_*.dump
   ```
3. Run verification sanity query:
   ```sql
   SELECT count(*) FROM peopleos_employees;
   SELECT count(*) FROM peopleos_audit_log;
   ```

---

## 5. Performance Tuning & Index Maintenance

### Cache Hit Ratio Monitoring
Execute weekly to verify database shared buffers are adequately sized (> 99% hit ratio):
```sql
SELECT 
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) AS buffer_cache_hit_ratio
FROM pg_statio_user_tables;
```

### High-Latency Query Inspection
```sql
SELECT 
  query, 
  calls, 
  total_exec_time / calls AS avg_exec_time_ms,
  rows
FROM pg_stat_statements
ORDER BY avg_exec_time_ms DESC
LIMIT 10;
```

### Index Maintenance (Bloat Prevention)
For continuous 24/7 production operations without downtime:
```sql
REINDEX TABLE CONCURRENTLY peopleos_payroll_items;
REINDEX TABLE CONCURRENTLY workforce_shifts;
REINDEX TABLE CONCURRENTLY peopleos_audit_log;
```

