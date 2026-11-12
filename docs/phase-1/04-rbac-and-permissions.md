# 04 — Role-Based Access Control (RBAC) & Object-Level Authorization (IDOR)

## 1. Centralized Role & Module Permission Matrix

All 15 enterprise roles and module rules are anchored in `artifacts/api-server/src/lib/authorization.ts` and synchronized across `@workspace/api-spec` (`openapi.yaml`) and `@workspace/api-zod` (`GetAuthContextResponse`, `OrganizationRole`):

`employee`, `department_manager`, `hr_admin`, `hr_director`, `hr_manager`, `hr_officer`, `payroll_officer`, `finance_manager`, `production_supervisor`, `warehouse_supervisor`, `sales_manager`, `recruiter`, `read_only_executive`, `auditor`, `system_admin`.

| Domain Module | Read Roles | Write / Action Roles | Special Controls |
|---|---|---|---|
| `hrAndPeopleCore` (`/employees`, `/departments`) | All 15 org roles (row-scoped) | `hr_admin`, `hr_director`, `hr_manager`, `hr_officer`, `system_admin` | Object-level `canReadEmployeeProfile` IDOR guard |
| `confidentialHrCases` (`/hr-cases`) | `hr_admin`, `hr_director`, `hr_manager`, `employee` (own only) | Same (employees create own) | Blocked for `department_manager`, `recruiter`, `payroll_officer` |
| `payrollAndJournal` (`/payroll/*`) | `payroll_officer`, `finance_manager`, `hr_admin`, `hr_director`, `system_admin`, `auditor` | `payroll_officer`, `finance_manager`, `hr_admin`, `system_admin` | Dual-control Maker-Checker (`createdByUserId !== approver`) |
| `workforceErpOperations` (`/workforce-erp/*`) | `production_supervisor`, `warehouse_supervisor`, `sales_manager`, `finance_manager`, `department_manager`, HR/exec/sysadmin | Supervisors + HR + `system_admin` | Certified operator & driver credential checks |
| `auditTrail` (`/audit-events`, `/audit`) | `hr_admin`, `hr_director`, `auditor`, `system_admin` | Append-only internal service | Route drift fixed (`hr_manager`/`recruiter` blocked) |
| `adminDiagnostics` (`/admin/diagnostics`) | `hr_admin`, `system_admin`, `auditor` | `system_admin` | Secret-free runtime probe payload |

## 2. Eliminated IDOR & Route Drift Vulnerabilities

- **`GET /api/employees`, `/api/employees/:employeeId`, `/api/employees/:employeeId/profile-360`**: Removed `!access.organization.isDemo` authorization bypasses. Employees may only access their own records; `department_manager`, `production_supervisor`, `warehouse_supervisor`, and `sales_manager` may access only themselves and direct reports (`managerId === membership.employeeId`); broad directory roles require membership in `BROAD_DIRECTORY_ROLES`. Cross-employee reads fail with `403 FORBIDDEN_EMPLOYEE_PROFILE`.
- **`GET /api/employees/:employeeId/profile-360`**: Now queries PostgreSQL `employeesTable` when `DATABASE_URL` is configured, applies `canViewSensitiveStatutoryIdentifiers` masking rules, and eliminates hardcoded realistic test strings.
- **`GET /api/auth/context`**: Now permits all 15 valid roles rather than rejecting `hr_director`, `hr_officer`, `finance_manager`, `production_supervisor`, `warehouse_supervisor`, and `sales_manager` with `403`.
- **`GET /api/documents` & `/api/documents/expiring`**: Scopes document queries cleanly so non-privileged users never inspect colleagues' files.

