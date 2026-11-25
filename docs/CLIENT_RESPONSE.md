# Rekker PeopleOS — Client Feedback Response

**Implementation branch:** `feat/peopleos-credibility-sprint`  
**Date:** 25 November 2026  
**Important:** This is a code-change summary, not a claim that CI or production deployment has passed. Automated verification must be reviewed in the PR checks.

## 1. Finish leave before adding modules

**Implemented**
- Added additive PostgreSQL migrations for leave policy statutory metadata, fractional-day requests, ledger entries, recommendation attribution, entitlement years, approval steps, policy versions, public holidays and an immutable audit hash chain.
- Added first-run Kenya policy defaults with source links and `NEEDS_LEGAL_REVIEW` markers.
- Added server-side annual and paternity statutory floor validation.
- Added a deterministic, explainable `Rule-based advisory`.
- Added distinct manager recommendation and HR decision routes.
- HR approval takes a row lock and writes the decision, ledger deduction, approval step and audit event in one transaction. Idempotency source keys and conditional request status prevent duplicate deductions.
- Added cancellation with an append-only ledger reversal.
- Balances use ledger sums in the database path. Demo balances use synthetic requests.
- Added editable organisation-scoped public-holiday CRUD and merged persisted holidays into the effective work calendar.
- Added weighted weekday support for 5-day, 5.5-day and 6-day schedules; half-day leave is represented as 0.5.
- Added a route-level leave workflow test and unit tests for statutory floors, advisory results, pro-rata annual leave and weighted work schedules.

**Not yet complete / release blockers**
- The route-level leave workflow test exercises the non-database demo path. A provisioned PostgreSQL integration suite and browser-level Playwright E2E still need to pass.
- Sick certificate attachment and secure storage, pay-tier sequencing (7 full-pay then 7 half-pay), pre-adoptive document checks, configurable multi-step approval chains, notification delivery and leave-year edge cases remain outstanding.
- `calculateAnnualLeaveProRataOnExit` is tested but not yet connected to an employee exit/final-dues workflow.

## 2. Stop claiming capabilities that are not built

**Implemented**
- Agent Hub is labelled Concept preview; local fallback output is explicitly simulated.
- Removed the unverified “10 live agents”, RAG and XGBoost claims from the Agent Hub concept catalogue.
- ML surface is labelled preview; absent evaluation metrics display “Not evaluated” instead of invented ROC-AUC/F1 scores.
- Added typed feature registry with Live/Beta/Preview/Roadmap status; Agent Hub, ML and broader Workforce ERP were moved into Roadmap & previews.

**Not yet complete**
- A single exhaustive repository-wide claim scanner and route-by-route registry enforcement still need CI coverage. Some separate module descriptions may need further review.

## 3. Real backend and login

**Implemented**
- Frontend now accepts `VITE_API_BASE_URL` for the separately hosted Express API.
- Vercel no longer rewrites `/api/*` to the SPA HTML shell.
- Production frontend fails closed if Clerk publishable configuration is missing; demo sign-in is disabled in production.
- Client mock fallback is disabled in production.
- Deployment guide documents the required API origin, exact CORS origin allowlist and health endpoints.

**Not yet complete**
- The actual deployed API origin and production Clerk/Database environment configuration have not been verified.
- Vercel project access is awaiting team authorization; no claim is made that the live deployment is protected or successfully connected.
- Postgres-backed integration tests and Playwright login/RBAC tests still need to run in CI.

## 4. Demo dates relative to today

**Implemented**
- Leave and audit demo fixtures derive dates from the current clock.
- DB demo seed dates and PeopleOS demo employee hire/contract dates have been converted to relative helpers.
- Existing phase-two in-memory data now uses the current clock rather than a frozen November 12, 2026 timestamp.

**Not yet complete**
- A full repository-wide scan for every old literal date, every chart label and every stale “upcoming” fixture needs to be run and added to CI. Public holiday dates are actual calendar records, not generated relative demo transactions.

## 5. Settings, Diagnostics, enum labels, statutory copy and demo access

**Implemented**
- Settings and Diagnostics have separate content and diagnostics probes run only on the Diagnostics route.
- Shared presentation mapping covers `HR_CASE_OFFICER_FULL` and common role enums.
- Paternity policy is stored as 2 weeks, not “10 days”; official rule 11 is included in the policy metadata and the Compliance note.
- Added `noindex, nofollow, noarchive` HTML metadata and Vercel `X-Robots-Tag` plus security headers.

**Not yet complete**
- No server-side password/invite gate or Vercel Deployment Protection has been confirmed. Noindex is not access control.
- Vercel team access is pending owner authorization. Do not share the public demo link with real employee data.
- Full UI hygiene crawl for raw enums, null/NaN/TODO text and past-dated upcoming items has not yet run.

## Verification status

- Unit tests added: `leave-engine.test.ts`, `work-calendar.test.ts`.
- Route test added: `leave-workflow.test.ts`.
- Existing leave calendar regression test updated to use relative months.
- No local pnpm typecheck, lint, test or build result is asserted in this document. Use the PR's actual GitHub Actions run as the source of truth.
