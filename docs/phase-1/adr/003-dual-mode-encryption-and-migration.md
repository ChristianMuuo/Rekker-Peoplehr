# ADR 003: Dual-Mode Encryption Versioning & Key Ring Migration Strategy

- **Status:** Accepted (Phase 1 Foundation)
- **Date:** 2026-11-11
- **Context:** `artifacts/api-server/src/lib/security.ts` previously emitted unversioned/fixed `enc:v1:<iv>:<tag>:<cipher>` ciphertexts, derived production encryption keys from `CLERK_SECRET_KEY` or `DATABASE_URL`, silently fell back to `DEFAULT_DEV_KEY` in production if unconfigured, and swallowed decryption failures without telemetry.
- **Decision:** Introduce key-ring versioning `enc:v2:<keyId>:<iv>:<tag>:<ciphertext>` via `PEOPLEOS_ENCRYPTION_KEY`, `PEOPLEOS_ENCRYPTION_KEY_ID` (default `k1`), and comma-separated `PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS` (`k0=<secret>,...`). Strictly preserve decryption compatibility for legacy `enc:v1:...` ciphertexts across keys in the key ring, prohibit default/derived/reused keys in `NODE_ENV=production` (failing closed at startup via `validateRuntimeEnvironment`), emit structured `SECURITY_DECRYPT_FAILURE` warnings returning `[ENCRYPTED_UNAVAILABLE]` on tamper/mismatch, and expose `inspectKeyRotationReadiness()` for non-destructive dry-run migration audits.
- **Consequences:** Guarantees Kenya Data Protection Act 2019 (ODPC) confidentiality with zero-downtime key rotation and zero silent production downgrade to weak keys.
