# Rekker PeopleOS — Application Security & Kenyan Statutory Compliance Audit

## 1. Statutory Alignment: Kenya Data Protection Act 2019 (ODPC)

| Section / Principle | Implementation Details in Rekker PeopleOS | Audit Status |
|---|---|---|
| **Section 25 (Principles of Data Protection)** | Purpose limitation enforced; employee records are never exported or repurposed for commercial retail operations. | **Compliant** |
| **Section 31 (Data Protection Impact Assessment)** | RAG text sanitization (`sanitizeRagText`) strips PII, National IDs, and PINs before sending context to external LLM providers. | **Compliant** |
| **Section 41 (Security Safeguards & Encryption)** | Sensitive fields (`nationalIdNumber`, `bankAccountNumber`, `kraPin`) are encrypted using **AES-256-GCM** with unique IVs. | **Compliant** |
| **Section 42 (Notification of Breaches)** | All administrative modifications, privilege escalations, and bulk exports emit immutable events to `peopleos_audit_log`. | **Compliant** |
| **Right of Access (Section 26)** | Self-service portal (`/self-service`) enables employees to inspect personal employment history, leave balances, and payslips directly. | **Compliant** |

---

## 2. Cryptographic Security Standards

1. **Symmetric Encryption Key Ring**:
   - `PEOPLEOS_ENCRYPTION_KEY`: 256-bit high-entropy secret required in production.
   - Algorithm: `aes-256-gcm` authenticated encryption with 96-bit random initialization vectors (IV) and 128-bit authentication tags.
   - Zero-downtime key rotation supported via key version identifier (`PEOPLEOS_ENCRYPTION_KEY_ID=k1`).
2. **PII Masking**:
   - National ID: masked to `XXXXXX1234`
   - KRA PIN: masked to `AXXXXXXXXX`
   - Bank Account Number: masked to `••••••••5678`
   - Full plaintext is only returned when an authorized HR Administrator explicitly requests it with audit logging.

---

## 3. Financial & Operational Controls

1. **Maker-Checker Segregation of Duties**:
   - Any payroll run prepared by a user (`prepared_by_user_id`) cannot be approved by the same user.
   - Any solo approval attempt returns `403 Forbidden` (`MAKER_CHECKER_VIOLATION`), unless explicitly overridden in emergency sandboxes via `PEOPLEOS_ALLOW_SOLO_APPROVE=true`.
2. **Double-Entry General Ledger Balance**:
   - Total Debits must equal Total Credits on every generated payroll journal (`SUM(debits) === SUM(credits)`). Check constraints prevent unbalanced runs from closing.
3. **M-Pesa B2C Automated Safeguards**:
   - Phone numbers strictly validated against Kenyan MSISDN regex (`^(?:254|\+254|0)?(7|1)\d{8}$`).
   - M-Pesa disbursements require both Maker-Checker signoff AND explicit two-step confirmation.
