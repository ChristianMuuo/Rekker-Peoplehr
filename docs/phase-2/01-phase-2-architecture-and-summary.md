# 01 — Phase 2 Architecture, Schema & OpenAPI Contracts

## Scope & Preserved Boundaries

Phase 2 enhances Rekker PeopleOS's internal Core HR, organizational design, employee lifecycle, employee self-service, attendance/leave operations, and people analytics while strictly preserving:

- Phase 1 fail-closed authentication, RBAC/IDOR isolation, AES-256-GCM field encryption, and audit persistence guarantees.
- Existing launched external sites (`https://rekker.co.ke/` and `https://shop.rekker.co.ke/`) without duplicating e-commerce storefronts or public corporate pages.
- Empty-by-default organization leave policies (`/api/leave-policies` returns `[]` until configured by HR).

## Database Schema & Migration

Additive PostgreSQL migration: `lib/db/migrations/0004_phase2_core_enterprise_hr.sql` matching:

- `lib/db/src/schema/peopleos.ts` (extended `organizationsTable`, `employeesTable`, `jobRequisitionsTable`, `candidatesTable`, `onboardingTasksTable`).
- `lib/db/src/schema/phase2CoreHr.ts` introducing 13 Phase 2 enterprise tables:
  1. `positions`
  2. `employee_position_assignments`
  3. `employee_assignment_history`
  4. `employee_import_mapping_profiles`
  5. `employee_import_batches`
  6. `employee_import_rows`
  7. `onboarding_templates`
  8. `probation_reviews`
  9. `contract_reminders`
  10. `profile_correction_requests`
  11. `privacy_requests`
  12. `work_calendars`
  13. `attendance_corrections`

## OpenAPI & Codegen

- `lib/api-spec/openapi.yaml` updated additively with `/employees` filter/sort parameters (`employmentType`, `location`, `sortBy`, `sortDir`), extended `Employee`/`EmployeeInput`/`EmployeeUpdate` fields, and Phase 2 routes (`/peopleos/me`, `/peopleos/manager/workspace`, `/peopleos/positions`, `/peopleos/org-chart`, `/peopleos/analytics/workforce`, `/peopleos/compliance/kenya-readiness`, `/peopleos/work-calendars`).
- Regenerated React Query hooks and Zod schemas via `pnpm --filter @workspace/api-spec run codegen`.

