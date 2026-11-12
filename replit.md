# Rekker PeopleOS — Workspace Reference

## Product Overview

Rekker PeopleOS is an enterprise Human Resource Management and Workforce ERP platform for Rekker (`https://rekker.co.ke/` & `https://shop.rekker.co.ke/` remain external public/ecommerce properties and must not be duplicated inside PeopleOS).

## Architecture (pnpm Monorepo)

- **`artifacts/peopleos`**: React 19, Vite 7, TypeScript 5.9, Tailwind CSS v4 SPA with Rekker Crimson (`#C71D1D`) identity, Clerk auth + explicit non-production demo mode switcher, dark/light theme support, Employee 360° profiles, Kenya Payroll console, Workforce ERP & HR Cases, Agent Hub, and Admin Diagnostics (`/diagnostics`, `/settings`).
- **`artifacts/api-server`**: Express 5 API bundled via `esbuild` (`build.mjs` -> `dist/index.mjs`). Enforces fail-closed runtime config (`src/config/env.ts`), centralized RBAC + IDOR authorization (`src/lib/authorization.ts`), AES-256-GCM versioned PII encryption (`enc:v2` + legacy `enc:v1`), PII log redaction (`src/lib/logger.ts`), transactional audit persistence (`src/lib/auditService.ts`), strict CORS allowlist, `/api/healthz`, `/api/readyz`, `/api/admin/diagnostics`, Kenya payroll, Safaricom Daraja M-Pesa B2C, 11-node multi-agent orchestrator (`src/ai/`), and Python ML bridge (`src/lib/mlBridge.ts`).
- **`services/ml-engine`**: Python Scikit-learn & XGBoost engine (`cli.py`, `ml_http_server.py`) with cohort threshold validation (`ml_core/validation.py`) and 8 predictive workforce models.
- **`lib/db`**: Drizzle ORM PostgreSQL schema (`src/schema/peopleos.ts`), singleton `Pool` + `checkDbHealth`/`closeDbPool`, and migrations `0001_enterprise_hrms.sql`, `0002_peopleos_enterprise_upgrades.sql`, `0003_phase1_enterprise_foundation.sql`.
- **`lib/api-spec`, `lib/api-zod`, `lib/api-client-react`**: OpenAPI 3.1 contract, Zod schemas, React Query hooks, and fail-loud `customFetch` client.

## Key Engineering Rules

1. Leave policies MUST start empty by default (no pre-filled statutory days; HR configures organization policies explicitly).
2. All production deployments require `PEOPLEOS_AUTH_MODE=clerk`, `DATABASE_URL`, `PEOPLEOS_ENCRYPTION_KEY` (>= 32 chars), and exact `PEOPLEOS_ALLOWED_ORIGINS`.
3. Never treat real API `4xx`/`5xx` responses as fallbacks in the client; always surface `ApiError`.
4. Maintain synthetic-only demo data (`@rekker-demo.invalid`, `@example.invalid`, no real personal phones/PINs).
5. Run verification via `pnpm run typecheck`, `pnpm run test`, `pnpm run build`, and Python ML tests.
