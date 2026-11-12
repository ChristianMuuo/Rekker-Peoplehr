# 13 — Automated Testing Strategy & Security Regression Coverage

## 1. Test Pyramid (Phase 1)

| Layer | Suite / File | Focus |
|---|---|---|
| Core HRMS & Kenya Payroll | `tests/payroll.test.ts` | Effective-dated NSSF Tier I/II caps, SHIF, AHL, PAYE bands & net-pay arithmetic |
| Multi-Agent Orchestrator & RAG | `tests/multi-agent.test.ts` | Supervisor intent routing + statutory/ODPC citation accuracy |
| Enterprise Controls & Workflows | `tests/enterprise-hrms.test.ts` | Empty-by-default leave policies, RBAC boundaries, human approval gating, enc:v2 round-trip, M-Pesa simulation |
| PeopleOS Upgrades | `tests/peopleos-upgrades.test.ts` | CSV import preview/commit, Org Chart hierarchy, Confidential HR Cases firewall, Maker-Checker payroll & GL balance, Workforce ERP |
| Role Constants | `tests/security-auth.test.ts` | Enterprise role constants and baseline negative assertions |
| **Phase 1 Security & Resilience (NEW)** | `tests/phase1-security.test.ts` | 11 comprehensive real-HTTP & unit security tests covering: `401` signed-out fail-closed; Employee & Manager horizontal/vertical IDOR across `/employees` & `/profile-360`; 15-role `/auth/context` + invalid role `403`; spoofed `x-peopleos-*` header `403` in `clerk` mode; production fail-closed config validation; strict CORS `403` & `X-Correlation-Id`; `enc:v2` key-ring rotation & tamper handling; document MIME/signature/size/employeeId checks; `AuditPersistenceError` `503` rollback guarantee; secret-free `/readyz` & `/admin/diagnostics`; and `customFetch` fail-loud `ApiError` guarantee |
| Python Predictive ML Engine | `services/ml-engine/tests/test_ml_engine.py` | Cohort sufficiency gating, XGBoost attrition, Ridge demand forecast, TF-IDF matching fairness, IsolationForest anomaly detection |

