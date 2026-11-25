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
