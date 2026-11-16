# Rekker PeopleOS — API Endpoints & Authorization Matrix

## 1. Global Middleware Stack

Every HTTP request traverses:
1. **Correlation ID Injector**: Assigns unique `x-correlation-id` to every request for end-to-end tracing.
2. **Pino Structured Logger**: Formats access logs with user ID, method, status code, and latency (PII redacted).
3. **CORS Guard**: Strict allowlist check against `PEOPLEOS_ALLOWED_ORIGINS` (wildcards prohibited in production).
4. **Authentication Middleware**:
   - `PEOPLEOS_AUTH_MODE=clerk`: Validates Clerk JWT bearer token or session cookie.
   - `PEOPLEOS_AUTH_MODE=demo`: Reads sandbox test identity headers (`x-peopleos-user-id`, `x-peopleos-role`).
5. **Organization Context Middleware (`ensureMembership`)**: Rejects mismatched tenant headers with HTTP 403.
6. **Rate Limiting**: Per-route and global rate limiting to protect against brute-force and DDoS.

---

## 2. API Endpoint Authorization Matrix

| HTTP Method & Path | Controller / Route | Required Role / Permission | Sensitive Action / Audit Emitted? |
|---|---|---|---|
| `GET /health` | `routes/health.ts` | Public | No (Health & liveness probe) |
| `GET /api/readyz` | `routes/health.ts` | Public | No (Deep dependency readiness check) |
| `GET /api/health/database` | `routes/health.ts` | Public / Admin | No (Postgres connection test) |
| `GET /api/health/ml` | `routes/health.ts` | Public / Admin | No (ML engine connectivity probe) |
| `GET /api/auth/context` | `routes/auth.ts` | Authenticated | No (Returns current role & permissions) |
| `GET /api/peopleos/overview` | `routes/overview.ts` | Authenticated | No (High-level operational stats) |
| `GET /api/peopleos/employees` | `routes/employees.ts` | Authenticated | No (Directory list) |
| `POST /api/peopleos/employees` | `routes/employees.ts` | `hr_admin`, `system_admin` | **Yes** (`EMPLOYEE_CREATED`) |
| `PATCH /api/peopleos/employees/:id` | `routes/employees.ts` | `hr_admin`, `system_admin` | **Yes** (`EMPLOYEE_UPDATED`) |
| `POST /api/peopleos/employees/import-preview` | `routes/employees.ts` | `hr_admin`, `system_admin` | No (Validates CSV rows before commit) |
| `POST /api/peopleos/employees/import` | `routes/employees.ts` | `hr_admin`, `system_admin` | **Yes** (`EMPLOYEES_BULK_IMPORTED`) |
| `GET /api/peopleos/org-chart` | `routes/organization.ts` | Authenticated | No (Cycle-safe hierarchy) |
| `GET /api/leave-policies` | `routes/leave.ts` | Authenticated | No (Organization leave policies) |
| `POST /api/leave-policies` | `routes/leave.ts` | `hr_admin`, `system_admin` | **Yes** (`LEAVE_POLICY_CREATED`) |
| `GET /api/leave-requests` | `routes/leave.ts` | Authenticated | No (Filtered by employee / manager) |
| `POST /api/leave-requests` | `routes/leave.ts` | Authenticated | **Yes** (`LEAVE_REQUESTED`) |
| `POST /api/leave-requests/:id/decide` | `routes/leave.ts` | Manager, `hr_admin` | **Yes** (`LEAVE_APPROVED` / `REJECTED`) |
| `GET /api/payroll/runs` | `routes/payroll.ts` | `canViewPayroll` | No (Run history) |
| `POST /api/payroll/prepare` | `routes/payroll.ts` | `payroll_officer`, `hr_admin` | **Yes** (`PAYROLL_PREPARED`) |
| `POST /api/payroll/approve` | `routes/payroll.ts` | `hr_admin`, `finance_lead` | **Yes** (`PAYROLL_APPROVED` — Maker-Checker) |
| `POST /api/payroll/runs/:id/disburse-mpesa` | `routes/payroll.ts` | `finance_lead`, `system_admin` | **Yes** (`MPESA_DISBURSEMENT_INITIATED`) |
| `GET /api/hr-cases` | `routes/hrCases.ts` | HR Case Officer / Employee | No (Firewall filtered) |
| `POST /api/hr-cases` | `routes/hrCases.ts` | Authenticated | **Yes** (`HR_CASE_OPENED`) |
| `PATCH /api/hr-cases/:id` | `routes/hrCases.ts` | Assigned HR Case Officer | **Yes** (`HR_CASE_UPDATED`) |
| `GET /api/workforce-erp/shifts` | `routes/workforceErp.ts` | Authenticated | No (Shift schedule) |
| `POST /api/workforce-erp/shifts` | `routes/workforceErp.ts` | `operations_manager` | **Yes** (Validates driver licenses) |
| `POST /api/ai/chat` | `routes/ai.ts` | Authenticated | **Yes** (Queries AI multi-agent supervisor) |
| `POST /api/ai/approvals/:id/decision`| `routes/ai.ts` | Consequential Reviewer | **Yes** (`AI_PROPOSAL_DECIDED`) |
| `GET /api/audit-events` | `routes/audit.ts` | `canViewAudit` | No (Encrypted immutable audit logs) |
