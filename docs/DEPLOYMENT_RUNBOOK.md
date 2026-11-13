# Rekker PeopleOS — Production Deployment Runbook

**Scope:** Release Engineering, Environment Configuration, Health Probes & Rollback Operations  
**Version:** 1.0.0 (Phase 6 Production Release)  
**Target Environments:** Staging (`staging.peopleos.rekker.co.ke`), Production (`peopleos.rekker.co.ke`)  

---

## 1. Environment Configuration & Variable Specification

Rekker PeopleOS validates all environment variables on boot via Zod schema enforcement (`artifacts/api-server/src/lib/env.ts`). If any required variable is missing or malformed, the process fails fast with an explanatory exit code.

### Required Production Variables

| Variable Name | Description | Example / Format | Required |
|---|---|---|---|
| `NODE_ENV` | Application environment mode | `production` | **YES** |
| `PORT` | API server HTTP listen port | `3001` or `8080` | **YES** (Default 3001) |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/peopleos` | **YES** |
| `ENCRYPTION_KEY` | AES-256-GCM column encryption key | 32-byte hex / base64 string | **YES** |
| `JWT_SECRET` | Session token signing secret | High-entropy secret (>= 32 chars) | **YES** |
| `CLERK_SECRET_KEY` | Clerk authentication backend secret | `sk_live_...` | Optional (if Clerk active) |
| `CLERK_PUBLISHABLE_KEY` | Clerk frontend publishable key | `pk_live_...` | Optional (if Clerk active) |

### Enterprise Integration & External Service Variables

| Variable Name | Description | Default / Fallback |
|---|---|---|
| `MPESA_ENVIRONMENT` | Daraja environment (`sandbox` or `live`) | `sandbox` |
| `MPESA_CONSUMER_KEY` | Safaricom Daraja Consumer Key | Required for live payout |
| `MPESA_CONSUMER_SECRET` | Safaricom Daraja Consumer Secret | Required for live payout |
| `MPESA_SHORTCODE` | B2C Disbursement Shortcode | Required for live payout |
| `MPESA_PASSKEY` | Daraja Passkey | Required for live payout |
| `OPENAI_API_KEY` | OpenAI LLM integration key | Optional (Agent falls back to deterministic rules) |
| `PEOPLEOS_ALLOW_SOLO_APPROVE` | Dev bypass for payroll self-approval | **Strictly blocked in production** |

---

## 2. Build & Startup Commands

### Step 1: Install Dependencies
```bash
pnpm install --frozen-lockfile
```

### Step 2: Set Up Python ML Virtual Environment
```bash
cd services/ml-engine
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m unittest discover -s tests
cd ../..
```

### Step 3: Run Monorepo Typecheck & Test Verification
```bash
# Verify static typing across all packages
pnpm run typecheck

# Execute comprehensive Phase 6 test suite
pnpm --filter @workspace/api-server run test
```

### Step 4: Build Production Artifacts
```bash
# Build the unified monorepo (API server + Vite frontend)
pnpm run build
```

This compiles:
- Node API Server: `artifacts/api-server/dist/index.mjs`
- Vite Client UI: `artifacts/peopleos/dist/` (served statically by API server in production)

### Step 5: Start Production Server
```bash
NODE_ENV=production pnpm --filter @workspace/api-server run start
```

---

## 3. Observability & Health Probes

PeopleOS provides lightweight, unauthenticated health probes designed for Kubernetes, AWS ECS, GCP Cloud Run, and load balancer health checks.

```
+-------------------------------------------------------+
|                 Health Probe Architecture             |
|                                                       |
|  GET /health   --> Fast 200 OK (Process Liveness)     |
|  GET /ready    --> Verifies DB connection & Migrations|
|  GET /health/database --> DB Latency & Pool Stats     |
|  GET /health/ml       --> Python Engine Status        |
+-------------------------------------------------------+
```

### 1. Liveness Probe (`GET /health` or `GET /healthz`)
- **Purpose:** Verifies the Express event loop is responding.
- **Expected Status:** `200 OK`
- **Response Payload:**
  ```json
  {
    "status": "healthy",
    "service": "peopleos-api",
    "timestamp": "2026-11-13T12:00:00.000Z",
    "uptimeSeconds": 1420.5
  }
  ```

### 2. Readiness Probe (`GET /ready` or `GET /readyz`)
- **Purpose:** Verifies application is ready to accept user traffic (database reachable).
- **Expected Status:** `200 OK` (or `503 Service Unavailable` if database down).

### 3. Database Deep Probe (`GET /health/database`)
- **Purpose:** Tests database connection pool, latency, and read query execution.
- **Expected Status:** `200 OK` with latency metrics (zero credentials leaked).

### 4. ML Engine Probe (`GET /health/ml`)
- **Purpose:** Verifies Python subprocess bridge and registered model status.
- **Expected Status:** `200 OK` with active model count and status (`online` / `degraded`).

---

## 4. Zero-Downtime Deployment Procedure

For Kubernetes, Docker Swarm, or Cloud Run:

1. **Trigger Rolling Deployment:** Deploy new container image tagged with commit hash.
2. **Kubernetes Readiness Gate:** New pods route traffic only after `/ready` probe returns `200 OK`.
3. **Old Pod Drain:** Old pods terminate gracefully after fulfilling in-flight HTTP connections (`terminationGracePeriodSeconds: 30`).
4. **Post-Deployment Verification:** Execute Smoke Test Suite against the active endpoint.

---

## 5. Post-Deployment Smoke Test Protocol

Run immediately against the newly deployed environment:

```bash
# 1. Check Liveness
curl -f https://peopleos.rekker.co.ke/health || exit 1

# 2. Check Readiness
curl -f https://peopleos.rekker.co.ke/ready || exit 1

# 3. Check ML Health
curl -f https://peopleos.rekker.co.ke/health/ml || exit 1

# 4. Check Frontend Static Assets
curl -f -I https://peopleos.rekker.co.ke/ | grep "HTTP/.* 200" || exit 1
```

---

## 6. Rollback & Failover Procedures

If smoke tests fail or critical P1 alarms fire:

1. **Immediate Traffic Cutback:** Point load balancer to previous known stable revision (`image:v5.x` or previous ECS task definition).
2. **Database Rollback Safety:**
   - Migration `0007_phase6_enterprise_hardening.sql` added indexes only (`CREATE INDEX IF NOT EXISTS`). It introduced **zero destructive schema changes**.
   - Rolling back code to Phase 5 binary requires **zero database schema rollbacks**. The indexes remain valid and accelerate existing queries.
3. **Post-Mortem Log Capture:**
   - Export container stdout logs and `peopleos_audit_log` records from the failed deployment window for forensic triage.

