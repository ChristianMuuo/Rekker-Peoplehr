# Rekker PeopleOS — Setup, Architecture & Deployment Guide

Enterprise AI-powered Human Capital Management and Workforce ERP foundation platform tailored for Kenyan operations (`https://rekker.co.ke/` & `https://shop.rekker.co.ke/` remain authoritative externally).

---

## 1. Architecture Overview

- **`artifacts/peopleos`** — React 19 + TypeScript + Vite SPA preserving the Rekker Crimson `#C71D1D` identity, Recharts visualizations, dark/light theme support, `Cmd/Ctrl+K` quick navigation, Employee 360° profile view, System Diagnostics (`/diagnostics`), and strict error boundaries (`custom-fetch.ts` never hides real HTTP `4xx`/`5xx` server errors).
- **`artifacts/api-server`** — Express 5 modular backend (`build.mjs` bundles cleanly into `dist/index.mjs`), with fail-closed startup configuration (`src/config/env.ts`), centralized RBAC & IDOR object permissions (`src/lib/authorization.ts`), AES-256-GCM key-ring encryption (`enc:v2` + legacy `enc:v1` rotation support), ODPC PII masking & log redaction, strict CORS origin allowlisting, X-Correlation-Id propagation, sliding-window rate limiting, fail-closed critical audit persistence (`AuditPersistenceError`), Kenya payroll engine (`kenyaPayrollEngine.ts`), Safaricom Daraja M-Pesa B2C service (`mpesaService.ts`), Multi-Agent orchestrator (`src/ai/`), Python ML bridge (`mlBridge.ts`), and `/api/healthz`, `/api/readyz`, `/api/admin/diagnostics`.
- **`services/ml-engine`** — Python Scikit-learn & XGBoost predictive engine (`cli.py` + `ml_http_server.py`) providing 8 models (Attrition XGBoost, Ridge Workforce Demand Forecast, TF-IDF Candidate-Job Matching, IsolationForest Payroll & Attendance Anomaly Detection, Skills-Gap Readiness, Sentiment Lexicon Scoring, and Performance Trends). Missing training cohorts are explicitly flagged (`INSUFFICIENT_DATA` / `SIMULATED_DEMO_BASELINE`).
- **`lib/db`** — PostgreSQL + Drizzle ORM schema (`src/schema/peopleos.ts`), cached connection pool with health probes & graceful `closeDbPool()`, and sequential SQL migrations (`0001_enterprise_hrms.sql`, `0002_peopleos_enterprise_upgrades.sql`, `0003_phase1_enterprise_foundation.sql`).

---

## 2. Environment Variables

Copy `.env.example` to `.env` for local development (never commit `.env`):

### Required in Production (`NODE_ENV=production`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`@workspace/db`) |
| `PEOPLEOS_AUTH_MODE` | Explicitly set `clerk` in production (`demo` is rejected at startup in production) |
| `CLERK_SECRET_KEY` | Clerk backend verification key |
| `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` | Clerk frontend/backend publishable key |
| `PEOPLEOS_ENCRYPTION_KEY` | Independent high-entropy secret (`>= 32` chars) for AES-256-GCM PII encryption |
| `PEOPLEOS_ALLOWED_ORIGINS` | Comma-separated exact HTTPS origins permitted for credentialed CORS (no `*` wildcard) |

### Optional Key Ring, Security, Integrations & ML
| Variable | Purpose |
|---|---|
| `PEOPLEOS_ENCRYPTION_KEY_ID` | Active encryption key version ID (default `k1`) |
| `PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS` | Historical key IDs for seamless zero-downtime key rotation (`k0=<secret>,legacy=<secret>`) |
| `PEOPLEOS_TRUST_PROXY` | Reverse proxy trust setting (`false`, `true`, or hop integer) for accurate `req.ip` rate limiting |
| `OPENAI_API_KEY` | Enables live OpenAI LLM reasoning in Multi-Agent Orchestrator (`gpt-4o-mini` by default) |
| `OPENAI_MODEL` | Override LLM model name (default: `gpt-4o-mini`) |
| `PEOPLEOS_ML_URL` | HTTP endpoint of `services/ml-engine/ml_http_server.py` (when omitted, falls back to local `cli.py`) |
| `PEOPLEOS_PYTHON_BIN` | Explicit path to Python binary for `mlBridge.ts` |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_INITIATOR_NAME`, `MPESA_SECURITY_CREDENTIAL` | Safaricom Daraja OAuth & B2C disbursement credentials |
| `MPESA_TIMEOUT_URL`, `MPESA_RESULT_URL` | Dedicated PeopleOS M-Pesa callback endpoints (never route callbacks to public website domains) |
| `MPESA_ENV` | `sandbox` (default) or `production` |

---

## 3. Local Development Setup

### Prerequisites
- Node.js 20+ (CI verified on Node 22) and `pnpm` 10+
- Python 3.11+ (with virtual environment for `services/ml-engine`)
- PostgreSQL 15+ (optional locally when using `PEOPLEOS_AUTH_MODE=demo`; mandatory for live database persistence and migrations)

### Install & Initialize

```bash
# 1. Install JavaScript/TypeScript monorepo dependencies
pnpm install --frozen-lockfile

# 2. Set up Python ML engine virtualenv
python -m venv services/ml-engine/.venv
# Windows PowerShell:
services/ml-engine/.venv/Scripts/pip install -r services/ml-engine/requirements.txt
# macOS / Linux:
# services/ml-engine/.venv/bin/pip install -r services/ml-engine/requirements.txt
```

### Database Schema & Migrations

```bash
# Development push via Drizzle Kit
pnpm --filter @workspace/db run push

# Production sequential SQL migrations on PostgreSQL
psql "$DATABASE_URL" -f lib/db/migrations/0001_enterprise_hrms.sql
psql "$DATABASE_URL" -f lib/db/migrations/0002_peopleos_enterprise_upgrades.sql
psql "$DATABASE_URL" -f lib/db/migrations/0003_phase1_enterprise_foundation.sql

# Optional seed (synthetic @rekker-demo.invalid workspace; leave policies start empty by default)
pnpm --filter @workspace/db run seed
```

### Run Backend & Frontend

```bash
# Build workspace packages and API server
pnpm run build

# Start API server (default port 5000)
node artifacts/api-server/dist/index.mjs

# Start Vite dev server (default port 5173)
pnpm --filter @workspace/peopleos run dev
```

---

## 4. Verification Commands

```bash
# Full TypeScript check across libs, api-server, frontend, scripts
pnpm run typecheck

# Node unit & HTTP API integration tests (including Phase 1 security suite)
pnpm run test

# Python ML engine unit & fairness/validation tests
services/ml-engine/.venv/Scripts/python.exe services/ml-engine/tests/test_ml_engine.py -v

# Production frontend & full monorepo build verification
pnpm --filter "@workspace/peopleos" run build
pnpm run build
```

---

## 5. Deployment

### Frontend (Vercel)
`vercel.json` builds and deploys `artifacts/peopleos`:
- **Build Command:** `pnpm --filter @workspace/peopleos run build`
- **Output Directory:** `artifacts/peopleos/dist/public`
- **SPA Routing:** Rewrites all non-file routes to `/index.html`.
- When hosted separately from the API server, set `VITE_API_BASE_URL` and `VITE_CLERK_PUBLISHABLE_KEY` in hosting settings. Unreachable GET requests to `/api/*` may render explicit static preview data ONLY when network connection fails and opt-in demo fallback is active; real `4xx`/`5xx` server errors always surface loudly.

### Backend (`artifacts/api-server`) + ML (`services/ml-engine`)
1. Deploy `artifacts/api-server/dist/index.mjs` on Render, Railway, Cloud Run, or Fly.io with `NODE_ENV=production`, `PEOPLEOS_AUTH_MODE=clerk`, `PEOPLEOS_ALLOWED_ORIGINS`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `PEOPLEOS_ENCRYPTION_KEY`.
2. Deploy `services/ml-engine/ml_http_server.py` (Python HTTP server) as an internal service and point `PEOPLEOS_ML_URL` on the API server to it, or bundle `services/ml-engine` + `.venv` alongside Node.js.
3. Point container health probes to `GET /api/healthz` (liveness) and `GET /api/readyz` (readiness).
