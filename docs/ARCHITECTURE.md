# Rekker PeopleOS — System Architecture

## Monorepo Layout
- `artifacts/peopleos`: React 19 + Vite frontend SPA (Tailwind CSS, React Query, Wouter).
- `artifacts/api-server`: Express 5 + Node.js 22+ API server (`routes/leave.ts`, `routes/leaveAdmin.ts`, `routes/auth.ts`, `routes/audit.ts`, `routes/health.ts`, etc.).
- `artifacts/mockup-sandbox`: Isolated component preview app.
- `lib/db`: Drizzle ORM schemas (`peopleos.ts`, `productionCore.ts`, etc.), SQL migrations (`0001`–`0008`), `AppClock` (`clock.ts`), and `PGlite` re-export for integration testing.
- `lib/api-zod` & `lib/api-client-react`: OpenAPI Zod contracts, React Query hooks, and static fallback resilience (`fallback-store.ts`).
- `services/ml-engine`: Python 3.12+ FastAPI/CLI service for ML tasks (optional external service; UI labels disconnected state honestly).

## Core Guarantees
1. **Atomic Leave Lifecycle**: `apply → recommend (advisory only) → approve → balance deducted → audit entry` + `cancel` reversal. Balance is never deducted on recommendation or rejection.
2. **Kenyan Statutory Compliance**: Paternity leave defaults to 14 calendar days (2 weeks under Employment Act 2007 s.29(8), marked `NEEDS_LEGAL_REVIEW` in `docs/COMPLIANCE.md`). All dates render in `Africa/Nairobi` (UTC+3).
3. **Security & Privacy**: Native `argon2id` + `HttpOnly` cookie sessions (`peopleos_sid`), CSRF tokens, role-based access control, KDPA 2019 medical/HR-case redaction, `noindex` headers, and optional `DEMO_PASSCODE` gate (`/access`).
