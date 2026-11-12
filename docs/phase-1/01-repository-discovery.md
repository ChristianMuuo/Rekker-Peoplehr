# 01 — Repository Discovery & Baseline Audit

## 1. Monorepo Architecture & Verified Toolchain

| Component / Package | Path | Verified Technology Stack & Versions |
|---|---|---|
| Workspace Orchestration | `package.json`, `pnpm-workspace.yaml` | `pnpm` workspaces, TypeScript `~5.9.3` |
| Frontend SPA | `artifacts/peopleos` | React `19.1.4`, Vite `^7.3.2`, Tailwind CSS `^4.1.14`, `@clerk/react` `^6.18.1`, `@tanstack/react-query` `^5.90.21`, `wouter` `^3.3.5`, `recharts` `^2.15.2`, `lucide-react` `^0.545.0` |
| Core Backend API | `artifacts/api-server` | Node.js ESM (`esbuild` `0.28.2` -> `dist/index.mjs`), Express `^5.3.0`, `@clerk/express` `^2.1.83`, `cors` `^2.8.6`, `pino` `^9.14.0`, `pino-http` `^10.5.0`, Drizzle ORM `^0.45.2` |
| Database & Migrations | `lib/db` | PostgreSQL `pg`, Drizzle ORM (`schema/peopleos.ts`), sequential SQL migrations (`0001..0003`) |
| API Contract & Clients | `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | OpenAPI 3.1 (`openapi.yaml`), Zod `^3.25.76` validation schemas, typed `customFetch` & React Query hooks |
| Predictive ML Engine | `services/ml-engine` | Python ML CLI & HTTP service: `numpy>=2.0.0`, `pandas>=2.2.0`, `scipy>=1.14.0`, `scikit-learn>=1.6.0`, `xgboost>=3.0.0` |

## 2. External Product Boundary Audit

Direct HTTP checks confirmed the two launched Rekker digital properties are operational outside PeopleOS:
- **`https://rekker.co.ke/`** — HTTP `200`, corporate branding showcase (`"Rekker | Manufacturing & Distribution of Kenya's Everyday Brands"`).
- **`https://shop.rekker.co.ke/`** — HTTP `200`, retail storefront (`"Shop Rekker | Saffron Milan, Bio Saff & Cornells Online"`).

**Boundary Rule Preserved:** Product catalogues, shopping carts, consumer checkout, and marketing pages are excluded from PeopleOS; the application only links outbound to those properties and registers the boundary inside `/api/admin/diagnostics` (`rekker_external_web`).

## 3. Baseline Verification & Confirmed Initial Gaps

- **Initial Test Baseline:** `pnpm --filter "@workspace/api-server" run test` ran prior to Phase 1 edits with `22/22` passing tests across `5` suites (`20820ms`), though `security-auth.test.ts` contained only in-memory boolean assertions rather than real HTTP authorization checks.
- **Confirmed P0/P1 Architectural & Security Weaknesses Identified:**
  1. `custom-fetch.ts` masked HTTP `401/403/404/500` server errors behind mock `handleFallbackApi` responses.
  2. `app.ts` configured permissive `cors({ credentials: true, origin: true })`.
  3. `peopleosAccess.ts` degraded PostgreSQL lookup failures to a fabricated `"Rekker Breweries Kenya Ltd"` demo org, and `peopleos.ts` skipped IDOR checks in demo mode plus omitted `6` enterprise roles from `/auth/context`.
  4. `security.ts` allowed silent fallback keys / key reuse from `CLERK_SECRET_KEY` or `DATABASE_URL` in production, emitted fixed `enc:v1` without key-ring metadata, and swallowed decrypt failures silently.
  5. `auditService.ts` swallowed DB errors silently (`catch {}`), risking unrecorded high-risk payroll/HR mutations.
  6. `0002_peopleos_enterprise_upgrades.sql` referenced nonexistent tables `"organizations"`/`"employees"`, and `lib/db/src/index.ts` created uncached Proxy pools without `closeDbPool()` or health checks.
  7. `routes/documents.ts` lacked MIME/size/magic-bytes validation and silently attributed missing `employeeId` uploads to `...0007`.
  8. `mpesaService.ts` fell back B2C `QueueTimeOutURL`/`ResultURL` to `rekker.co.ke` and lacked fetch timeouts.
  9. Missing `.env.example`, `.github/workflows/ci.yml`, startup config validator, Pino PII log redaction, and `/api/readyz` / `/api/admin/diagnostics`.
  10. `docker info` showed Linux Docker daemon unavailable on the Windows host, so PostgreSQL SQL migrations require manual execution in an active Postgres target environment.

