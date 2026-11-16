# Rekker PeopleOS — Engineering & Agent Working Agreement

Welcome to **Rekker PeopleOS**, the enterprise HRMS and AI-powered Workforce ERP tailored for Rekker Limited (Kenya).

---

## 1. System Architecture Overview

The repository is organized as a strict pnpm monorepo:

```
Rekker-Peoplehr/
├── artifacts/
│   ├── api-server/         # Node.js 22 + Express 5 API server
│   ├── peopleos/           # React 19 + Vite frontend (SPA)
│   └── mockup-sandbox/     # Isolated component preview environment
├── lib/
│   ├── api-client-react/   # Generated React Query hooks & fallback store
│   ├── api-zod/            # OpenAPI schemas & Zod validators
│   └── db/                 # Drizzle ORM schema, migrations, connection pool
├── services/
│   └── ml-engine/          # Python 3.12 FastAPI service (scikit-learn, XGBoost)
├── docs/                   # Architecture, audit, and operations documentation
└── .github/                # GitHub Actions CI and PR templates
```

---

## 2. Standing Rules for All Agents and Engineers

1. **Preserve Working Features**: Never remove or rewrite working functionality. Do not recreate e-commerce or customer catalog features already hosted on `rekker.co.ke` or `shop.rekker.co.ke` — connect through external adapters only.
2. **Respect the Stack**: Maintain the existing pnpm monorepo, Express 5, React 19, Drizzle ORM, and OpenAPI-generated contract workflow. Contract-first: edit OpenAPI specs, regenerate clients, never hand-edit generated code.
3. **Quality Gates**: Zero `any`, zero `@ts-ignore`. Before reporting work complete, all code must pass:
   - `pnpm install --frozen-lockfile`
   - `pnpm run typecheck`
   - `pnpm run test`
   - `pnpm run build`
4. **Data Integrity**: Schema alterations must be executed via Drizzle migrations. Currency must use integer minor units (e.g. cents/cents in KES) or strict decimals, never IEEE floating-point numbers. Store timestamps in UTC; format and display in `Africa/Nairobi` (EAT / UTC+3).
5. **Security & Kenyan Law**: All endpoints must enforce tenant isolation, RBAC middleware, and ODPC (Office of the Data Protection Commissioner) PII masking under the Kenya Data Protection Act 2019. Sensitive operations (salaries, disbursements, disciplinary actions) require immutable audit logging and dual-control Maker-Checker approvals.
6. **No Mock Fallbacks in Production**: Synthetic seed data is strictly isolated to development/sandbox modes (`PEOPLEOS_AUTH_MODE=demo`). In production (`NODE_ENV=production`), missing database or backend connectivity must fail loudly and securely.
7. **AI & ML Governance**: Autonomous AI agents (StateGraph Supervisor + 10 Specialists) only advise on decisions; high-consequence operations require human approval. No employee PII or statutory records may be leaked to third-party model providers.
8. **Brand Identity**: Preserve the official Rekker visual language with Rekker Crimson (`#C71D1D`), neutral warm stone grays, and accessible typography (DM Sans / Inter).

---

## 3. Essential Commands

```bash
# Install dependencies with locked versions
pnpm install --frozen-lockfile

# Strict TypeScript check across entire monorepo
pnpm run typecheck

# Execute all Node.js regression test suites
pnpm run test

# Execute Python ML engine unit tests
python -m unittest discover -s services/ml-engine/tests

# Build production bundles
pnpm run build

# Start local API server (port 5000)
pnpm --filter @workspace/api-server run start

# Start local frontend dev server (port 5173)
pnpm --filter @workspace/peopleos run dev
```

---

## 4. Branching & PR Strategy

- **Stage / Prompt branches**: `chore/stage-00-audit-and-stabilise`, `feat/stage-01-authorization`, etc.
- **Pull Requests**: Every PR must use `.github/pull_request_template.md` with verified test output attached.
