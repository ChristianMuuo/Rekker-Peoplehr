# Rekker Trade — Integration Strategy & Boundary Guidelines

**Primary Principle:** Connect through clean, resilient, external adapters — NEVER share direct databases or duplicate consumer ecommerce functionality.

---

## 1. External System Matrix

| External Boundary | Host / URL | Integration Method | Shared Database? | Status |
|---|---|---|---|---|
| **Rekker Consumer Storefront** | `https://shop.rekker.co.ke/` | Read-only REST product/inventory sync adapter | ❌ **Strictly No** | Active adapter |
| **Rekker Corporate Website** | `https://rekker.co.ke/` | Outbound links & brand catalog references | ❌ **Strictly No** | Active adapter |
| **Safaricom Daraja B2B/C2B** | Safaricom API Gateway | HTTPS OAuth 2.0 + STK Push & Webhook receiver | N/A | Implemented (Sandbox & Live) |
| **KRA eTIMS Tax Engine** | KRA Electronic Tax System | HTTPS signed JSON payload adapter | N/A | Architecture defined |
| **Rekker PeopleOS (HRMS)** | Internal Monorepo Module | In-process service call (`employeeId` lookup for sales reps) | ✅ Monorepo Schema | Active Integration |

---

## 2. Integration Safety Guarantees
1. **Idempotency Keys:** Every outbound payment and inbound order hook carries an idempotency key to prevent duplicate ledger transactions.
2. **Circuit Breakers:** If an external partner API times out or fails 5 consecutive times, the adapter opens its circuit breaker, returns degraded fallback status, and logs a critical operational alert.
3. **No Synthetic Mock Data in Production:** In production mode (`NODE_ENV=production`), missing external credentials fail fast and loudly rather than substituting mock transactions.
