# 04 — Self-Service, Attendance, Leave, Analytics & Kenyan HR Compliance

## Employee Self-Service & Manager Workspace (`selfServicePrivacyService.ts`, `SelfServicePage.tsx`)

- `GET /api/peopleos/me` resolves identity strictly from authenticated `membership.employeeId` (eliminating hardcoded `'10000000-...0007'` fallbacks) and surfaces an explicit unlinked-account banner when `employeeId` is `null`.
- React Query caches are keyed by role, userId, organizationId, and linked `employeeId`.
- Profile Correction Requests permit non-protected personal fields (`preferredName`, `personalEmail`, `phone`, `timezone`, `emergencyContactJson`, `contactPreferencesJson`) and block self-approval (Segregation of Duties).
- ODPC Privacy Rights Requests (`access`, `rectification`, `erasure`, `restriction`) track 7-day / 14-day statutory SLAs and require human/legal retention review without automatic erasure.

## Attendance, Work Calendars & Leave (`workCalendarService.ts`)

- Fixes employee spoofing on `/api/attendance/clock-in` and `/api/attendance/corrections` (`403` when non-managers attempt to target another `employeeId`).
- Uses `Intl.DateTimeFormat` with organization timezone (`Africa/Nairobi` default) and prevents duplicate open shifts.
- Configurable work calendars (`work_calendars`) exclude non-working rest days and public holidays (`countCalendarWorkingDays`) and support department leave coverage summaries (`GET /api/leave/department-coverage`).

## People Analytics & Kenya Statutory Reference (`peopleAnalyticsService.ts`, `kenyaComplianceService.ts`)

- Workforce, Lifecycle, and Data Quality analytics expose metric definitions, freshness timestamps, historical gap notices, and ODPC small-group suppression (`<= 3`) for non-HR roles.
- Informational Kenyan Employment Act Cap 226 (§§ 10, 28, 42) and Data Protection Act 2019 (General Regs 2021) readiness metadata includes `dateResearched: "2026-11-12"` and `requiresHrLegalReview: true`, explicitly noting that statutory tracking does not substitute for qualified Kenyan legal counsel.

