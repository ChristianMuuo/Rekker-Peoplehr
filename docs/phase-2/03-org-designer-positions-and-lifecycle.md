# 03 — Organization Designer, Position Establishment & Employee Lifecycle

## Organization Designer (`orgPositionsService.ts`, `OrganizationDesignerView.tsx`)

- Cycle-safe hierarchical rendering (`visited` Set + depth cap) plus Integrity Alerts identifying cycles, self-managers, missing/inactive managers, and unassigned department leads.
- Supports `company`, `department`, `manager`, `employee`, and `position` views alongside search/department/status filtering, zoom controls, branch expand/collapse, and an accessible table view.
- Historical `asOf` snapshot mode reconstructs assignments from `employee_assignment_history` and renders an explicit gap notice when queried dates precede recorded snapshots.

## Position & Establishment Register

- Manages positions through `draft -> pending_approval -> approved -> vacant / occupied / frozen / abolished` while blocking abolition of occupied positions.
- Reconciles **Active Headcount**, **Approved Budgeted Slots**, **Open Vacancies**, and **Department Budgeted Capacity** as distinct metrics.
- Allows linking job requisitions (`job_requisitions.positionId`) and candidate conversions to approved positions.

## Complete Lifecycle (`lifecycleService.ts`, `RecruitmentPage.tsx`, `OnboardingPage.tsx`)

- **Candidate Conversion:** `POST /api/recruitment/candidates/:id/convert-to-employee` atomically provisions the employee record, links the position if provided, spawns onboarding tasks, and rejects duplicate conversions (`409 Conflict`).
- **Probation & Contracts:** Tracks §42 probation milestones (human confirmation required; maximum 1 extension enforced) and fixed-term contract expiry reminders without automatic termination.
- **Structured Offboarding:** `POST /api/onboarding/offboard` transitions employee status to `former` via effective-dated history, creates exit tasks, and checks assigned assets in `assetsTable`.

