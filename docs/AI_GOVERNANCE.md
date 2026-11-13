# Rekker PeopleOS — AI & Machine Learning Governance Framework

**Scope:** Multi-Agent Architecture, Human Oversight, Model Registry, Responsible AI & Threat Mitigation  
**Version:** 1.0.0 (Phase 6 Production Release)  
**Classification:** Enterprise AI Governance Standard  

---

## 1. Multi-Agent Architecture Overview

Rekker PeopleOS integrates a domain-driven multi-agent intelligence layer coordinated by a central Supervisor Agent and ten specialized domain agents.

```
                         +-----------------------+
                         |    Supervisor Agent   |
                         | - Dynamic Intent Route|
                         | - Plan & Synthesize   |
                         +-----------+-----------+
                                     |
    +-----------------+--------------+---------------+-----------------+
    |                 |                              |                 |
+---v-----------+ +---v-----------+            +-----v---------+ +-----v---------+
|  Recruitment  | |  Payroll &    |   ......   | Confidential  | | Workforce ERP |
|   Specialist  | |  Statutory    |            | HR Relations  | |  Operations   |
+---------------+ +---------------+            +---------------+ +---------------+
```

### The 10 Specialized Domain Agents
1. **Recruitment Specialist:** Candidate matching, interview scheduling, ATS screening.
2. **Onboarding & Offboarding:** Task tracking, IT asset clearance coordination.
3. **Attendance & Absence:** Clock-in tracking, leave balance analysis, shift relief matching.
4. **Kenyan Payroll & Tax:** Statutory deductions (PAYE, NSSF, SHIF, AHL), net pay forecasting.
5. **Performance & OKRs:** Goal tracking, review sentiment, competency gaps.
6. **Learning & Development:** Course recommendations, mandatory training compliance.
7. **Expense & Compensation:** Claims audit, per-diem policy compliance.
8. **Asset & Fleet:** Hardware tracking, vehicle allocation, maintenance scheduling.
9. **Confidential HR Relations:** Disciplinary timeline reconstruction, policy lookups (investigator-only).
10. **Workforce ERP:** Production line coverage, warehouse machinery qualifications, driver PSV licensing.

---

## 2. Tool Permission Matrix & Negative RBAC Enforcement

AI agents execute with **delegated user authority**. An agent can never perform an action or view data that the invoking human user is not authorized to see.

| Agent Domain | Permitted Tools | Minimum Required Role | Prohibited Operations (Negative RBAC) |
|---|---|---|---|
| **Recruitment** | `searchCandidates`, `scoreResumes` | `hr_admin`, `recruiter` | Cannot view payroll data, compensation bands, or disciplinary records |
| **Payroll** | `calcNetPay`, `detectPayrollAnomalies` | `payroll_manager`, `finance_director` | Cannot execute payouts without Human Approval Gate |
| **HR Relations** | `inspectDisputeCase`, `summarizePolicy`| `hr_case_officer` | Submitting employees cannot see investigator notes |
| **Workforce ERP** | `matchShiftReplacements`, `verifyDriver`| `department_manager` | Cannot assign unlicensed or expired PSV drivers |
| **Executive** | `queryPeopleAnalytics`, `viewHeatmap` | `super_admin`, `hr_admin` | Unaggregated PII is strictly stripped |

---

## 3. Human-in-the-Loop Approval Gate & Reviewer Separation

Any consequential action affecting an employee's employment status, financial payout, disciplinary action, or contract requires explicit human approval.

```
[ AI Agent Proposes Consequential Action ]
                    |
                    v
[ Risk Tier Assessment (Low / Medium / High / Critical) ]
                    |
        +-----------+-----------+
        |                       |
   [ Low Risk ]         [ High / Critical ]
        |                       |
  (Auto-execute)        (Created in Approval Queue)
                                |
                                v
                   [ Human Decision Interface ]
                   - Proposal Details & Impact
                   - 72-Hour Expiration Window
                   - Enforce Reviewer Separation:
                     Decider ID != Requester ID
```

### Inviolable Reviewer Separation Rule
- Under `POST /api/ai/approvals/:id/decision`:
  - If `proposal.requestedBy === decider.id`, the decision is rejected with `403 REVIEWER_SEPARATION_VIOLATION`.
  - A manager or HR administrator cannot approve an AI proposal that they initiated.

---

## 4. Synthetic Data Isolation & Real-Data Lineage

To prevent hallucinations and false operational confidence in enterprise environments:

1. **Zero Synthetic Fallbacks in Production:**
   - In production (`NODE_ENV === "production"`), endpoints never generate mock employees, synthetic shifts, or dummy payroll calculations.
2. **`INSUFFICIENT_DATA` Threshold Protocol:**
   - If an organization has fewer than the required minimum historical samples (e.g., minimum 3 consecutive payroll runs or 30 days of attendance), predictive models report `status: "INSUFFICIENT_DATA"` with actionable onboarding guidance.
3. **Feature Lineage & Traceability:**
   - Server-side feature assembly (`artifacts/api-server/src/services/mlFeatureAssembly.ts`) extracts features directly from persisted database records and logs feature timestamps for deterministic model reproducibility.

---

## 5. Machine Learning Model Registry

Managed in database tables `peopleos_ml_model_registry`, `peopleos_ml_model_versions`, and `peopleos_ml_evaluation_results`:

| Model Identifier | Algorithm | Objective | Key Evaluation Metric |
|---|---|---|---|
| `flight_risk_v1` | Gradient Boosting (XGBoost) | Predict 90-day voluntary turnover risk | ROC-AUC >= 0.82 |
| `absenteeism_v1` | Random Forest Classifier | Unplanned absence frequency forecasting | F1-Score >= 0.78 |
| `comp_benchmark_v1` | Ridge Regression | Kenya market salary range positioning | RMSE <= 8,500 KES |
| `shift_demand_v1` | Poisson Regressor | Factory production floor staffing requirements | MAPE <= 7.5% |

### Uncertainty Estimation
Every prediction returned to end users includes explicit confidence intervals (e.g., `prediction: 0.14, confidenceInterval: [0.09, 0.19]`). High uncertainty triggers an alert encouraging human managerial discretion.

---

## 6. Prompt-Injection & Jailbreak Defenses

All text supplied to the RAG policy retrieval engine and LLM prompts passes through `sanitizeRagText`:

- **System Override Redaction:** Matches and strips attempts such as `IGNORE ALL PREVIOUS INSTRUCTIONS`, `SYSTEM PROMPT REVEAL`, or `YOU ARE NOW A DAN`.
- **SQL Injection Defense:** Strips `DROP TABLE`, `DELETE FROM`, `UPDATE ... SET`, `SELECT * FROM`.
- **Script & XML Neutralization:** Strips `<script>`, `<iframe>`, and malicious prompt boundary delimiters (`"""`, `###`).
- **Audit Logging:** Any detected adversarial payload is logged with tenant ID and user ID for security investigation.
