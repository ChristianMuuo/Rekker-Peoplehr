# Rekker PeopleOS — Setup, Architecture & Deployment Guide

Enterprise AI-powered Human Capital Management platform built for Kenyan workforce operations, combining full HR modules, an 11-node (Supervisor + 10 specialists) multi-agent AI orchestrator, a Scikit-learn + XGBoost Python ML service, versioned effective-dated Kenyan statutory payroll, M-Pesa B2C integration, and strict RBAC/ODPC security controls.

---

## 1. Architecture Overview

- **`artifacts/peopleos`** — React 19 + TypeScript + Vite frontend SPA (Rekker Crimson `#C71D1D` identity, Recharts analytics, dark/light theme toggle, `Cmd/Ctrl+K` quick navigation, Employee 360° profile view).
- **`artifacts/api-server`** — Express 5 API server (`build.mjs` bundles cleanly into `dist/index.mjs`), implementing RBAC, AES-256-GCM PII encryption, ODPC field masking, sliding-window rate limiting, audit logging, Kenya payroll engine (`kenyaPayrollEngine.ts`), Safaricom Daraja M-Pesa B2C service (`mpesaService.ts`), Multi-Agent StateGraph orchestrator (`src/ai/`), and Python ML bridge (`mlBridge.ts`).
- **`services/ml-engine`** — Python Scikit-learn & XGBoost predictive engine (`cli.py` + `server.py`) providing 8 models (Attrition XGBoost, Ridge Workforce Demand Forecast, TF-IDF Candidate-Job Matching, IsolationForest Payroll & Attendance Anomaly Detection, Skills-Gap Readiness, Employee Sentiment VADER/lexicon scoring, and Performance Trends). Missing training cohorts are explicitly flagged (`INSUFFICIENT_DATA` / `SIMULATED_DEMO_BASELINE`).
- **`lib/db`** — PostgreSQL + Drizzle ORM schema (`src/schema/peopleos.ts`) and additive SQL migrations (`migrations/0001_enterprise_hrms.sql`).

---

## 2. Environment Variables

Configure these in your local shell (`.env`, never committed) and hosting provider:

### Required in Production
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`@workspace/db`) |
| `CLERK_SECRET_KEY` | Clerk backend verification key (disables demo auth bypass automatically when set) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the React frontend |
| `PEOPLEOS_ENCRYPTION_KEY` | High-entropy secret (>= 32 chars) used for AES-256-GCM PII encryption |

### Optional Integrations & AI / ML
| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enables live OpenAI LLM reasoning in Multi-Agent Orchestrator (`gpt-4o-mini` by default; falls back gracefully to deterministic tool-grounded synthesis when absent) |
| `OPENAI_MODEL` | Override LLM model name (default: `gpt-4o-mini`) |
| `PEOPLEOS_ML_URL` | HTTP endpoint of `services/ml-engine/server.py` (when omitted, `mlBridge.ts` executes `cli.py` using the local Python interpreter / `.venv`) |
| `PEOPLEOS_PYTHON_BIN` | Explicit path to Python binary for `mlBridge.ts` |
| `MPESA_CONSUMER_KEY` | Safaricom Daraja OAuth Consumer Key |
| `MPESA_CONSUMER_SECRET` | Safaricom Daraja OAuth Consumer Secret |
| `MPESA_SHORTCODE` | B2C Organization Paybill / Shortcode |
| `MPESA_INITIATOR_NAME` | Daraja B2C Initiator Name |
| `MPESA_SECURITY_CREDENTIAL` | Daraja encrypted Initiator Credential |
| `MPESA_ENV` | `sandbox` (default) or `production` |
| `PEOPLEOS_DEMO_AUTH` | Set `true` ONLY in non-production preview environments if running without Clerk |

---

## 3. Local Development Setup

### Prerequisites
- Node.js 20+ and `pnpm`
- Python 3.11+ (with virtual environment for `services/ml-engine`)
- PostgreSQL 15+ (optional for local sandbox/demo mode; required for persistent live tenancy)

### Install & Initialize

```bash
# 1. Install JavaScript/TypeScript monorepo dependencies
pnpm install

# 2. Set up Python ML engine virtualenv
python -m venv services/ml-engine/.venv
# Windows PowerShell:
services/ml-engine/.venv/Scripts/pip install -r services/ml-engine/requirements.txt
# macOS / Linux:
# services/ml-engine/.venv/bin/pip install -r services/ml-engine/requirements.txt
```

### Database Schema & Migrations

```bash
# Push schema changes directly (development)
pnpm --filter @workspace/db run push

# Or apply the enterprise SQL migration on PostgreSQL
psql "$DATABASE_URL" -f lib/db/migrations/0001_enterprise_hrms.sql

# Optional seed (synthetic demo organization; leave policies start empty by default)
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

# Node unit & HTTP API integration tests
pnpm run test

# Python ML engine unit & fairness/validation tests
services/ml-engine/.venv/Scripts/python.exe services/ml-engine/tests/test_ml_engine.py -v

# Production Vercel frontend build verification
pnpm --filter @workspace/peopleos run build
```

---

## 5. Deployment

### Frontend (Vercel)
`vercel.json` builds and deploys `artifacts/peopleos`:
- **Build Command:** `pnpm --filter @workspace/peopleos run build`
- **Output Directory:** `artifacts/peopleos/dist/public`
- **SPA Routing:** Rewrites all non-file routes to `/index.html`.
- When hosted separately from the API server, set `VITE_API_BASE_URL` (or configure API rewrites in `vercel.json`) and set `VITE_CLERK_PUBLISHABLE_KEY` in Vercel project settings. Static demo fallback works automatically if the backend API is unreachable on preview deployments.

### Backend (`artifacts/api-server`) + ML (`services/ml-engine`)
1. Deploy `artifacts/api-server/dist/index.mjs` on Render, Railway, Cloud Run, or Fly.io with `NODE_ENV=production`, `DATABASE_URL`, `CLERK_SECRET_KEY`, and `PEOPLEOS_ENCRYPTION_KEY`.
2. Deploy `services/ml-engine/server.py` (Python HTTP server) as an internal service and point `PEOPLEOS_ML_URL` on the API server to it, or bundle `services/ml-engine` + `.venv` in the same container alongside Node.js.

