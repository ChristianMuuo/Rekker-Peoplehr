# ADR 0001: Separation of Frontend SPA (Vercel) and Backend API / ML Runtime

## Status
Accepted

## Context
Rekker PeopleOS consists of three execution tiers:
1. **Frontend Client**: React 19 Single Page Application built with Vite and Tailwind CSS.
2. **Backend API Server**: Node.js 22 + Express 5 runtime responsible for long-running transactional workloads (statutory payroll calculations, bulk CSV imports, Safaricom Daraja M-Pesa webhooks, AES-256-GCM encryption, connection pool management).
3. **ML Inference Service**: Python 3.12 FastAPI microservice executing scikit-learn and XGBoost models for workforce attrition and shift demand forecasting.

When deployed to Vercel, serverless function limits and ephemeral execution environments present challenges:
- Vercel's serverless edge timeouts (10s on hobby tiers, 60s on pro) interrupt bulk import validation and end-of-month payroll runs.
- Webhook endpoints for Safaricom Daraja M-Pesa require persistent, deterministic IP addresses and continuous socket availability.
- The Python ML engine requires a native C++ compile toolchain for XGBoost and persistent memory for model weights, which cannot run inside Vercel's standard Node-focused frontend build pipelines.

## Decision
1. **Frontend on Vercel**: Deploy the React Vite SPA as a high-performance static asset bundle on Vercel (`rekker-peoplehr-g3lh.vercel.app`), leveraging Vercel's global CDN and edge routing.
2. **Backend on Long-Running Container Service**: Deploy the Express API server and Python ML engine to a persistent container runtime (Google Cloud Run, AWS ECS/Fargate, Railway, or Render).
3. **Resilient Vercel Preview Handling**: For static preview environments without a live backend connection:
   - `vercel.json` rewrites `/api/(.*)` to `/index.html`.
   - `custom-fetch.ts` and `fallback-store.ts` detect the unhosted backend environment and safely serve deterministic sandbox data.
   - The UI displays an explicit indicator that sandbox preview mode is active, preventing accidental confusion with production.
   - In production (`NODE_ENV=production`), `VITE_API_BASE_URL` points to the containerized Express API endpoint, and fallback mock behavior is strictly disabled (`VITE_PEOPLEOS_STRICT_API=true`).

## Consequences
- **Positive**: Frontend deployments remain fast, cheap, and decoupled from backend releases.
- **Positive**: Backend retains full control over database connection pools, cron triggers, and CPU-intensive ML tasks.
- **Negative**: Requires managing two deployment targets instead of one unified platform.
