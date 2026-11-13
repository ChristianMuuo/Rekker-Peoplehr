# Rekker PeopleOS — Phase 5: Feature Assembly & Tenant Data Lineage

## 1. Zero Synthetic Data in Production

In earlier development iterations, client endpoints or agent tools could fall back to hardcoded demo lists (`DEMO_EMPLOYEES_LIST`).

Phase 5 replaces this with a strictly governed **Server-Side Feature Assembly Service** (`mlFeatureAssembly.ts`):
1. **Tenant-Scoped DB Extraction**: Queries live tables (`peopleos_employees`, `payroll_items`, `attendance_records`, `leave_requests`, `goalsTable`) filtered by the authenticated `organizationId`.
2. **Strict Injection Defense**: In production (`NODE_ENV === "production"`), all client-supplied feature payloads in HTTP request bodies are discarded. The backend always extracts features directly from database records.
3. **Explicit Data Provenance**:
   - `live_tenant_data`: Extracted directly from authorized tenant persistence.
   - `synthetic_development_fixture`: Permitted solely in local development or test suites when `x-peopleos-test-fixture: true` is present.
   - `insufficient_data`: When the tenant lacks the minimum sample threshold (e.g. <1 employee, <4 payroll records, <3 attendance punches).

---

## 2. PII Stripping and Privacy by Design

Prior to transmitting any payload to the Python ML engine:
- **Stripped Identifiers**: National ID numbers, KRA PINs, NSSF numbers, SHIF numbers, bank account details, personal emails, and telephone numbers are completely omitted.
- **Masked Names**: Full employee names are sanitized to first name and last initial (e.g., `Achieng O.`).
- **Feature Standardization**: Features are transformed into statistical ratios (e.g., compensation vs. department median, overtime hours, tenure in months, contract expiration flags).

---

## 3. Sample Thresholds and `INSUFFICIENT_DATA` Handling

| Task | Minimum Required Records | Action when Below Threshold |
| :--- | :--- | :--- |
| `attrition` | 1 valid employee record | Returns `status: "insufficient_data"`, `analyticsMode: "INSUFFICIENT_DATA"` |
| `workforce_forecast` | 3 historical monthly points | Returns `status: "insufficient_data"`, `forecast: []` |
| `candidate_match` | 1 candidate + job description | Returns `status: "insufficient_data"`, `rankings: []` |
| `payroll_anomalies` | 4 payroll run records | Returns `status: "insufficient_data"`, `anomalies: []` |
| `attendance_anomalies`| 3 punch records | Returns `status: "insufficient_data"`, `anomalies: []` |
| `skills_gap` | 1 employee record | Returns `status: "insufficient_data"`, `gaps: []` |
| `sentiment` | 1 feedback / leave reason | Returns `status: "insufficient_data"`, `entries: []` |
| `performance_trends` | 1 active goal record | Returns `status: "insufficient_data"`, `goalTrends: []` |

The platform **never fabricates predictions** when data is insufficient.
