# Rekker Trade — Environment Setup & Configuration Guide

---

## 1. Environment Variables Matrix

| Variable | Required In | Type | Example / Default | Description |
|---|---|---|---|---|
| `NODE_ENV` | All | string | `development` / `production` | Runtime mode |
| `PORT` | API Server | integer | `5000` | HTTP listen port |
| `DATABASE_URL` | API Server | string | `postgres://user:pass@host:5432/rekker` | PostgreSQL 16 connection string |
| `PEOPLEOS_AUTH_MODE` | API Server | string | `demo` / `clerk` | Authentication mode (`clerk` in production) |
| `REKKER_TRADE_DOMAIN` | Frontend | string | `trade.rekker.co.ke` | Primary B2B Trade domain |
| `MPESA_CONSUMER_KEY` | API Server | string | `...` | Safaricom Daraja Consumer Key |
| `MPESA_CONSUMER_SECRET`| API Server | string | `...` | Safaricom Daraja Consumer Secret |
| `MPESA_BUSINESS_SHORTCODE`| API Server | string | `600982` | B2B / C2B Paybill or Till number |
| `MPESA_PASSKEY` | API Server | string | `...` | Daraja STK Push Passkey |
| `OPENAI_API_KEY` | API / ML | string | `sk-...` | Optional LLM key for conversational Trade Assistant |

---

## 2. Local Development Workflow

```bash
# 1. Install all dependencies with frozen lockfile
pnpm install --frozen-lockfile

# 2. Strict monorepo typecheck
pnpm run typecheck

# 3. Run regression test suites
pnpm run test

# 4. Start local backend API server (port 5000)
pnpm --filter @workspace/api-server run start

# 5. Start local frontend development server (port 5173)
pnpm --filter @workspace/peopleos run dev
```
