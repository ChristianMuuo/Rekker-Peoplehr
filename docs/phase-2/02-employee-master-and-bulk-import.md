# 02 — Employee Master Data, Effective-Dated History & Bulk Import Centre

## Employee Master Data (`employeeMasterService.ts`)

- Enforces hierarchy cycle, self-management, cross-organization, and former-employee manager checks via `assertValidManagerAssignment`.
- Tracks effective-dated job, department, reporting, location, contract, and status transitions in `employee_assignment_history` (`applyEffectiveDatedAssignmentChange`) and surfaces a unified timeline (`getEmployeeLifecycleTimeline`).
- Computes Employment Act §10 completeness scores (`evaluateEmployeeSection10Completeness`) per employee and across the directory.
- Provides RBAC-protected formula-injection-safe CSV directory export (`GET /api/employees/export`).

## Bulk Employee Import Centre (`rfc4180Csv.ts`, `csvImportService.ts`, `BulkImportDialog.tsx`)

- **Strict RFC-4180 Parsing:** Supports UTF-8 BOM stripping, quoted fields containing commas/newlines, and escaped `""` quotes while rejecting unclosed quotes and column-count mismatches.
- **No Silent Fallbacks & Sensitive Column Blocking:** Rejects unknown department codes, invalid `employmentType` values, unresolvable managers, and sensitive statutory/payroll columns (`nationalId`, `kraPin`, `nssfNo`, `shaNo`, `bankAccount`, `baseSalary`).
- **Two-Phase Tokenized Commit:** Staging creates an expiring HMAC-SHA256-bound token (`READY_FOR_COMMIT` -> `COMMITTED`), prevents cross-user commits, blocks replay after commit (`409`), and exports formula-safe validation error CSVs (`/api/peopleos/employees/import-batches/:id/errors.csv`).

