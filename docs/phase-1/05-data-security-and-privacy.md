# 05 — Data Security, Cryptography & ODPC Privacy Engineering

## 1. Versioned AES-256-GCM Encryption & Key Ring Rotation (`artifacts/api-server/src/lib/security.ts`)

- **Ciphertext Envelope (`enc:v2`)**: New encrypted values emit `enc:v2:<keyId>:<iv>:<authTag>:<ciphertext>` using a sanitized key ID (`PEOPLEOS_ENCRYPTION_KEY_ID`, default `"k1"`) backed by `PEOPLEOS_ENCRYPTION_KEY`.
- **Backward Compatibility & Rotation**: `getEncryptionKeyRing()` loads active keys alongside optional comma-separated `PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS` (`"k0=<secret>,..."`), allowing zero-downtime decryption of both `enc:v2` envelopes and legacy `enc:v1` ciphertexts.
- **No Silent Fallback in Production**: Whenever `NODE_ENV=production`, missing keys, short keys (`< 32` chars), known dev fragments, or key reuse matching `CLERK_SECRET_KEY`/`DATABASE_URL` fail closed cleanly.
- **Tamper & Decrypt Telemetry**: Decryption errors emit structured warning event `SECURITY_DECRYPT_FAILURE` without revealing plaintext and return the sentinel `"[ENCRYPTED_UNAVAILABLE]"` (`"[PROTECTED]"` in masked helpers).
- **Non-Destructive Key Rotation Inspection**: `inspectKeyRotationReadiness()` inventories ciphertext counts by `alreadyCurrentV2`, `eligibleLegacyV1`, `eligiblePlaintext`, and `unreadable`.

## 2. Kenya Data Protection Act 2019 (ODPC) PII Redaction & Masking

- **Structured Log Redaction (`artifacts/api-server/src/lib/logger.ts`)**: Configured Pino redaction censoring headers (`authorization`, `cookie`, `x-peopleos-role`, `x-peopleos-user-id`, `x-api-key`, `set-cookie`) and sensitive fields (`*.kraPin`, `*.nationalId`, `*.nssfNo`, `*.shaNo`, `*.bankAccount`, `*.confidentialNotes`, `*.phone`, secrets).
- **Object-Level Statutory Field Masking**: `/api/employees/:employeeId/profile-360` invokes `canViewSensitiveStatutoryIdentifiers()` to differentiate financial/social identifiers (`kraAndSocial`) from identity/emergency contacts (`nationalIdAndEmergency`) and enforces `maskKraPin`, `maskNationalId`, and `maskPhoneNumber`.
- **Audit Summary Sanitization (`sanitizeAuditSummary`)**: Strips bearer tokens, `enc:v1`/`enc:v2` ciphertexts, and KRA PIN patterns from persisted audit event summaries.

## 3. File Upload Validation & Malicious Payload Defense

`assertSafeDocumentUpload()` in `artifacts/api-server/src/lib/security.ts` and `routes/documents.ts` enforces:
- Safe basename sanitization (`sanitizeFileName` removing `..`, slashes, leading dots).
- Strict extension allowlist (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.csv`, `.docx`, `.xlsx`) matched against verified MIME types (`DOCUMENT_MIME_BY_EXT`).
- Size bounds (`1 byte` to `10 MB`).
- Header magic-byte validation (`%PDF-`, PNG header, JPEG SOI `FF D8 FF`, OOXML `PK`) when file sample bytes are supplied, plus SHA-256 content checksum computation (`checksumSha256`) stored alongside uploader attribution (`uploadedByUserId`).
