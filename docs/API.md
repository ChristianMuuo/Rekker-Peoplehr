# Rekker PeopleOS API Reference (`API.md`)

## Leave Management & Statutory Calendar
- `GET /api/leave-policies` — List active organization leave policies (Kenya defaults seeded for `rekker-demo`).
- `POST /api/leave-policies` / `PATCH /api/leave-policies/:policyId` — Create or update leave policies (`hr_admin`, `hr_manager`, `system_admin`).
- `GET /api/leave-balances?year=&employeeId=` — Compute entitled, accrued, used, pending, and remaining leave days.
- `GET /api/leave-requests` — Role-scoped leave request listing.
- `POST /api/leave/requests/preview` — Compute working days excluding weekends/holidays, check overlaps, and return deterministic `LeaveAdvisor` recommendation without mutating data.
- `POST /api/leave-requests` — Submit a new leave request (validates overlap & balance).
- `POST /api/leave-requests/:requestId/recommend` — Run deterministic `LeaveAdvisor` evaluation on a pending request.
- `POST /api/leave-requests/:requestId/decision` — Atomically approve or decline a pending leave request (balance deducted only on approval; critical audit failure rolls back).
- `POST /api/leave-requests/:requestId/cancel` — Cancel a pending or approved leave request, reversing balance reservations and appending an audit event.
- `GET /api/leave/work-schedules` / `POST /api/leave/work-schedules` — Manage work schedules.
- `GET /api/leave/public-holidays/:year` / `POST /api/leave/public-holidays` — Manage gazetted Kenyan public holidays.

## Auth, Settings, Diagnostics & Audit
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `GET /api/auth/context` — Resolve active role and UI capability flags.
- `POST /api/demo-access` — Verify `DEMO_PASSCODE` and set `demoPk` cookie.
- `GET /api/settings`, `PATCH /api/settings` — Workspace settings CRUD.
- `GET /api/readyz`, `GET /api/admin/diagnostics` — Live runtime & subsystem health probes.
- `GET /api/audit-events?action=&targetType=&actor=&limit=`, `GET /api/audit-events/export.csv` — Filtered audit log and CSV export.
