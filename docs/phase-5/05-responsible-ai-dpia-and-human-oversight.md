# Rekker PeopleOS — Phase 5: Responsible AI Governance & DPIA

## 1. Ethical Governance Framework

Rekker PeopleOS adopts a proactive **Data Protection Impact Assessment (DPIA)** and **Responsible AI Governance** posture aligned with Kenya's Office of the Data Protection Commissioner (ODPC) guidance and international enterprise standards (EU AI Act High-Risk Employment AI safeguards).

### Non-Negotiable Human-in-the-Loop Safeguards:
1. **No Autonomous Employment Decisions**: Models never autonomously reject job candidates, terminate employment contracts, discipline staff, alter salaries, or disburse bank/M-Pesa payroll funds.
2. **Exclusion of Protected Attributes**: Models strictly exclude age, gender, race, tribe, religious affiliation, marital status, and medical history from candidate matching and attrition scoring algorithms.
3. **Calibrated Confidence & Uncertainty Reporting**: All predictive endpoints report uncertainty metrics, including 95% confidence intervals and standard deviations, ensuring managers understand prediction limits.
4. **Immutable Audit Trails**: Every agent run and tool execution generates an immutable ledger entry recording actor user, agent role, tool name, input hash, latency, and data provenance.

---

## 2. Risk Tiering & Segregation of Duties

| Action | Risk Tier | Required Approver | Execution Guard |
| :--- | :--- | :--- | :--- |
| **Salary Adjustment** | `CRITICAL` | `hrAdmin` / `systemAdmin` | Held in Human Approval Gate (72h expiry) |
| **Contract Termination** | `CRITICAL` | `hrAdmin` / `executive` | Held in Human Approval Gate (72h expiry) |
| **Payroll Disbursement** | `CRITICAL` | `payrollOfficer` / `hrAdmin` | Requires maker-checker signoff before M-Pesa B2C call |
| **Statutory Rate Override**| `HIGH` | `hrAdmin` / `systemAdmin` | Verified against KRA / NSSF effective dates |
| **Model Version Approval** | `HIGH` | `hrAdmin` / `systemAdmin` | Evaluated metrics logged in model registry |

---

## 3. Data Protection and Right to Explanation

Under Section 35 of the Kenya Data Protection Act 2019, data subjects have the right not to be subjected to decisions based solely on automated processing. Rekker PeopleOS complies by:
1. Providing localized SHAP/Logistic regression feature attribution breakdowns for each prediction.
2. Requiring qualified human managers to evaluate explainability factors before taking any HR action.
3. Providing clear transparency badges on every screen distinguishing `Live Tenant Data`, `Synthetic Development Fixture`, or `Insufficient Data`.
