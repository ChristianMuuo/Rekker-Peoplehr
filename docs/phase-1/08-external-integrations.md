# 08 — External Integrations & M-Pesa / AI Boundary Hardening

## 1. Authoritative Boundary (`rekker.co.ke` & `shop.rekker.co.ke`)

- External checks confirmed both domains return `HTTP 200` and serve Rekker corporate marketing and e-commerce storefront experiences respectively.
- PeopleOS explicitly preserves those external boundaries without duplicating catalogs, shopping carts, checkouts, or public product CMS features.

## 2. Safaricom Daraja M-Pesa B2C (`artifacts/api-server/src/lib/mpesaService.ts`)

- Hardened `isMpesaLiveConfigured()` to require ALL live secrets AND dedicated callback URLs (`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_SECURITY_CREDENTIAL`, `MPESA_INITIATOR_NAME`, `MPESA_TIMEOUT_URL`, `MPESA_RESULT_URL`).
- Removed hardcoded `"https://rekker.co.ke/api/mpesa/timeout"` and `"https://rekker.co.ke/api/mpesa/result"` fallback URLs so payroll callbacks never target the public corporate site.
- Added `AbortSignal.timeout(10_000)` timeouts on both OAuth token requests and B2C payout POST requests, and decoupled network payouts from holding PostgreSQL row locks across transactions.

## 3. Python ML Engine & AI Hub Boundaries

- `health.ts` actively inspects `PEOPLEOS_ML_URL` (`/healthz` HTTP probe) or local `services/ml-engine/cli.py` availability cleanly in `/api/readyz` and `/api/admin/diagnostics`.
- `OPENAI_API_KEY` remains strictly server-side; absence activates transparent tool-grounded deterministic synthesis without failing core HRMS workflows.

