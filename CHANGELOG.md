# Changelog

## 2026-11-25: PeopleOS credibility sprint (unreleased)

### Added
- Kenya default leave policy pack with statutory source metadata and legal-review flags.
- Deterministic Rule-based LeaveAdvisor with reasons and rules fired.
- Leave ledger, approval-step history, effective policy snapshots and append-only audit hash-chain migration.
- Manager recommendation and separate HR approval APIs; transactional ledger deductions and cancellation reversals.
- Organisation-scoped public holiday management and weighted weekday calendars (5, 5.5 and 6 days).
- Route-level leave workflow, statutory floor and work-calendar unit tests.
- Typed feature maturity registry, preview labels and roadmap navigation.
- Audit filters and CSV export.
- Compliance notes, client response and leave demo walkthrough documentation.

### Changed
- Demo leave, audit and main seed dates now derive from the current date in the inspected seed paths.
- Production auth and API fallback fail closed when required configuration is missing.
- Vercel SPA fallback no longer captures `/api/*`; noindex and baseline security headers are emitted.
- Settings and Diagnostics now have separate page content.
- Agent Hub and ML descriptions no longer claim unverified live agents, RAG, XGBoost or fabricated evaluation metrics.

### Not yet verified / outstanding
- No production deployment, PostgreSQL-backed API E2E or Playwright browser E2E has been verified.
- Vercel Deployment Protection is pending team access authorization.
- Sick-leave certificate storage and full pay-tier treatment, notification delivery, coverage thresholds and legal approval remain outstanding.
