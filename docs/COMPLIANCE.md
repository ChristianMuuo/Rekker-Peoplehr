# Kenyan HR & Leave Statutory Compliance Notes

This document summarizes the Kenyan statutory leave parameters configured in Rekker PeopleOS and flags items that require verification by qualified Kenyan legal counsel before production rollout.

> **Disclaimer**: Statutory notes in this codebase are engineering baselines derived from Kenya Employment Act, 2007 (Cap. 226) and Data Protection Act, 2019. They do not constitute legal advice. Items marked `NEEDS_LEGAL_REVIEW` must be signed off by Rekker Limited's legal counsel.

## 1. Statutory Leave Entitlements (Kenya Employment Act, 2007)

| Code | Name | Default Entitlement | Statutory Citation | Review Status |
|------|------|---------------------|--------------------|---------------|
| `annual` | Annual Leave | 21 working days / year (monthly accrual) | Employment Act 2007, s.28(1) | Confirmed statutory floor (after 12 consecutive months of service) |
| `sick` | Sick Leave | 14 days / year (7 days full pay + 7 days half pay) | Employment Act 2007, s.30 | `NEEDS_LEGAL_REVIEW` (split full-pay/half-pay payroll calculation & 2-month qualifying service rule) |
| `maternity` | Maternity Leave | 90 calendar days (3 months) full pay | Employment Act 2007, s.29(1) | Confirmed (7 days' written notice required unless urgent; no forfeiture of annual leave) |
| `paternity` | Paternity Leave | 14 calendar days (2 weeks) full pay | Employment Act 2007, s.29(8) | `NEEDS_LEGAL_REVIEW` (Act specifies "two weeks"; set to 14 calendar days as employee-protective interpretation, replacing prior 10-day bug) |
| `compassionate` | Compassionate Leave | 3 days / year | Company policy (discretionary) | Configurable HR policy |
| `unpaid` | Unpaid Leave | 30 days / year (0% pay) | Company policy | Configurable HR policy |

## 2. Privacy & Access Control (Kenya Data Protection Act, 2019)

- **Confidential HR Cases**: Investigation notes are hidden from employees (`EMPLOYEE_SELF_REDACTED`) and accessible only to designated HR officers (`HR_CASE_OFFICER_FULL`). UI displays human-readable privacy boundary descriptions rather than raw enum codes.
- **Leave Calendar Privacy**: Colleagues see `"Away"` without medical/sick reasons (`viewMode: "peer"`); line managers see non-medical leave types for their direct team while sick/compassionate details remain redacted.
- **Public Demo Protection**: Staging/demo deployments use `@rekker-demo.invalid` synthetic employee identities only, enforce `X-Robots-Tag: noindex, nofollow, noarchive` + `robots.txt` (`Disallow: /`), and support optional `DEMO_PASSCODE` environment gating.

## 3. Kenya Payroll & Statutory Remittance Rules

| Statutory Item | Default Configuration | Primary Legal / Regulatory Basis | Review Status |
|---|---|---|---|
| **NSSF (Year 4 / Phase 4)** | 6% employee + 6% employer; Tier I up to KES 9,000, Tier II up to KES 108,000 (max KES 6,480 each) | NSSF Act, 2013 (Third Schedule phased transition effective Feb 2026) | `NEEDS_LEGAL_REVIEW` (confirm effective-date payroll cutoff against latest NSSF circular) |
| **SHIF (SHA)** | 2.75% of gross monthly salary, minimum KES 300; deductible from taxable pay | Social Health Insurance Act, 2023 & Tax Laws (Amendment) Act, 2024 | `NEEDS_LEGAL_REVIEW` (confirm pre-PAYE deductibility vs. insurance relief transition with KRA tax advisor) |
| **Affordable Housing Levy (AHL)** | 1.5% employee + 1.5% employer; deductible from taxable pay | Affordable Housing Act, 2024 & Tax Laws (Amendment) Act, 2024 | `NEEDS_LEGAL_REVIEW` |
| **PAYE Graduated Bands & Relief** | 10% (`<=24,000`), 25% (`+8,333`), 30% (`+467,667`), 32.5% (`+300,000`), 35% (`>800,000`); Personal Relief KES 2,400/mo | Income Tax Act (Cap. 470) | `NEEDS_LEGAL_REVIEW` (all schedules remain effective-dated & versioned in DB) |
| **M-Pesa B2C Disbursements** | Dual-control Maker-Checker (`reviewed` -> `approved` by non-preparer -> `disbursed`) | Internal Controls & Safaricom Daraja B2C | Runs in `SANDBOX_SIMULATION` unless live Daraja credentials are configured |
