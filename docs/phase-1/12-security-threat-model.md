# 12 — Security Threat Model & Mitigation Matrix

| Threat / Attack Vector | Pre-Hardening Risk | Phase 1 Control & File Anchor | Status |
|---|---|---|---|
| **Authentication Bypass via Demo Headers** | `x-peopleos-role` / `x-peopleos-user-id` risked spoofing if not explicitly gated | `PEOPLEOS_AUTH_MODE` mutual exclusion; `403 DEMO_HEADERS_FORBIDDEN` in `peopleosAccess.ts` whenever Clerk or prod mode is active | Mitigated & Tested |
| **Silent Production Downgrade to Demo Org** | DB error fell back to fabricated `"Rekker Breweries Kenya Ltd"` | `getPeopleOsOrganization()` fails closed with `null` -> `503 ORGANIZATION_UNAVAILABLE` | Mitigated |
| **Horizontal & Vertical IDOR** | Employees/managers could view colleagues' profiles/360 in demo or mismatched roles | Unconditional `canReadEmployeeProfile()` + `canViewSensitiveStatutoryIdentifiers()` in `authorization.ts` & `peopleos.ts` | Mitigated & Tested |
| **Client Error Masking (401/403/500)** | `customFetch` converted failed HTTP responses into mock 200 payloads | `custom-fetch.ts` strictly throws `ApiError` on all HTTP `4xx`/`5xx`; fallback restricted to unreachable network errors in preview mode | Mitigated & Tested |
| **Permissive Credentialed CORS** | `cors({ credentials: true, origin: true })` echoed arbitrary origins | Explicit `PEOPLEOS_ALLOWED_ORIGINS` allowlist rejecting unknown `Origin` headers with `403 CORS_ORIGIN_DENIED` (`app.ts`) | Mitigated & Tested |
| **Weak / Unrotated PII Encryption Keys** | Secret reuse from Clerk/DB, silent fallback in prod, no rotation key IDs | `enc:v2:<keyId>` key ring (`security.ts`), prod validation (`env.ts`), `SECURITY_DECRYPT_FAILURE` alerting | Mitigated & Tested |
| **Audit Trail Bypass / Silent Failure** | High-risk mutations ignored failed DB audit writes | `AuditPersistenceError` (`critical: true`) inside `db.transaction` rolls back un-audited mutations & returns `503` | Mitigated & Tested |
| **Malicious File Upload / Unattributed Record** | No MIME/magic check + defaulted missing `employeeId` to `...0007` | `assertSafeDocumentUpload()` + SHA-256 checksum + explicit `employeeId` lookup (`documents.ts`) | Mitigated & Tested |
| **Callback Leakage to Public Corporate Site** | M-Pesa B2C callbacks defaulted to `rekker.co.ke` | Removed fallback URLs; `isMpesaLiveConfigured()` requires dedicated PeopleOS URLs + 10s timeouts (`mpesaService.ts`) | Mitigated |
| **PII & Secret Exposure in Server Logs** | Sensitive headers and Kenya statutory identifiers logged | Pino `redact` filter on headers, statutory IDs, phones, confidential notes, and env secrets (`logger.ts`) | Mitigated |

