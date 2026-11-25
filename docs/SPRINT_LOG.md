# PeopleOS Credibility Sprint Log

## 25 November 2026 — Phase 0 audit

- Inspected `AGENTS.md`, `replit.md`, `DEPLOYMENT.md`, root and workspace package manifests, Vercel config, CI workflow, API app/routes, leave route, leave schema, health/diagnostics route, audit service and frontend routing/navigation.
- Confirmed the root Vercel `/api/*` rewrite targets `/index.html`; Express API is described as separately hosted in deployment documentation.
- Confirmed the leave policy demo array is empty, balances derive from requests rather than a ledger, and the current schema lacks leave approval steps, attachments and ledger entities.
- Confirmed hardcoded February/March 2026 demo leave/audit fixtures.
- Confirmed `index.html` already has a robots meta tag; `vercel.json` lacks the requested `X-Robots-Tag` header and no server-side gate was found in inspected config.
- Confirmed no repository test/build/typecheck command was executed in this connector-only audit. Do not report a green baseline.
- Legal reference identified: Kenya Law official Employment Act source, sections 28, 29(8), 29A and 30; Employment (General) Rules 2014, rule 11. Legal counsel review remains required.
- **Decision:** no application code changes until explicit owner approval after Phase 0.
- **Open:** verify deployed API origin, Postgres provider, Clerk production configuration, leave-year rules and 5.5-day schedule interpretation.


## 25 November 2026: Approved implementation sprint

### Work delivered to the branch
- Added LeaveAdvisor, Kenyan statutory floors, default policy pack, effective policy snapshots, fractional leave units, leave ledger, approval steps, public holidays and audit hash-chain migration.
- Implemented manager recommendation and HR approval APIs, DB row locking, idempotent ledger source keys, transactional deductions, cancellation reversals and ledger-driven DB balances.
- Added demo/route workflow, statutory floor and weighted work-calendar tests.
- Added organisation-scoped public holiday CRUD and weighted 5/5.5/6 day schedules; holiday records are merged into work calendar calculation.
- Marked Agent Hub and ML surfaces as preview/concept; removed unverified performance claims; introduced a typed feature registry and roadmap navigation.
- Configured API base URL, production Clerk fail-closed UI, production mock-fallback shutdown, API-safe Vercel rewrite and noindex/security headers.
- Split Settings and Diagnostics, added human-readable role labels and refreshed demo date seed helpers.
- Added audit metadata/hash-chain migration, event filters, CSV export and leave-event context.
- Added docs/COMPLIANCE.md, docs/CLIENT_RESPONSE.md, docs/DEMO_SCRIPT.md and CHANGELOG.md.
- Added a PostgreSQL 16 migration smoke-test job to CI.

### Statutory decisions
- Employment Act section 28 default annual entitlement is 21 working days. Monthly accrual is 1.75 days; the termination pro-rata helper uses 1.75 days per completed leave-earning month after the two-month threshold.
- Paternity is stored as 2 weeks. Conversion into working days is not hardcoded; legal review is needed for the organisation's work schedule and policy interpretation.
- Sick leave eligibility requires two consecutive months. The statutory 7 full-pay / 7 half-pay sequence is documented in metadata but still needs tier-aware balance/approval/pay treatment.
- All Kenya default policies remain NEEDS_LEGAL_REVIEW.

### Verification status
- No local pnpm typecheck, lint, unit test, integration test or build has been executed in this connector session.
- A PostgreSQL migration smoke-test job was added to CI, but its result is pending a GitHub Actions run.
- Route-level leave workflow tests currently target demo/in-memory mode, not a provisioned PostgreSQL tenant.
- Playwright E2E, coverage thresholds, secure sick-note storage, configurable approval-chain editor, notifications and production access gate remain outstanding.

### Release / security blockers
- Confirm the real deployed API origin and Clerk/database environment values with the owner; no production endpoint is guessed.
- Vercel team authorization is pending; Deployment Protection has not been enabled or verified.
- Do not use real employee data or describe the demo as production-ready until DB-backed E2E, security review and legal review have passed.
