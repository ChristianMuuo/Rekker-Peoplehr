# Rekker PeopleOS — Credibility & Hardening Sprint Log

**Started:** 2026-11-25  
**Current Phase:** Phase 0 — Audit & Architecture Decisions (No Application Code Changes)  
**Target Branching Strategy:** One branch per workstream (`fix/leave-slice`, `fix/truth-labels`, `feat/real-auth-backend`, `fix/relative-demo-dates`, `feat/kenya-compliance`, `fix/ui-hygiene-and-gate`) after `'go'` approval.

---

## 1. Sprint Log Entries

### 2026-11-25 — Phase 0 Audit Completed
- Read `AGENTS.md`, `replit.md`, `DEPLOYMENT.md`, `.agents/memory/MEMORY.md`, `.agents/memory/leave-policy-defaults.md`, `.env.example`, `.github/workflows/ci.yml`, `vercel.json`, `.replit`, all 8 `package.json` files, `docs/` audit/decision files, and core frontend/backend implementation files.
- Verified current git working tree on `main`: contains uncommitted prior-session edits in `artifacts/api-server/src/routes/trade.ts` (+298 lines) and `artifacts/peopleos/src/pages/TradePage.tsx` (+816/-207 lines) from the Trade Commercial Analytics task. Left untouched during Phase 0 per strict no-code-changes rule.
- Scanned full git history for committed `.env` files and leaked secrets/API keys: **zero real secrets found** (only `.env.example` templates and intentional unit test dummy fixture `sk-proj-super-secret-openai-token-check` in commit `614165a`).
- Ran baseline verification suite:
  - `pnpm install --frozen-lockfile --offline`: lockfile intact, warns/exits 1 under pnpm v10 build-script approval (`ERR_PNPM_IGNORED_BUILDS: @clerk/shared@3.48.0, esbuild@0.28.2`).
  - `pnpm run typecheck`: PASS (0 errors across all 9 workspace packages).
  - `pnpm run lint`: FAIL (`ERR_PNPM_NO_SCRIPT`: no `lint` script configured anywhere in repo).
  - `pnpm run test`: PASS (110/110 Node tests across 12 suites in `@workspace/api-server`, running in-memory without `DATABASE_URL`; zero Playwright E2E tests exist).
  - Python ML unit tests (`services/ml-engine/tests/test_ml_engine.py`): PASS (6/6 tests in 21.502s).
  - `pnpm run build`: PASS (`api-server`, `peopleos`, `mockup-sandbox` all built cleanly).
- Ran exact grep audit across all tracked files (`git grep`): 235 total matches for `XGBoost|RAG|10 agents|Phase 4|HR_CASE_OFFICER_FULL|policies not configured|March 2026|2026-03|10 days`.
- Produced `docs/AUDIT.md` and 3 ADRs in `docs/adr/`.

### 2026-11-25 — Implementation Progress on `feature/production-ready-leave`
- Added `lib/db/src/clock.ts` (`AppClock` / Africa/Nairobi helpers), `lib/db/src/schema/productionCore.ts` (18 persistent tables for RBAC, users/sessions, work schedules, public holidays, leave types/policies/ledger/balances/approvals/attachments, hash-chained audit log, notifications, and settings), and `lib/db/migrations/0008_production_core.sql`.
- Updated `lib/db/src/seed.ts` to use relative dates from `appClock.todayNairobi()` and pre-populate Kenya statutory leave defaults (`Annual = 21`, `Sick = 14`, `Maternity = 90`, `Paternity = 14 / 2 weeks` marked `NEEDS_LEGAL_REVIEW`).
- Implemented deterministic `LeaveAdvisor` (`artifacts/api-server/src/lib/leaveAdvisor.ts`), `POST /api/leave-requests/:requestId/recommend`, `POST /api/leave-requests/:requestId/cancel`, recommendation preview in `POST /api/leave/requests/preview`, and atomic balance-validation + audit rollback handling in `POST /api/leave-requests/:requestId/decision`.
- Populated `DEMO_LEAVE_POLICIES` for `rekker-demo` in both `leave.ts` and `fallback-store.ts` (preserving empty policy behavior for fresh orgs like `org-fresh-check`), and corrected paternity entitlement from 10 days to 14 days (2 weeks, `NEEDS_LEGAL_REVIEW`).
- Replaced hardcoded `2026-03` / `March 2026` dates across `leave.ts`, `attendance.ts`, `expenses.ts`, `onboarding.ts`, `auditService.ts`, `mlFeatureAssembly.ts`, `fallback-store.ts`, `mockStore.ts`, `AttendancePage.tsx`, `RecruitmentPage.tsx`, and `LeaveCoverageAndCalendarPanel.tsx` using dynamic relative date helpers.
- Separated `DiagnosticsPage` from `SettingsPage` on `/diagnostics` vs `/settings`, hid raw `HR_CASE_OFFICER_FULL` / `EMPLOYEE_SELF_REDACTED` enums behind human-readable labels in `HrCasesPage.tsx` (`roleDisplayMap.ts`), and added truthful prototype/preview labels in `AgentHubPage.tsx`, `aiAgents.ts`, and `PredictiveMlPage.tsx`.
- Hardened public demo security (`X-Robots-Tag: noindex, nofollow, noarchive` in `vercel.json`, `Disallow: /` in `robots.txt`, optional `DEMO_PASSCODE` API gate + `/api/demo-access` in `app.ts`, `.env.example`, and `docs/COMPLIANCE.md`).
- Added ESLint configuration (`eslint.config.mjs`, `pnpm run lint`) and unit + E2E workflow tests in `artifacts/api-server/tests/leave-engine.test.ts`.

---

## 2. Explicit Conflicts & Ambiguities Flagged for Client/User

1. **Conflict — `.agents/memory/leave-policy-defaults.md` vs. Workstream A (`A2` & `A5`)**
   - *Existing Repo Rule (`.agents/memory/leave-policy-defaults.md` & `replit.md` Rule 1)*: Strictly forbids prefilling Kenyan statutory leave defaults and keeps `leave_policies` empty until HR configures them manually, which directly causes the UI to display `"Leave policies are not configured"`.
   - *Sprint Brief (Section 2.1, A2, A5)*: Explicitly instructs: *"The text 'policies not configured' must be unreachable: first-run onboarding applies the Kenya default pack; admins edit policies within statutory floors; policy changes are versioned and audited."*
   - **Proposed Resolution:** Follow the new Credibility & Hardening Sprint Brief (`A2` + `A5`) as authoritative, update `.agents/memory/leave-policy-defaults.md` when starting Workstream A, seed the Kenyan Employment Act 2007 default pack on first-run onboarding, and enforce statutory minimums via a floor validator (while allowing admins to configure higher entitlements). **Awaiting user confirmation on `'go'`.**

2. **Conflict / Decision — Uncommitted Trade Analytics Changes on `main`**
   - Working tree currently holds uncommitted edits in `artifacts/api-server/src/routes/trade.ts` and `artifacts/peopleos/src/pages/TradePage.tsx` from the preceding session (before this sprint brief arrived).
   - **Options:**
     - Option 1: Commit those Trade Analytics changes to `main` (or a dedicated branch `feat/trade-commercial-analytics`) before creating `fix/leave-slice` so Phase A sprint branches start from a clean tree.
     - Option 2: Stash or discard them if the client prefers pausing Trade features entirely until Workstreams A–F complete.
   - **Recommendation:** Commit them to a separate `feat/trade-commercial-analytics` branch (or `main` if already tested & approved — they already passed typecheck/test/build) before starting Workstream A.

3. **Decision Needed — Live Hosting Targets & Credentials**
   - ADR `0001-api-hosting.md` recommends Render / Railway / Fly.io for `api-server` + Neon/Supabase Postgres (`0002-database.md`) + Vercel `/api/*` rewrite. Confirm target provider (or whether deployment secrets will be added by the repo owner).
   - Confirm whether `services/ml-engine` should also be deployed as a small Python container or left disabled/clearly labelled `"Simulated / Offline in hosted demo"` until needed.

4. **Decision Needed — Existing Header-Based Auth Tests vs. ADR 0003 Cookie Session Auth**
   - Several existing tests (`phase1-security.test.ts`, `stage1-authorization-audit.test.ts`, `leave-calendar.test.ts`, etc.) authenticate using `x-peopleos-role` / `x-peopleos-user-id` headers in `NODE_ENV=test`.
   - **Proposed Approach:** Remove header auth completely from runtime `development`/`production` routes (only real `argon2id` + `httpOnly` cookie sessions + CSRF + TOTP MFA), and migrate tests cleanly to login-cookie helpers (plus a minimal explicit test-only helper if needed during migration).

---

## 3. Open Statutory & Legal Review Questions (Preliminary for Workstream A & E)

1. **Paternity Leave Working-Day vs. Calendar-Day Conversion (Employment Act 2007 s.29(8)):** The statute specifies *"two weeks paternity leave with full pay"*. Should companies on 5-day schedules treat 2 weeks as 14 calendar days (10 working days) or 14 working days? Marked `NEEDS_LEGAL_REVIEW`; system will store `quantity: 2, unit: 'weeks'`, display `2 weeks (14 calendar days)`, and show schedule-based conversion (`10 working days on a 5-day schedule`, `12 on a 6-day schedule`) with legal review flag.
2. **Sick Leave Certificate & Entitlement Thresholds (Employment Act 2007 s.30):** Verify exact subsection details (7 days full pay + 7 days half pay after 2 consecutive months, medical certificate requirement for incapacity).
3. **Pre-adoptive Leave (Employment Act 2007 s.29A — verify exact section number & eligibility):** 1 month with full pay; verify exact Kenyan statutory citation from Kenya Law before seeding.
4. **2026 Kenya PAYE / NSSF Year 4 / SHIF / AHL Rates:** Confirm exact NSSF Tier I/II upper limits effective Feb 2026 (`KSh 9,000` / `KSh 108,000`, max `KSh 6,480`) and pre-PAYE deductibility of NSSF, SHIF, and AHL under the Tax Laws (Amendment) Act, 2024 against primary KRA/NSSF/Kenya Law sources before Workstream E.
5. **Employment Record Retention Period (Kenya Data Protection Act 2019 & Employment Act):** Configurable per record category (5–7 years) flagged `NEEDS_LEGAL_REVIEW`.
6. **Cross-Border Data Transfers (DPA 2019 s.48–49):** Vercel frontend (CDN), Postgres host region, and optional LLM calls (`OPENAI_API_KEY`) must be documented in `docs/COMPLIANCE.md` and privacy notice, with PII redaction enforced before any external LLM call.
