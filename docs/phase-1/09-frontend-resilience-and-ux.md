# 09 — Frontend Fail-Loud Error Integrity, Auth State & Diagnostics UI

## 1. Eliminated Silent HTTP Error Masking (`lib/api-client-react/src/custom-fetch.ts`)

- **Confirmed P0 Fix:** Previously, `customFetch` swallowed HTTP `401/403/404/500` server errors into mock `handleFallbackApi()` success responses, hiding security denials and outages from users.
- Now:
  - ANY non-OK HTTP response (`4xx`, `5xx`, HTML 500 error pages) parses the error body and throws typed `ApiError` consistently.
  - Static preview fallback in `fallback-store.ts` executes ONLY on unreachable network failures (`TypeError`) or static SPA HTML shell rewrites when `isStaticFallbackPermitted()` is active, with pathname normalization (`new URL(raw).pathname`) and honest `static_preview` readiness indicators (`/api/readyz`, `/api/admin/diagnostics`).
  - Automatic request headers attach unique `x-correlation-id` and opt-in demo headers (`setDemoAuthHeadersProvider`).

## 2. Sanitized Demo Auth & Fixtures (`auth.tsx`, `mockStore.ts`, `fallback-store.ts`, `App.tsx`)

- Replaced realistic `@rekker.co.ke`, `@gmail.com`, `@yahoo.com`, `@outlook.com` addresses and mobile numbers across demo stores, auth personas, CSV samples, and routes with synthetic `.invalid` domains (`@rekker-demo.invalid`, `@example.invalid`), `null` / `+254 700 000 1xx` placeholders, and `DEMO-PIN-1xx` / `DEMO-ID-1xx` markers.

## 3. Administrator System Diagnostics & Integration Registry (`App.tsx`)

- Upgraded `/settings` and added `/diagnostics` route accessible to `hr_admin`, `hr_director`, `system_admin`, and `auditor`:
  - Live queries to `GET /api/readyz` and `GET /api/admin/diagnostics` with manual **Refresh probes** action (`button-refresh-diagnostics`).
  - Transparent inline error display (`error-diagnostics-probe`) on probe failure (never faked green status).
  - Subsystem Health cards (`api_server`, `postgresql_db`, `authentication`, `encryption`, `audit_sink`, `python_ml`), Configuration Warnings/Errors banners, and Integration Registry table (`Clerk Auth`, `OpenAI API`, `Safaricom Daraja B2C`, `rekker.co.ke & shop.rekker.co.ke`).

