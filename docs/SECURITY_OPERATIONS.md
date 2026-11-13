# Rekker PeopleOS — Security Operations & Threat Defense Guide

**Scope:** Enterprise Security Architecture, Access Control, Data Privacy & Incident Response  
**Version:** 1.0.0 (Phase 6 Production Release)  
**Classification:** Internal Operational Guide  

---

## 1. Authentication Architecture

Rekker PeopleOS implements a multi-layered authentication perimeter designed to operate seamlessly in both enterprise federated identity environments and zero-trust standalone deployments.

```
Incoming Request
       |
       v
+-------------------------------+
|  Express Authentication Gate  |
|   (artifacts/api-server)      |
+---------------+---------------+
                |
     +----------+----------+
     |                     |
     v                     v
[ Clerk JWT Bearer ]   [ Local Dev/API Token ]
- Validates signature   - Fallback for headless CLI/testing
- Extracts user ID      - Strictly gated by NODE_ENV & secret
- Fetches metadata      - Scoped to authenticated tenant
     |                     |
     +----------+----------+
                |
                v
+-------------------------------+
|  Authenticated User Context   |
|  - userId                     |
|  - organizationId             |
|  - roles & permissions        |
+-------------------------------+
```

### Authentication Token Handling
- **Primary Auth Provider:** Clerk Authentication via standard `Authorization: Bearer <token>` or session cookies.
- **Header Propagation:** The API server extracts and validates `x-user-id`, `x-organization-id`, and `x-user-roles` in authenticated sessions.
- **Fail-Closed Gatekeeper:** If identity cannot be established or verified, endpoints reject requests immediately with `401 Unauthorized` prior to hitting controller business logic.

---

## 2. Authorization & Role-Based Access Control (RBAC)

Access control is strictly centralized in `artifacts/api-server/src/lib/authorization.ts` and `artifacts/api-server/src/lib/peopleosAccess.ts`.

### Core Enterprise Roles

| Role Key | Description | Permissions & Boundaries |
|---|---|---|
| `super_admin` | Global Platform Administrator | Organization tenant management, system diagnostics, configuration |
| `hr_admin` | Human Resource Administrator | Employee master records, onboarding, leave, performance, attendance |
| `hr_case_officer` | Confidential Case Investigator | Access to sealed HR cases, disciplinary investigations, dispute notes |
| `payroll_manager` | Payroll Preparer / Manager | Payroll calculation, benefits, deductions, statutory reports |
| `finance_director` | Payroll Checker & Financial Approver | Payroll final approval, GL journal review, disbursement authorization |
| `department_manager`| Operational Unit Supervisor | Shift scheduling, leave approvals for direct reports, asset signoff |
| `employee` | Self-Service Worker | Own profile, own leave requests, own payslips, own asset clearances |
| `auditor` | Compliance & Inspection Officer | Read-only access to audit logs, financial journals, statutory archives |

### Inviolable Separation of Duties (Maker-Checker)
1. **Payroll Approvals (`POST /api/payroll/approve`)**:
   - The user who created the payroll run (`createdByUserId`) is forbidden from approving the run (`approverUserId !== createdByUserId`).
   - In production (`NODE_ENV === "production"`), bypass flag `PEOPLEOS_ALLOW_SOLO_APPROVE` is unconditionally disabled.
2. **AI Action Proposals (`POST /api/ai/approvals/:id/decision`)**:
   - The user who requested or triggered the consequential AI action proposal cannot approve their own proposal (`deciderId !== requestedBy`).

---

## 3. Multi-Tenant Isolation & Anti-IDOR Defense

Rekker PeopleOS enforces absolute tenant isolation at every layer:

- **Database-Level Tenant Keys:** Every business table (employees, payroll runs, hr cases, workforce shifts, learning enrollments, etc.) contains an indexed `organizationId` foreign key.
- **Enforced Tenant Scoping:** Controllers do not query by bare record ID. All queries explicitly scope:
  ```typescript
  and(
    eq(table.id, recordId),
    eq(table.organizationId, user.organizationId)
  )
  ```
- **Anti-IDOR Protection:** Attempting to read or update a record from another tenant using a known UUID returns `404 Not Found` or `403 Forbidden`.
- **Negative RBAC for AI Tools:** AI agents verify caller tenant and permissions before invoking database tools. Cross-tenant tool execution is blocked with audit logging.

---

## 4. Data Protection & Kenya ODPC Compliance

In compliance with the **Kenyan Data Protection Act 2019 (ODPC)**:

### Column-Level AES-256-GCM Encryption
Sensitive PII columns in `lib/db/src/schema/peopleos.ts` are encrypted prior to database insertion:
- `nationalId`
- `kraPin`
- `passportNumber`
- `bankAccountNumber`

```typescript
// Envelope Encryption Format
"enc:v2:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
```

### Encryption Key Management & Rotation
- Encryption keys are loaded from `ENCRYPTION_KEY` (minimum 32-byte hexadecimal or base64 string).
- The system supports versioned decryption (`v1`, `v2`), allowing safe online key rotation without system downtime.

### Statutory PII Masking
API endpoints serving public or general employee directory views automatically mask sensitive fields:
- KRA PIN: `A00*****89Z`
- National ID: `1234****`
- Bank Account: `****5678`

Full plaintext is only decrypted in memory when an authorized `hr_admin` or `payroll_manager` explicitly accesses statutory tax or payroll export functions.

---

## 5. Confidential HR Relations Firewall

To protect whistleblowers, harassment claims, and disciplinary investigations:
- **Dedicated Route Protection:** `/api/hr-cases` endpoints require the specific role `hr_case_officer` or `super_admin`.
- **Submitter Redaction:** When an employee queries their own submitted case, confidential fields (`confidentialNotes`, `assignedInvestigatorUserId`, `internalRiskRating`) are set to `null`.
- **Cross-Department Block:** Department managers and peers have zero visibility into cases even if they possess the case UUID.
- **Fail-Closed Auditing:** Case creation and updates execute inside database transactions; if the audit record fails to persist, the entire case operation rolls back.

---

## 6. Audit Trail & Non-Repudiation Architecture

The system maintains an append-only audit trail in `peopleos_audit_log`:

```sql
CREATE TABLE peopleos_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128),
  action VARCHAR(32) NOT NULL,
  old_state JSONB,
  new_state JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

### Tamper-Resistance Rules
- No `UPDATE` or `DELETE` permissions granted on `peopleos_audit_log` to normal application roles.
- Critical operations (`critical: true`) require synchronous transaction commit.
- Audit records include full state diffs for financial runs and employee record modifications.

---

## 7. Incident Response & Security Triage Runbook

### Incident Severity Levels

| Severity | Definition | Response SLA | Action Required |
|---|---|---|---|
| **P1 - Critical** | Tenant data breach, unauthorized payroll approval, encryption key leak | < 15 minutes | Immediate service quarantine, session invalidation, key rotation |
| **P2 - High** | Rate limiter bypass, failure of audit persistence, unauthorized shift edit | < 1 hour | Hotfix deployment, database transaction inspection |
| **P3 - Medium** | Anomalous ML inference pattern, failed driver compliance check alert | < 4 hours | Operational triage, credential verification |
| **P4 - Low** | Minor CSP violation, static asset CORS warning | < 24 hours | Standard deployment cycle fix |

### Emergency Session Revocation
To invalidate all sessions for a compromised account:
1. Revoke the user in the Clerk Dashboard or run the token revocation command:
   ```bash
   pnpm run admin:revoke-user --userId=<compromised_user_id>
   ```
2. Inspect the audit log for recent unauthorized actions:
   ```sql
   SELECT * FROM peopleos_audit_log WHERE user_id = '<compromised_user_id>' ORDER BY created_at DESC;
   ```
