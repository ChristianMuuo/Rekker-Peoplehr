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
