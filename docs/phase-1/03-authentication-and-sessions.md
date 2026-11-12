# 03 — Authentication & Session Architecture

## 1. Mutual Exclusion: `PEOPLEOS_AUTH_MODE=clerk | demo`

Authentication mode is resolved centrally in `artifacts/api-server/src/config/env.ts` (`resolveAuthMode`) and consumed identically by `artifacts/api-server/src/middlewares/peopleosAccess.ts`:

- **Production (`NODE_ENV=production`)**: Only `clerk` mode is valid. Setting `PEOPLEOS_AUTH_MODE=demo` or `PEOPLEOS_DEMO_AUTH=true` causes startup failure (`validateRuntimeEnvironment`). `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` are mandatory.
- **When Clerk is Active (`CLERK_SECRET_KEY` present or `PEOPLEOS_AUTH_MODE=clerk`)**:
  - `isDemoAuthPermitted()` returns `false`.
  - Any request containing simulated headers (`x-peopleos-role` or `x-peopleos-user-id`) is rejected immediately with `HTTP 403 DEMO_HEADERS_FORBIDDEN`.
  - Any cross-tenant `x-peopleos-org-id` header not matching `PEOPLEOS_ORGANIZATION_ID` is rejected with `HTTP 403 CROSS_TENANT_DENIED`.
- **Non-Production Sandbox (`PEOPLEOS_AUTH_MODE=demo`, `NODE_ENV !== "production"`, no `CLERK_SECRET_KEY`)**:
  - Explicit signed-out testing via `x-peopleos-auth: signed-out` returns `HTTP 401 UNAUTHENTICATED`.
  - Deterministic persona user IDs (`user_demo_admin_01`, `user_demo_mgr_01`, `user_demo_emp_01`, etc.) bind cleanly to fixed demo `employeeId` records (`...0007`, `...0001`, `...0002`), enabling realistic testing of self-service, reporting-line manager scoping, and IDOR boundaries.

## 2. Fail-Closed Organization Lookup

In `getPeopleOsOrganization()`:
- When `DATABASE_URL` is configured, querying `peopleos_organizations` MUST return a valid record; missing rows or database query exceptions log structured errors and return `null`, causing `ensureMembership` to respond with `HTTP 503 ORGANIZATION_UNAVAILABLE` rather than downgrading authenticated requests into a fabricated demo tenant.

## 3. Frontend Authentication Sync (`artifacts/peopleos/src/auth.tsx`)

- `DemoAuthProvider` supplies synthetic `@rekker-demo.invalid` persona headers exclusively via `setDemoAuthHeadersProvider`, synchronizes `x-peopleos-role` / `x-peopleos-user-id` cleanly with `customFetch`, and supports full client-side sign-out state propagation (`x-peopleos-auth: signed-out`) for verifiable UI access-control testing.

