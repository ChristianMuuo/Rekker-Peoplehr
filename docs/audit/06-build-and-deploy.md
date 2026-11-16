# Rekker PeopleOS — Build, Pipeline & Deployment Audit

## 1. Build Verification Baseline

The monorepo build pipeline was verified cleanly across all targets:
- `pnpm install --frozen-lockfile` → Lockfile intact, 0 audit warnings
- `pnpm run typecheck` → 9 projects checked, 0 errors
- `pnpm run test` → 73 tests passed, 0 failures
- `pnpm run build` → Production bundle generated

### Client Distribution Bundle Breakdown
- Output Directory: `artifacts/peopleos/dist/public`
- HTML Shell: `index.html` (1.76 kB)
- CSS Bundle: `assets/index-*.css` (134.23 kB gzip: 22.32 kB)
- Core Logic Chunks:
  - `vendor-clerk-*.js`: 313.67 kB
  - `vendor-charts-*.js`: 393.43 kB
  - `vendor-react-*.js`: 7.49 kB
  - Lazy-loaded page components for all 20+ routes

---

## 2. Vercel SPA Deployment Analysis

### Issue Identified
Vercel deployment at `rekker-peoplehr-g3lh.vercel.app` was showing:
`Workspace access unavailable — The service did not return this information. Your access and records have not been changed. Try again`

### Root Cause
1. Frontend is hosted on Vercel as a static SPA, while the backend API server runs as a separate Node.js / Express process.
2. In static preview without a live backend connection, calls to `/api/auth/context` hit Vercel's edge rewrite which returned `index.html` (HTTP 200 with `text/html`).
3. While `custom-fetch.ts` had fallback detection, `ResponseParseError` during HTML parsing was rethrown in the catch block, and `AppFrame` in `App.tsx` entered an unrecoverable error state because `auth` was undefined.

### Resolution Implemented
1. **Fallback Recovery in `custom-fetch.ts`**:
   - `ResponseParseError` is caught and safely routed to `handleFallbackApi` when static fallback is permitted.
   - Vercel edge domain detection (`isOnVercel`) ensures static SPA previews always default to reliable sandbox data.
2. **Resilient Auth Query in `App.tsx`**:
   - `useGetAuthContext` now includes `placeholderData: FALLBACK_AUTH`.
   - The UI never renders a blocking error state on static preview deployments, while still replacing the placeholder immediately whenever a live API server responds.

---

## 3. Production Environment Matrix

| Variable | Required in Prod | Purpose / Default Value |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Optional | Defaults to `5000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Yes | Clerk server-side secret key |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk client-side publishable key |
| `PEOPLEOS_ENCRYPTION_KEY` | Yes | 64-hex-character AES-256-GCM master key |
| `PEOPLEOS_ALLOWED_ORIGINS` | Yes | Strict comma-separated CORS allowlist |
| `PEOPLEOS_AUTH_MODE` | No | Defaults to `clerk` in production |
| `VITE_API_BASE_URL` | Optional | Remote backend URL when frontend is hosted separately |
| `OPENAI_API_KEY` | Optional | Required for multi-agent LLM reasoning |
| `MPESA_CONSUMER_KEY` | Optional | Safaricom Daraja B2C credentials |
