# Rekker PeopleOS — Kenya Leave & Data Protection Compliance Notes

**Verified against primary source text:** 25 November 2026  
**Jurisdiction:** Kenya  
**Status:** Engineering reference only. All statutory policies remain flagged `NEEDS_LEGAL_REVIEW` pending written review by Kenyan employment counsel.

## Primary sources

1. **Employment Act, 2007 (Kenya), consolidated revision dated 26 April 2024:** https://new.kenyalaw.org/akn/ke/act/2007/11/eng%402024-04-26/source.pdf
2. **Employment (General) Rules, 2014 (Legal Notice 28 of 2014), rule 11:** https://new.kenyalaw.org/akn/ke/act/ln/2014/28/eng%402014-03-14/source
3. **Data Protection Act, 2019, revised 31 December 2022:** https://new.kenyalaw.org/akn/ke/act/2019/24/eng%402022-12-31/source.pdf

## Leave entitlements represented in the Kenya default policy pack

| Leave | Statutory baseline represented | Engineering handling | Review status |
|---|---|---|---|
| Annual | At least 21 working days with full pay for each 12 consecutive months. Section 28(1)(a). | Default quantity 21 days, monthly accrual of 1.75 days. | NEEDS_LEGAL_REVIEW |
| Annual on termination | Where employment terminates after at least two consecutive completed months in the leave-earning period, section 28(1)(b) gives 1.75 days for each completed month in that period. | A separate pure calculator `calculateAnnualLeaveProRataOnExit` is tested; it is not yet wired to an employee exit/payout workflow. | NEEDS_LEGAL_REVIEW |
| Sick | After two consecutive months of service: at least 7 days full pay and thereafter 7 days half pay in each 12-month service period, subject to the required certificate of incapacity. Section 30. | Eligibility rejects service under two months. Policy metadata records the 7 + 7 split. The current balance is a 14-day total and does not yet enforce the pay-tier sequencing or certificate upload workflow end to end. | NEEDS_LEGAL_REVIEW |
| Maternity | Three months on full pay. Section 29(1). Annual leave is not forfeited because maternity leave was taken, section 29(7). | Stored as 3 months. Calendar-duration calculation is based on the request start date. | NEEDS_LEGAL_REVIEW |
| Paternity | Two weeks on full pay. Employment Act section 29(8). | Stored as quantity 2 with unit `weeks`. Rule 11 permits taking leave at once or in a manner/dates convenient to employer and employee; application must be accompanied by sufficient evidence of birth; aggregate leave cannot exceed two weeks in any one year. | NEEDS_LEGAL_REVIEW |
| Pre-adoptive | One month on full pay from the date a child is placed in continuous care and control, subject to written notice and required adoption-society documents. Section 29A. | Stored as quantity 1 with unit `months`. The workflow does not yet verify placement evidence or notice documents. | NEEDS_LEGAL_REVIEW |
| Compassionate, study, unpaid and other non-statutory types | Company policy unless a contract/CBA/other applicable instrument provides more. | Must be labelled Company policy and configured per organisation. | NEEDS_LEGAL_REVIEW |

## Unit interpretation and schedule conversion

The system preserves statutory quantities in their legal unit (days, weeks or months). For working-day reporting, a two-week paternity entitlement can be converted using the employee's configured schedule, but neither the Employment Act nor rule 11 prescribes a universal numeric conversion in the provisions used here. PeopleOS therefore stores the policy as **2 weeks** and marks any working-day conversion as `NEEDS_LEGAL_REVIEW`. Do not silently replace it with 10 days.

For event-based leave, the current implementation counts calendar dates for validation and ledger deduction. This is an explicit implementation interpretation, not a final legal opinion. Confirm treatment of partial weeks, schedule conversion and cross-year requests with Kenyan counsel before production use.

## Policy governance

Each default policy stores:
- jurisdiction `KE`
- statutory quantity and unit
- effective date
- source URL and verification date
- `needsLegalReview = true`
- policy metadata with section/rule references

Organisation policy creation and updates enforce minimum floors for annual and paternity leave. Policy snapshots are written to `peopleos_leave_policy_versions`; each change is audited.

## Data protection and automated recommendations

The Data Protection Act, 2019, section 35 protects data subjects from decisions based solely on automated processing, including profiling, that produce legal effects or significantly affect them. It also provides notification and reconsideration/new non-automated decision rights in the specified circumstances.

PeopleOS's Leave Advisor is deliberately deterministic and advisory only. It returns suggestion, reasons, rules fired and inputs. A human manager records a separate recommendation and an HR approver makes the final decision. No protected-characteristic or behavioural profiling is used by this leave advisory. Sick notes and leave reasons must be treated as sensitive personal data, with role-limited access, redaction, retention controls and access logging.

## Outstanding legal/product decisions

1. Counsel to confirm the paternity working-day conversion and the event-based calendar counting rules.
2. Counsel to validate pre-adoptive evidence requirements and sick-leave certificate practice.
3. Product to implement a secure attachment/object-storage flow for sick certificates and pre-adoptive documents.
4. Product to implement the sick-leave 7 full-pay / 7 half-pay sequencing and the annual-service anniversary period.
5. Product to wire the tested termination pro-rata helper into exit workflow and final dues.
6. Confirm retention schedules, privacy notice, data-subject request process, ODPC registration status and cross-border hosting/LLM arrangements before live employee data is loaded.
