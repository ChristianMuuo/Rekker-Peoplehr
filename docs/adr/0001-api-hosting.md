# ADR 0001: API Hosting & Vercel Same-Origin Proxy

**Date:** 2026-11-25  
**Status:** Proposed (Phase 0)  
**Supersedes / Updates:** `docs/decisions/0001-hosting.md`

---

## Context

Currently, `vercel.json` deploys only the `artifacts/peopleos` React/Vite SPA (`artifacts/peopleos/dist/public`) and rewrites **all** routes — including `/api/(.*)` — directly to `/index.html`:

```json
{ "source": "/api/(.*)", "destination": "/index.html" }
```

Meanwhile, `.replit` defines an `autoscale` target (`deploymentTarget = "autoscale"`), and `DEPLOYMENT.md` assumes a separate container runtime (`artifacts/api-server/dist/index.mjs`) configured via `VITE_API_BASE_URL` and `PEOPLEOS_ALLOWED_ORIGINS`. Because neither `VITE_API_BASE_URL` nor a hosted backend URL is wired on Vercel, every browser call to `/api/*` receives Vercel's HTML shell (`200 text/html`), causing `customFetch` (`lib/api-client-react/src/custom-fetch.ts`) to fall back to `handleFallbackApi()` (`lib/api-client-react/src/fallback-store.ts`), which returns hardcoded `"Disconnected (Browser Static Mode)"` diagnostics.

---

## Options Considered

| Option | Description | Trade-offs |
|---|---|---|
| **A. Vercel SPA + Same-Origin `/api` Rewrite to Single Managed Container (Render / Railway / Fly.io)** *(Recommended)* | Keep `artifacts/peopleos` static SPA on Vercel; host `artifacts/api-server` (`dist/index.mjs`) on a single persistent Node 22 container service (Render, Railway, or Fly.io). Configure `vercel.json` to proxy `/api/(.*)` -> `https://<api-host>/api/$1` (same-origin from the browser's perspective). | **Pros:** Zero CORS complexity on Vercel; `httpOnly; SameSite=Lax` cookies work natively on same origin; preserves persistent PostgreSQL connection pooling, long-running payroll/CSV jobs, M-Pesa webhooks, and Drizzle migrations; works identically to Vite's local `/api` dev proxy (`artifacts/peopleos/vite.config.ts`). **Cons:** Two deploy targets (Vercel + 1 container host) instead of 1; free-tier container hosts can sleep unless keep-alive or low-cost always-on tier is used. |
| **B. Vercel Serverless Functions (`api/[...route].ts`) wrapping Express** | Adapt `artifacts/api-server/src/app.ts` to run inside a Vercel Node Serverless Function alongside the SPA. | **Pros:** Single Vercel deployment, zero extra vendor. **Cons:** Cold starts, ephemeral `/tmp`, short execution timeouts, PostgreSQL connection-pool exhaustion without an HTTP/pooler driver, and Python ML (`services/ml-engine`) cannot bundle XGBoost/scikit-learn reliably inside Vercel's 250 MB function limit. |
| **C. Single Full-Stack Container Serving Both API & Static SPA** | Serve `artifacts/peopleos/dist/public` from Express on Render/Railway/Cloud Run and point DNS there instead of Vercel. | **Pros:** Simplest topology (one process). **Cons:** Discards the existing Vercel deployment URL and Vercel CDN/Preview workflows that the client already uses. |

---

## Proposed Decision

Adopt **Option A (Vercel SPA + Same-Origin `/api/*` Proxy Rewrite to Persistent Node 22 Container)**.

1. Deploy `artifacts/api-server` (`pnpm run build` -> `node artifacts/api-server/dist/index.mjs`) on a single always-on or fast-boot Node 22 container service (Render / Railway / Fly.io), with `/healthz` and `/readyz` health checks.
2. Replace the broken `"source": "/api/(.*)" -> "/index.html"` rewrite in `vercel.json` with a proxy rewrite to the hosted API origin (or `VITE_API_BASE_URL` for cross-origin fallback, with `PEOPLEOS_ALLOWED_ORIGINS` strictly matching the Vercel domain).
3. Remove any dependency on a sleeping Replit autoscale instance, while retaining `.replit` config untouched unless requested otherwise.
4. Disable silent static fallback (`fallback-store.ts`) in deployed demo/production builds (`VITE_PEOPLEOS_STRICT_API=true`), so API failures fail loudly instead of masquerading as data.
5. For `services/ml-engine` (optional Python ML), keep it decoupled behind `PEOPLEOS_ML_URL` on a separate internal service when needed; the core TypeScript API does **not** require Python running to boot or pass `/readyz`.

---

## Consequences

- Browser requests stay same-origin (`/api/*`), enabling strict `httpOnly` + `Secure` + `SameSite=Lax` session cookies without third-party cookie blocking.
- The existing `pnpm` monorepo and `esbuild` bundle (`dist/index.mjs`) require zero structural changes.
- Requires provisioning one Node container service (e.g., Render / Railway) and setting the rewrite URL + env secrets.
