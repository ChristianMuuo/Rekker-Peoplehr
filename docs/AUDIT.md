# Rekker PeopleOS (Rekker PeopleHR) — Technical Audit & Baseline

**Audit Date:** 2026-11-25  
**Repository:** `https://github.com/ChristianMuuo/Rekker-Peoplehr`  
**Branch Audited:** `main` (commit `4dc4c1f` + uncommitted prior-session Trade analytics edits in `artifacts/api-server/src/routes/trade.ts` and `artifacts/peopleos/src/pages/TradePage.tsx`)  
**Phase:** Phase 0 — Read-Only Audit (zero application code modified)

---

## 1. Architecture Map

### 1.1 Monorepo Packages & Apps (`pnpm-workspace.yaml`)
| Package / Directory | Stack & Runtime | Purpose |
|---|---|---|
| `artifacts/peopleos` | React 19.1, Vite 7.3, Tailwind CSS v4, Wouter, TanStack React Query, Recharts, Lucide, `@clerk/react` | Main SPA frontend (`dist/public`) |
| `artifacts/api-server` | Node.js 22/24, Express 5.3, Pino, CORS, `@clerk/express`, `esbuild` -> `dist/index.mjs` | Backend REST API (19 route modules) |
| `artifacts/mockup-sandbox` | React + Vite + Radix UI | Isolated UI component preview workspace |
| `lib/db` | Drizzle ORM (`drizzle-orm` + `pg` + `drizzle-kit`), 7 SQL migrations (`0001`–`0007`) | PostgreSQL schema (`src/schema/*.ts`) & seed script (`src/seed.ts`) |
| `lib/api-spec` | OpenAPI 3.1 YAML + `orval` | API contract & codegen config |
| `lib/api-zod` | Zod v4 generated validators | Request/response schemas & inferred types |
| `lib/api-client-react` | React Query hooks, `customFetch` (`src/custom-fetch.ts`), offline static store (`src/fallback-store.ts`) | Generated client + static Vercel fallback |
| `services/ml-engine` | Python 3.11–3.14, scikit-learn, XGBoost, NumPy, FastAPI/HTTP (`cli.py`, `ml_http_server.py`) | 8 statistical/ML workforce tasks |
| `scripts` | TypeScript (`tsx`) | Monorepo utility scripts |

### 1.2 Frontend Routes & Pages (`artifacts/peopleos/src/App.tsx`)
All routes render inside Wouter `<Switch>` in `App.tsx`:
- **Public / Auth**: `/` (`AppHomeRedirect` / `Home`), `/sign-in/*?`, `/sign-up/*?`
- **Primary Nav**: `/overview` (`OverviewPage`), `/dashboard` (redirects `/overview`), `/self-service` (`SelfServicePage`), `/people` (`PeoplePage`), `/people/:employeeId` (`EmployeePage`), `/organization` (`OrganizationPage`), `/leave` (`LeavePage`), `/approvals` (`ApprovalsPage`)
- **People Operations Nav**: `/recruitment` (`RecruitmentPage`), `/onboarding` (`OnboardingPage`), `/attendance` (`AttendancePage`), `/payroll` (`PayrollPage`), `/expenses` (`ExpensesPage`), `/assets` (`AssetsPage`), `/performance` (`PerformancePage`), `/learning` (`LearningPage`), `/documents` (`DocumentsPage`), `/ml` (`PredictiveMlPage`), `/reports` (`ReportsPage`)
- **Workforce ERP & Relations Nav**: `/workforce-erp` (`WorkforceErpPage`), `/hr-cases` (`HrCasesPage`)
- **Governance & Admin Nav**: `/agent-hub` & `/ai` (`AgentHubPage`), `/audit` (`AuditPage`), `/diagnostics` (`SettingsPage` — **duplicated!**), `/settings` (`SettingsPage` — **same component!**)
- **Standalone B2B Portal**: `/trade` (`TradePage` — custom full-screen header outside sidebar layout)

### 1.3 Backend API Surface (`artifacts/api-server/src/routes/index.ts`)
Mounted under `/api` in `artifacts/api-server/src/app.ts` (plus top-level `GET /health` & `GET /healthz`):
- `health.ts`: `/health`, `/healthz`, `/ready`, `/readyz`, `/health/database`, `/health/ml`, `/admin/diagnostics`
- `peopleos.ts`: `/auth/context`, `/security/status`, `/agent-provider/status`, `/peopleos/overview`, `/departments`, `/employees`, `/leave/*` legacy + `/peopleos/work-calendars`
- `leave.ts`: `/leave-requests`, `/leave-policies`, `/leave-balances`, `/approvals`, `/leave-requests/:requestId/decision`, `/leave/department-coverage`, `/leave/calendar`, `/leave/requests/preview`
- `audit.ts`: `/audit-events`
- `phase2CoreHr.ts`: Employee 360, bulk CSV import, org chart, positions, lifecycle, self-service corrections, privacy requests
- `payroll.ts`, `attendance.ts`, `recruitment.ts`, `onboarding.ts`, `performance.ts`, `learning.ts`, `documents.ts`, `expenses.ts`, `assets.ts`, `hrCases.ts`, `workforceErp.ts`, `ai.ts`, `ml.ts`, `trade.ts`

### 1.4 Data Layer & Dual-Mode Architecture
- `lib/db/src/schema/` defines Drizzle PostgreSQL tables across 7 files (`peopleos.ts`, `hrOperations.ts`, `phase2CoreHr.ts`, `phase4WorkforceErp.ts`, `phase5AiGovernance.ts`, `rekkerTrade.ts`).
- **Critical Gap**: Almost every API service and route (`leave.ts`, `peopleos.ts`, `payroll.ts`, `auditService.ts`, `phase2MemoryStore.ts`, `workforceErpMemoryStore.ts`, etc.) checks `if (!process.env.DATABASE_URL)` and silently falls back to mutable process-memory arrays (`DEMO_LEAVE_STORE`, `DEMO_EMPLOYEES_LIST`, etc.).
- `lib/db/src/seed.ts` has hardcoded October/November 2026 dates (`demoTime`) and does **not** seed leave types, leave policies, work schedules, holidays, or auth users.

### 1.5 Authentication & Authorization
- **Frontend (`artifacts/peopleos/src/auth.tsx`)**: Uses Clerk only if `VITE_CLERK_PUBLISHABLE_KEY` is a valid `pk_` key and `VITE_PEOPLEOS_AUTH_MODE !== 'demo'`. Otherwise falls back to `DemoAuthProvider`, storing `'admin' | 'manager' | 'employee'` in `localStorage` and injecting `x-peopleos-user-id` and `x-peopleos-role` headers on API requests.
- **Backend (`artifacts/api-server/src/middlewares/peopleosAccess.ts`)**: Rejects `demo` mode if `NODE_ENV=production`; in non-production without `CLERK_SECRET_KEY`, trusts `x-peopleos-role` and `x-peopleos-user-id` headers directly. There is **no** password login (`argon2id`), no session cookie store, no CSRF token middleware, no login rate-limiting/lockout, and no admin TOTP MFA in-app.

### 1.6 Deployment & Root Cause: Why Diagnostics Reports API Unreachable
- **Vercel (`vercel.json`)**:
  - Builds only `artifacts/peopleos` (`pnpm --filter @workspace/peopleos run build` -> `artifacts/peopleos/dist/public`).
  - Rewrites `"/api/(.*)" -> "/index.html"` and `"/(.*)" -> "/index.html"`.
  - No `VITE_API_BASE_URL` is configured, and no Express serverless or containerized API host is connected.
- **Replit (`.replit`)**:
  - Configured with `deploymentTarget = "autoscale"` for Replit, decoupled from Vercel.
- **Root Cause Trace**:
  1. On Vercel (`rekker-peoplehr-*.vercel.app`), calling `GET /api/admin/diagnostics` or `GET /api/readyz` hits Vercel's `/api/(.*)` rewrite and returns `index.html` (`200 text/html`).
  2. `customFetch` (`lib/api-client-react/src/custom-fetch.ts:420-445`) detects `isHtmlResponse || isVercelMissingBackend` and, because `isStaticFallbackPermitted()` defaults to `true` when `VITE_API_BASE_URL` and `VITE_PEOPLEOS_STRICT_API` are unset, invokes `handleFallbackApi()` (`lib/api-client-react/src/fallback-store.ts`).
  3. `fallback-store.ts:1261-1306` returns hardcoded `"Disconnected (Browser Static Mode)"` (`"Backend API unreachable; displaying static preview fixtures."`) and `status: "static_preview"`.
  4. Furthermore, `App.tsx:469-470` mounts the **exact same** `SettingsPage` component on both `/settings` and `/diagnostics`.

---

## 2. Feature Inventory

Status Definitions:
- **live**: Real backend endpoint + persisted database storage across restarts (when `DATABASE_URL` is set)
- **partial**: Backend route / some DB tables exist, but relies on in-memory fallbacks, incomplete workflows, or static browser store on Vercel
- **static**: Hardcoded client arrays / browser-only fallback data
- **concept**: UI claims capabilities (e.g. autonomous StateGraph / vector RAG / trained attrition ML) not backed by real production data or real execution on deployed demo

| Feature / Module | Nav / UI Location | Status | Gaps & File Evidence |
|---|---|---|---|
| **Leave Policies & Balances** | Primary Nav: `Leave` (`/leave`), `Self Service` | **partial (broken UX)** | Policies start empty (`leave.ts:55`, `fallback-store.ts:88-96`), triggering `"Leave policies are not configured"` (`App.tsx:1036`). Missing `leave_types`, `leave_ledger`, `recommended` stage, `LeaveAdvisor`, cancellation reversal, certificates, half-days, and statutory floor validator. Paternity hardcoded as `10 days` (`leave.ts:125`, `fallback-store.ts:79`). |
| **Leave Calendar & Coverage** | `/leave` (`LeaveCoverageAndCalendarPanel.tsx`) | **partial** | Real endpoint `/api/leave/calendar` (`leave.ts:1431`), but panel defaults to March 2026 (`LeaveCoverageAndCalendarPanel.tsx:85-86`) and relies on in-memory store without DB. |
| **Approvals Inbox** | Primary Nav: `Approvals` (`/approvals`) | **partial** | Only 1-step `pending -> approved/rejected` in `App.tsx:1100-1123` and `leave.ts:1234`. Lacks `recommended` stage, `LeaveAdvisor` advisory, optimistic concurrency version, and ledger deduction. |
| **Employees & 360 Profile** | Primary Nav: `People` (`/people`, `/people/:id`) | **partial** | Drizzle schema + `/api/employees` (`peopleos.ts`, `phase2CoreHr.ts`), but falls back to `DEMO_EMPLOYEES_LIST` / `fallback-store.ts` without Postgres. |
| **Organization Chart & Positions** | Primary Nav: `Organization` (`/organization`) | **partial** | Express routes + DB tables (`phase2CoreHr.ts`), static fallback on Vercel. |
| **Audit Trail** | Governance Nav: `Audit trail` (`/audit`) | **partial** | `peopleos_audit_events` + `auditService.ts`, but lacks `before_json`/`after_json`, hash chain (`prev_hash`, `hash`), IP/UA/requestId, DB privilege lockout on UPDATE/DELETE, filters, and CSV export (`App.tsx:1125-1140`). |
| **Settings vs Diagnostics** | Governance Nav: `Settings` (`/settings`), `Diagnostics` (`/diagnostics`) | **partial (bug)** | Both routes render identical `SettingsPage` (`App.tsx:469-470`). Missing dedicated organization/holiday/policy/security Settings CRUD and true live service Diagnostics. |
| **Kenya Payroll & M-Pesa** | Operations Nav: `Payroll` (`/payroll`), `Reports` (`/reports`) | **partial** | Real engine (`kenyaPayrollEngine.ts`), Maker-Checker (`payroll.ts`), **but** defaults active rule to 2025 NSSF Phase 3 (`8,000/72,000`) instead of 2026 Year 4 (`9,000/108,000`) with deductible SHIF/AHL; `fallback-store.ts` `calcKenyaFallback` omits tax deductibility; M-Pesa is `SANDBOX_SIMULATION`; March 2026 hardcoded. |
| **HR Cases** | Workforce ERP Nav: `HR Cases` (`/hr-cases`) | **partial** | Real privacy boundary logic (`hrCases.ts`), but leaks raw enum `"HR_CASE_OFFICER_FULL"` directly into UI (`HrCasesPage.tsx:58`, `fallback-store.ts:253`). |
| **Workforce ERP ("Phase 4")** | Workforce ERP Nav: `Workforce ERP` (`/workforce-erp`) | **partial / over-claimed** | Displays `"Phase 4 · Enterprise ERP"` (`WorkforceErpPage.tsx:332`), DB tables in `phase4WorkforceErp.ts`, heavy reliance on `workforceErpMemoryStore.ts` & `fallback-store.ts`, `2026-03` defaults. Should be demoted to Roadmap/Preview until verified or clearly badged. |
| **AI Agent Hub** | Governance Nav: `Agent hub` (`/agent-hub`) | **concept / misleading** | Claims `"10 specialist HR intelligence agents"`, `"StateGraph Supervisor"`, `"RAG policy search"` (`AgentHubPage.tsx:25,129,292`, `orchestrator.ts:47`, `peopleos.ts:1635`). Reality: keyword router (`classifyIntentToAgent`), 6 hardcoded string entries (`HR_POLICIES` in `tools.ts:34`), optional single-shot OpenAI call, and browser canned fallback `processAgentQuery()` (`aiAgents.ts:174`). |
| **ML Intelligence ("XGBoost")** | Operations Nav: `ML intelligence` (`/ml`) | **partial / simulated** | Python `engine.py` actually runs `XGBClassifier`, `Ridge`, `IsolationForest`, `TfidfVectorizer`, **but** trains attrition on synthetic `rng` baseline whenever `<20` real exits (`engine.py:18,107`), `/api/ml/overview` (`ml.ts:246-270`) returns hardcoded metrics (`cvRocAuc: 0.84`), and Vercel displays static browser fallback (`fallback-store.ts:1462`). |
| **Recruitment, Onboarding, Attendance, Expenses, Assets, Performance, Learning, Documents** | People Operations Nav | **partial** | Mix of Drizzle tables and in-memory stores; contain hardcoded `2026-03` / `March 2026` dates (`attendance.ts`, `expenses.ts`, `onboarding.ts`, `recruitment.ts`, `AttendancePage.tsx`, `RecruitmentPage.tsx`, `fallback-store.ts`). |
| **Rekker Trade B2B Portal** | `/trade`, sidebar `trade.rekker` | **partial (uncommitted WIP)** | Standalone portal (`TradePage.tsx`, `trade.ts`); currently has uncommitted Commercial Analytics work in working tree. In-memory fallback without DB. |
| **Public Demo Protection** | `/`, `index.html`, `robots.txt`, `vercel.json` | **partial / insecure** | `index.html:8` has `noindex, nofollow`, `robots.txt` only blocks some paths (`Disallow: /overview`, allows `/careers`, misses many routes), **`vercel.json` sends no `X-Robots-Tag` header**, and there is **zero server-side passcode / deployment gate**. |

---

## 3. Grep Audit Report

Exact command run: `git grep -n -E "XGBoost|RAG|10 agents|Phase 4|HR_CASE_OFFICER_FULL|policies not configured|March 2026|2026-03|10 days"`  
Total matching lines: **235**

### 3.1 Summary Counts by Search Term
| Search Term | Exact Hits | Follow-up Variant Hits | Key Locations |
|---|---|---|---|
| `XGBoost` | 38 | — | `AgentHubPage.tsx:25`, `PredictiveMlPage.tsx:82,119,132,179`, `aiAgents.ts:111,113`, `orchestrator.ts:95,96,562`, `ml.ts:242,245`, `health.ts:209`, `peopleos.ts:1636`, `fallback-store.ts:1462`, `services/ml-engine/ml_core/engine.py:188`, `docs/**` |
| `RAG` | 39 | — | `AgentHubPage.tsx:25,382,449`, `aiAgents.ts:133`, `orchestrator.ts:110`, `tools.ts:138`, `peopleos.ts:1635,1636`, `fallback-store.ts:553`, `lib/db/src/schema/phase5AiGovernance.ts:154`, `tests/**`, `docs/**` |
| `10 agents` | 0 | `10-Agent` / `10 specialist` / `10-Specialist` (11 hits) | `AgentHubPage.tsx:25,129,292`, `aiAgents.ts:1,34`, `orchestrator.ts:47`, `peopleos.ts:1635,1636`, `fallback-store.ts:551,552`, `docs/**` |
| `Phase 4` | 29 | — | `WorkforceErpPage.tsx:332`, `kenyaPayrollEngine.ts:20,21,107`, `tests/enterprise-hrms.test.ts:49,59,62`, `tests/peopleos-upgrades.test.ts:210`, `tests/phase4-workforce-erp.test.ts:20`, `lib/db/migrations/0005_*.sql:1`, `docs/**` |
| `HR_CASE_OFFICER_FULL` | 4 | — | `artifacts/api-server/src/routes/hrCases.ts:106,159`, `lib/api-client-react/src/fallback-store.ts:253`, `artifacts/api-server/tests/peopleos-upgrades.test.ts:144` (rendered in `HrCasesPage.tsx:58`) |
| `policies not configured` | 0 | `"Leave policies are not configured"` (1 hit) | `artifacts/peopleos/src/App.tsx:1036` (and `"Phase not configured"` at `App.tsx:1368`) |
| `March 2026` | 22 | — | `aiAgents.ts:83`, `mockStore.ts:120,1138,1206`, `ReportsPage.tsx:65`, `LeaveCoverageAndCalendarPanel.tsx:84`, `fallback-store.ts:610,1009,1091,1098,1108`, `orchestrator.ts:288`, `tools.ts:603`, `payroll.ts:158,166,1206,1228,1286,1315`, `tests/enterprise-hrms.test.ts:111,122`, `tests/leave-calendar.test.ts:53` |
| `2026-03` | 106 | — | `attendance.ts:68-166`, `expenses.ts:51-92`, `hrCases.ts:59,60`, `leave.ts:91-130`, `onboarding.ts:52`, `recruitment.ts:159`, `trade.ts:418-1724`, `workforceErp.ts:481`, `auditService.ts:32,44`, `mlFeatureAssembly.ts:361-364`, `salesTerritoryService.ts:158,260`, `workforceErpMemoryStore.ts:439,717,736`, `fallback-store.ts:77-1164`, `mockStore.ts:560-812`, `AttendancePage.tsx:15`, `RecruitmentPage.tsx:46`, `lib/db/migrations/0005_*.sql:170`, `lib/db/src/schema/phase4WorkforceErp.ts:332`, `services/ml-engine/tests/test_ml_engine.py:82-85`, `artifacts/api-server/tests/**` |
| `10 days` | 1 | `days: 10` (paternity hits) | `mockStore.ts:620` (`"Approved 10 days annual leave"`), plus paternity `days: 10` in `artifacts/api-server/src/routes/leave.ts:125` and `lib/api-client-react/src/fallback-store.ts:79` |

*(Full line-by-line hits captured in session verification output and tracked cleanly per file above.)*

---

## 4. Baseline Verification Results (2026-11-25)

| Check | Command | Result | Details & Failures |
|---|---|---|---|
| **Install / Lockfile** | `pnpm install --frozen-lockfile --offline` | **WARN / Exit 1** | Lockfile up-to-date; fails under pnpm v10 strict build approval: `ERR_PNPM_IGNORED_BUILDS` (`@clerk/shared@3.48.0`, `esbuild@0.28.2`). `node_modules` already present. |
| **Typecheck** | `pnpm run typecheck` | **PASS (0 errors)** | Checked all 9 projects (`libs`, `api-server`, `peopleos`, `mockup-sandbox`, `scripts`). |
| **Lint** | `pnpm run lint` | **FAIL (Missing)** | `ERR_PNPM_NO_SCRIPT`: No `lint` script exists in root `package.json` or workspace packages; no ESLint config present. |
| **Node Tests** | `pnpm run test` | **PASS (110/110)** | 12 suites via `tsx --test tests/**/*.test.ts` in `@workspace/api-server` (82.88s). **Limitation:** Runs in-memory with `DATABASE_URL` unset; zero DB integration assertions against real Postgres; zero Playwright E2E tests (`playwright` not installed). |
| **Python ML Tests** | `services/ml-engine/.venv/Scripts/python.exe -m unittest discover -s services/ml-engine/tests -v` | **PASS (6/6)** | Ran 6 tests in 21.50s cleanly. |
| **Production Build** | `pnpm run build` | **PASS** | `api-server` (`dist/index.mjs` 3.6MB), `peopleos` (`dist/public`), `mockup-sandbox` (`dist`). |

---

## 5. Proposed Architectural Decisions (ADRs) & Next Steps

Three ADRs have been authored in `docs/adr/`:
1. **[docs/adr/0001-api-hosting.md](adr/0001-api-hosting.md)** — Vercel static SPA + same-origin `/api/(.*)` rewrite proxying to a single persistent Node 22 container (Render / Railway / Fly.io), removing Replit sleep dependence and disabling browser static fallback in deployed demos.
2. **[docs/adr/0002-database.md](adr/0002-database.md)** — Managed PostgreSQL (Neon / Supabase / Render Postgres) + Drizzle ORM + sequential SQL migrations, enforcing `DATABASE_URL` in deployed environments, append-only `leave_ledger` & hash-chained `audit_log` with DB privilege locks.
3. **[docs/adr/0003-auth.md](adr/0003-auth.md)** — First-party `argon2id` password auth + `httpOnly; Secure; SameSite=Lax` DB session cookies + CSRF protection + login lockout + mandatory admin TOTP MFA + server-side demo passcode gate (keeping Clerk optional for future enterprise SSO).

### Branch & Execution Roadmap (Post-Audit)
Upon proceeding into implementation on branch **`feature/production-ready-leave`**:
1. **Phase 1 & 2 (Core DB, Auth Foundation & Leave End-to-End)**: Postgres migrations + ledger + Kenyan statutory defaults (`21` annual, `7+7` sick, `3 months` maternity, `2 weeks` paternity, `1 month` pre-adoptive) + floor validator + deterministic `LeaveAdvisor` + atomic approval/deduction/audit/cancellation + real cookie auth + RBAC.
2. **Phase 3–5 (Truth Labels, Audit Filters, AI Transparency)**: Typed feature registry + `scripts/check-claims` + relabel concepts/roadmap + functional `LeaveAdvisor` & grounded Policy Q&A.
3. **Phase 6–8 (Independent Settings & Diagnostics, Relative Clock/Dates, UI/UX Hygiene)**: Separate `/diagnostics` live probe page from `/settings` admin config; injectable `Africa/Nairobi` Clock abstraction; dynamic demo seed; UI enum mapper (`HR_CASE_OFFICER_FULL` -> `"HR Case Officer"`).
4. **Phase 9–11 (QA Suite, Public Demo Gate, Handover Docs)**: ESLint + Vitest/node unit + Postgres integration + Playwright E2E (Tests 1–10 + UI crawl) + `X-Robots-Tag` + server passcode gate + `COMPLIANCE.md`, `CLIENT_RESPONSE.md`, `DEMO_SCRIPT.md`, `CHANGELOG.md`.
