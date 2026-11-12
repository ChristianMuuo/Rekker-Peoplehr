# 11 — CI/CD Pipeline & Environment Governance

## 1. GitHub Actions Workflow (`.github/workflows/ci.yml`)

Added automated continuous integration running on `push` (`main`, `phase-1/**`) and `pull_request` (`main`) with two verification jobs:

- **`verify-monorepo` (Node 22, pnpm 10)**:
  1. `pnpm install --frozen-lockfile`
  2. `pnpm run typecheck` (libs, scripts, `artifacts/api-server`, `artifacts/peopleos`, `artifacts/mockup-sandbox`)
  3. `pnpm run test` (`NODE_ENV=test`, `PEOPLEOS_AUTH_MODE=demo`)
  4. `pnpm --filter "@workspace/peopleos" run build`
  5. `pnpm run build`
- **`verify-python-ml` (Python 3.12)**:
  1. `pip install -r services/ml-engine/requirements.txt`
  2. `python -m unittest services/ml-engine/tests/test_ml_engine.py -v`

## 2. Fail-Closed Environment Validation (`.env.example` & `src/config/env.ts`)

- Added `.env.example` documenting all required and optional environment variables (`NODE_ENV`, `PORT`, `PEOPLEOS_AUTH_MODE`, `PEOPLEOS_ALLOWED_ORIGINS`, `PEOPLEOS_TRUST_PROXY`, `DATABASE_URL`, `CLERK_*`, `PEOPLEOS_ENCRYPTION_KEY*`, `MPESA_*`, `OPENAI_*`, `PEOPLEOS_ML_*`, `VITE_*`).
- Production startup refuses `PEOPLEOS_AUTH_MODE=demo`, wildcard CORS `*`, missing `DATABASE_URL`, missing Clerk secrets, or missing/weak/reused encryption keys.
