# Rekker Trade — Enterprise Security, Compliance & Governance Plan

**Platform:** Rekker Trade (`trade.rekker.co.ke`)  
**Compliance Standards:** Kenya Data Protection Act 2019 (KDPA), KRA Tax Invoicing Regulations, OWASP ASVS Level 2, Strict Multi-Tenant Isolation

---

## 1. Threat Model & Mitigation Matrix (STRIDE)

| Threat Category | Potential Vulnerability | Enterprise Mitigation |
|---|---|---|
| **Spoofing** | Forged customer identities or unauthorized checkout | Clerk enterprise authentication; HMAC signed webhook callbacks; session binding |
| **Tampering** | Client tampering with carton prices or discount percentages | Zero client trust: all prices, taxes (16% VAT), and discounts recalculated server-side in `pricingEngine` |
| **Repudiation** | Denying an approved quotation or high-value purchase order | Append-only `audit_events` with SHA-256 hash chains and IP/User-Agent attribution |
| **Information Disclosure** | Retailer accessing another wholesaler's volume pricing or trade credit | Strict tenant isolation via `businessId` checks in repository layer; cross-tenant 403 blocks |
| **Denial of Service** | High-volume inventory reservation contention / checkout lockups | 15-minute reservation TTLs; optimistic concurrency; Redis/BullMQ queue worker throttling |
| **Elevation of Privilege** | Sales representative self-approving a 40% margin discount or credit limit | Maker-Checker separation of duties; executive approval required above defined discount thresholds |

---

## 2. Kenya Statutory & Commercial Compliance
1. **Kenya Data Protection Act 2019 (KDPA)**:
   - Business contact persons and employee phone numbers are treated as protected personal data.
   - PII masking (`maskKraPin`, `maskPhone`) applied across all operational reporting.
2. **KRA eTIMS Tax Compliance**:
   - Invoices generate sequential tax document numbers (`INV-2026-XXXX`).
   - 16% standard VAT breakdown computed at line-item and order totals.
3. **M-Pesa Payment Security**:
   - Webhook callbacks verified with cryptographic signature checks and idempotency keys to prevent double-crediting.
