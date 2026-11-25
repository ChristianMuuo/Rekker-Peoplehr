# Rekker PeopleOS Phase 0 Audit

**Date:** 25 November 2026  
**Repository:** ChristianMuuo/Rekker-Peoplehr  
**Branch:** chore/stage-00-audit-and-stabilise  
**Scope:** Read-only application audit. No application code changed.

## Executive summary

The repository already contains a React/Vite frontend, Express API, PostgreSQL/Drizzle data layer, Clerk integration, RBAC, audit utilities, and a Python ML service. The client's observations are nevertheless substantially supported by the current implementation: the public Vercel configuration sends all `/api/*` traffic to the SPA's `/index.html`; the frontend deliberately supplies placeholder auth data for static deployments; leave policy fixtures start empty; leave balances are calculated from request rows rather than a ledger; and the leave schema does not yet model approvals, attachments, policy versions, or ledger entries.

The existing code is a useful foundation, but the leave workflow is not yet the requested auditable, transactional product slice.

## 1. Architecture map

| Area | Current implementation | Evidence |
|---|---|---|
| Frontend | React 19, Vite 7, TypeScript, Tailwind; SPA in `artifacts/peopleos` | `artifacts/peopleos/package.json`, `vite.config.ts`, `src/App.tsx` |
| API | Express 5, bundled by esbuild, mounted under `/api` | `artifacts/api-server/package.json`, `src/index.ts`, `src/app.ts`, `src/routes/index.ts` |
| Database | PostgreSQL via pg + Drizzle ORM; schema in `lib/db`; SQL migrations | `lib/db/package.json`, `src/schema/peopleos.ts`, `migrations/0001...` through `0003...` |
| API contract | OpenAPI generation, Zod validators, generated React Query client | `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` |
| Authentication | Clerk integration; explicit demo mode in non-production | `artifacts/api-server/src/app.ts`, `src/config/env.ts`, `artifacts/peopleos/src/auth` |
| Authorization | Role/permission matrix and membership middleware | `artifacts/api-server/src/lib/authorization.ts`, `src/middlewares/peopleosAccess.ts` |
| Audit | Audit insert service and database audit table; no hash chain or DB-enforced append-only protection verified | `artifacts/api-server/src/lib/auditService.ts`, `lib/db/src/schema/peopleos.ts` |
| ML | Python service; API diagnostics probes configured ML URL or local CLI | `services/ml-engine`, `artifacts/api-server/src/routes/health.ts` |
| Deployment | Vercel config builds static frontend. Deployment guide expects Express API on a separate host and `VITE_API_BASE_URL` to be configured | `vercel.json`, `DEPLOYMENT.md`, `.env.example` |

### API reachability: confirmed routing defect

The root `vercel.json` currently rewrites `/api/(.*)` to `/index.html`, followed by a catch-all SPA rewrite. This means requests to the same-origin `/api/*` path are routed to the static frontend rather than to the Express API. The Express process is a separately started service according to `DEPLOYMENT.md`; no Vercel API function or Vercel multi-service mapping is configured in the inspected root config.

**Likely root cause:** the deployed frontend's same-origin API path does not point at the separately hosted Express API. A missing/incorrect `VITE_API_BASE_URL` or unavailable API host may also contribute. Confirm the deployed environment variables and actual API host before selecting the final rewrite. Do not guess a production API origin.

Vercel supports external-origin rewrites and Express deployments; the ADR proposes keeping the existing API service separate initially and proxying `/api/:path*` to its verified HTTPS origin. Sources: [Vercel rewrites](https://vercel.com/docs/routing/rewrites), [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

### Authentication and static fallback

The backend supports Clerk when configured and permits demo auth only outside production. The frontend `App.tsx` contains `FALLBACK_AUTH` placeholder data and comments that it is used on static Vercel deployments where no backend exists. This makes a static showcase possible, but it must never be presented as a live authenticated workspace. Production must fail closed and the UI must clearly distinguish demo preview from live persisted data.

### Documentation inventory

The root `AGENTS.md`, `replit.md`, and `DEPLOYMENT.md` were inspected. The expected `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/AUDIT.md`, and `docs/SPRINT_LOG.md` were not found on the inspected repository ref at audit time.

## 2. Feature inventory

| Feature | Current status | Evidence / finding |
|---|---|---|
| Employee directory and core HR | Partial/live foundations | React routes and Express modules exist; persistence depends on database and auth configuration |
| Leave policy management | Partial | CRUD endpoints and Drizzle policy table exist, but policy table has no effective dates, jurisdiction, source, statutory floor metadata, or version history |
| Leave requests | Partial | Create/list/decision endpoints persist request rows when DATABASE_URL exists; no attachments or half-day field in inspected schema |
| Leave recommendation | Not evidenced as a working leave-specific advisory | No LeaveAdvisor evidence found in inspected leave route |
| Leave approval | Partial | Pending-to-approved/rejected update and audit insert occur in one transaction, but no explicit recommendation stage, approval-chain records, row-lock/version strategy, or balance-ledger deduction |
| Leave balances | Partial | Computed from request rows and policy annual/monthly fields; no append-only leave ledger. Demo balance is empty because demo policy array is empty |
| Leave cancellation/reversal | Not evidenced | No cancellation endpoint or reversal ledger found in inspected leave router |
| Audit viewer | Partial | Organisation-scoped event list exists; no CSV export, hash-chain verification, or append-only database enforcement verified |
| Agent hub | Unverified/likely partial | Page exists; live tool/model run evidence and truthful feature registry not verified |
| ML | Partial | Python service and diagnostic health check exist; model cards and per-model production evidence need audit |
| Payroll | Partial | Backend and payroll engine are present; statutory claims require primary-source revalidation before use |
| Diagnostics | Partial/live foundations | API diagnostics endpoint reports runtime, DB, auth, audit, ML and integration state |
| Settings | Needs route-level verification | Client reports duplicate content; route implementation not yet confirmed in this pass |
| Demo data | Static/stale | Leave fixture and audit fixtures contain February/March 2026 timestamps |
| Public demo SEO | Partial | `index.html` already contains `noindex,nofollow`; root `vercel.json` does not set `X-Robots-Tag` and no server-side demo gate was found in inspected config |
| Role labels | Partial | UI uses raw `auth.role.replaceAll('_',' ')` in places; no central presentation map verified |

## 3. Leave critical-path findings

### Current data model gaps

The inspected Drizzle schema currently has:
- `peopleos_leave_policies`: organisation, code, name, entitlementDays, accrualMethod, active, creator and timestamps.
- `peopleos_leave_requests`: organisation, employee, leave type, date range, integer days, reason, one status, creator, one approver, comment and timestamps.
- `peopleos_audit_events`: actor/action/entity/summary/timestamp.

The inspected schema does **not** contain dedicated leave ledger, multi-step leave approvals, leave attachments, effective-dated leave policy versions, schedule patterns or public-holiday tables in the leave model. Existing work calendar services and work-calendar tables can be reused after a full schema audit.

### Current leave route findings

- `DEMO_LEAVE_POLICIES` is explicitly an empty array, explaining the no-policy state and zero demo balances.
- The demo leave fixtures are hardcoded to March/April 2026 and show a paternity-like `parental` request as 10 working days.
- Leave balances are calculated by summing pending and approved request date ranges, not by summing append-only ledger entries.
- Request creation validates employee/org membership, date order, working days, overlap and available policy balance. It locks the employee row during request creation.
- Approval changes `pending` to `approved` or `rejected` with a conditional update and writes an audit event in the same transaction. It does not create a leave ledger deduction, separate recommendation state, or approval-step record.
- The decision route checks that the creator is not the approver. A second decision returns conflict, but explicit idempotent success semantics and concurrency acceptance tests are not evidenced.
- Existing status model is simpler than the required `draft → submitted → recommended → approved/rejected` lifecycle.
- Current working-day count is integer-valued in the request schema. Half-days therefore need explicit modelling and tests.

### Kenya statutory baseline to verify in implementation

Primary legal source: [Employment Act, 2007, Kenya Law official source](https://new.kenyalaw.org/akn/ke/act/2007/11/eng%402007-11-09/source.pdf).

- Section 28: not less than 21 working days of annual leave with full pay after every 12 consecutive months; where employment terminates after at least two consecutive months in a leave-earning period, at least 1.75 days for each completed month in that period.
- Section 29(8): male employee entitled to two weeks' paternity leave with full pay.
- Section 29A: pre-adoptive leave provision; confirm current consolidated wording and qualifying conditions when implementing.
- Section 30: after two consecutive months of service, at least seven days' sick leave on full pay and thereafter seven days on half pay in each 12-month period, subject to the specified medical certificate.

The Employment (General) Rules, 2014, rule 11 also describes how the two weeks' paternity leave may be taken and evidence accompanying the application: [Kenya Law official source](https://new.kenyalaw.org/akn/ke/act/ln/2014/28/eng%402014-03-14/source).

**Implementation interpretation requiring legal review:** preserve statutory paternity entitlement as 2 weeks, not a hardcoded 10 days. Display the statutory unit as weeks. If an organisation's working-day display is needed, derive it from the employee's schedule and clearly label that conversion as an interpretation pending counsel review.

All statutory policy records should include source URL, verified date, effective dates, and `NEEDS_LEGAL_REVIEW` until the organisation's Kenyan employment counsel confirms the final policy configuration.

## 4. Claims / UI hygiene grep report

A full repository-wide grep could not be executed through the GitHub file API in this audit. The following confirmed hits came from inspected files:

| Search term | Confirmed hit |
|---|---|
| `XGBoost` | `DEPLOYMENT.md` describes an XGBoost engine; `artifacts/api-server/src/routes/health.ts` labels the Python subsystem “Python Scikit-Learn & XGBoost Engine” |
| `RAG` | Not verified in inspected excerpts; repository-wide scan still required |
| `10 agents` | `AGENTS.md` mentions a “10 Specialists” orchestrator; `replit.md` describes an 11-node multi-agent orchestrator |
| `Phase 4` | Not verified in inspected excerpts; repository-wide scan still required |
| `HR_CASE_OFFICER_FULL` | Not verified in inspected excerpts; UI-wide enum scan still required |
| `policies not configured` | Client-reported; exact code occurrence not yet located |
| `March 2026` / `2026-03` | `artifacts/api-server/src/routes/leave.ts` hardcodes March 2026 leave records; `artifacts/api-server/src/lib/auditService.ts` hardcodes February/March 2026 audit events and payroll period |
| `10 days` | `leave.ts` demo parental/paternity-like record is 10 days |

A full grep and route crawl must run in the local development environment before Phase 1 acceptance.

## 5. Baseline quality gates

**Not run in this audit environment.** The GitHub connector can read repository files but does not execute the repository's package scripts or provision its PostgreSQL test database. No test, lint, typecheck, install, or build result is claimed.

Required local baseline:
- `pnpm install --frozen-lockfile`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run build`
- Python ML tests: `python -m unittest discover -s services/ml-engine/tests`

CI currently runs typecheck, Node tests, frontend/full build and one Python test module. It does not currently show a provisioned Postgres integration service or Playwright leave E2E in the inspected workflow.

## 6. Decisions proposed

1. **API hosting:** retain the existing Express API as a separate Node service for the first production slice; route the frontend's `/api/:path*` to its verified HTTPS origin through Vercel external rewrite. This avoids a disruptive migration while fixing the current static rewrite. Keep the API's same-origin browser URL and strict CORS allowlist.
2. **Database:** retain PostgreSQL + Drizzle. Add additive, reversible migrations for effective-dated policies, schedules/holidays, leave approvals, append-only leave ledger, attachments metadata and hash-chained audit events. Use DB transactions and row locks for approvals. Do not introduce a second datastore.
3. **Authentication:** retain Clerk as the identity provider because the code already integrates it. Require Clerk mode in deployed environments, enforce server-side organisation-scoped RBAC, and keep demo auth isolated to synthetic non-production data. Confirm MFA enforcement and password-reset configuration in Clerk before go-live.

See the ADRs in `docs/adr/`.

## 7. Risks and open questions

- Confirm the actual deployed API host and Vercel environment variables before changing rewrite destinations.
- Confirm which Postgres provider and connection-pooling mode are currently provisioned.
- Confirm whether Clerk production keys, MFA policy and allowed origins are configured in the deployed environment; never expose secret values.
- Confirm the organisation's intended leave year/accrual basis and whether 5.5-day schedules should count Saturday as a full or partial working day.
- Confirm sick-leave certificate workflow and pre-adoptive leave eligibility with Kenyan employment counsel.
- Decide whether the demo link should use Vercel Deployment Protection or server-side invite codes. `noindex` is not access control.
- Secret-history scanning and a full repository-wide source scan remain to be run locally.

## 8. Approval gate

Phase 0 is documented. No application code has been changed. **Wait for explicit owner approval (“go”) before starting Phase 1 implementation.**
