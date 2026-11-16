## Description
<!-- Provide a concise description of the changes introduced in this PR -->

## Stage / Phase Reference
- [ ] Stage 0: Audit and Stabilise
- [ ] Stage 1: Authorization, Tenant Isolation & Audit Pipeline
- [ ] Stage 2: Organization, Employee Lifecycle & Self-Service
- [ ] Stage 3: Confidential HR Cases & Maker-Checker Payroll
- [ ] Stage 4: Workforce ERP, Shifts & Operational Relievers
- [ ] Stage 5: AI Orchestration & Predictive ML Lineage
- [ ] Stage 6: Security Hardening & Release Verification

## Verification Checklist
- [ ] `pnpm install --frozen-lockfile` completed cleanly
- [ ] `pnpm run typecheck` passed across all workspace packages with zero errors
- [ ] `pnpm run test` passed (all 73+ tests pass with zero failures)
- [ ] `pnpm run build` succeeded without bundle errors
- [ ] No `any` or `@ts-ignore` comments introduced
- [ ] All new/modified API routes are protected by RBAC & organization context middleware
- [ ] Sensitive actions emit an audit trail event via `auditService`
- [ ] Database schema changes accompanied by versioned migration files in `lib/db/migrations/`
- [ ] Kenya Data Protection Act 2019 compliance maintained (ODPC PII masking verified)

## Test & Build Evidence
```text
<!-- Paste terminal output from pnpm run test and pnpm run typecheck here -->
```

## Security & Operational Impact
<!-- State any changes to permissions, environment variables, or third-party integrations -->
