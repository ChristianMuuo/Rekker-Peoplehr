# Rekker PeopleOS — Phase 1 Audit & Phased Workforce ERP Roadmap

**Audit Target:** `Rekker-Peoplehr` + External Reference Sites (`https://rekker.co.ke/`, `https://shop.rekker.co.ke/`)  
**Product Focus:** **REKKER PeopleOS** — Enterprise HRMS + AI-Powered Workforce ERP (without duplicating launched corporate website or ecommerce storefront capabilities).

---

## 1. Mandatory 3-Classification Feature Inventory

### Class A — Existing: Preserve & Improve
| Capability | Existing Location | Current Strength | Phased Improvement Target |
|---|---|---|---|
| Employee Directory & 360° Profile | `routes/peopleos.ts`, `App.tsx` | Search, pagination, ODPC masked statutory IDs, emergency contacts, direct reports | Add Bulk CSV Import with validation preview (`Phase 2`), Interactive Visual Org Chart (`Phase 2`) |
| Recruitment & ATS | `routes/recruitment.ts`, `RecruitmentPage.tsx` | Requisitions, candidates, interview scheduling, ML candidate matching | Link HR vacancies cleanly & maintain recruiter-assist explainability (`Phase 2`) |
| Onboarding & Offboarding | `routes/onboarding.ts`, `OnboardingPage.tsx` | Probation/exit checklists, clearance task toggles | Link asset clearance & approval signoff audit (`Phase 2`) |
| Attendance & Leave | `routes/attendance.ts`, `routes/leave.ts` | Clock-in/out, shift corrections, empty-by-default org leave policies & balances | Department × Shift Availability Heatmap & replacement planning (`Phase 2` & `Phase 4`) |
| Kenya Payroll & M-Pesa B2C | `kenyaPayrollEngine.ts`, `mpesaService.ts`, `payroll.ts` | Effective-dated PAYE/NSSF/SHIF/AHL, P9A, Daraja sandbox/live payout | Enforce **Maker-Checker** preparer ≠ approver & Finance GL Cost-Centre Journal export (`Phase 3`) |
| Performance, Learning, Expenses, Assets, Documents | `routes/performance.ts`, `learning.ts`, `expenses.ts`, `assets.ts`, `documents.ts` | OKRs, courses, expense claims, asset assignment, Employment Act §10 | Training certification expiry alerts & HR asset provisioning tie-in (`Phase 3` & `Phase 4`) |
| 10-Agent AI Hub & Python ML | `src/ai/`, `services/ml-engine/` | Supervisor + 10 specialist agents, RAG, approvals queue, 8 Sklearn/XGBoost models | Cross-ERP staffing intelligence & insufficient-data transparency (`Phase 5`) |
| RBAC, Encryption & Audit Log | `security.ts`, `auditService.ts`, `peopleosAccess.ts` | AES-256-GCM PII encryption, rate limiters, tenant isolation, audit logs | Enforce strict confidentiality firewall on HR cases & maker-checker rules (`Phase 3` & `Phase 6`) |

### Class B — Missing: Implement Inside PeopleOS
1. **Bulk Employee CSV Onboarding + Validation Preview** (`Phase 2`)
2. **Visual Interactive Organizational Chart** (`Phase 2`)
3. **Confidential Employee Relations & HR Case Management** (`Phase 3` — isolated from standard employee/manager views)
4. **Strict Maker-Checker Payroll Separation & Finance Double-Entry Cost-Centre Journals** (`Phase 3`)
5. **Internal ERP Workforce Connections Console (`WorkforceErpPage`)** (`Phase 4`):
   - Production line staffing & qualified absence-replacement matcher
   - Warehouse operator & forklift competency tracking
   - Distribution driver licence/PSV expiry monitoring
   - Sales representative territory & target/commission workforce alignment
   - Department × Shift Availability Heatmap (`ReportsPage`)
6. **Configurable Workflow Rules & Honest Integration Adapter Console** (`Phase 6`)

### Class C — Requires Integration: Connect Externally (Never Duplicate)
| External System | Hosted / Operational Owner | PeopleOS Integration Strategy | Current Credential State |
|---|---|---|---|
| Corporate Website | `https://rekker.co.ke/` (launched) | Link outbound from PeopleOS; optionally ingest career links without cloning site | Operational (external repo) |
| Consumer Storefront | `https://shop.rekker.co.ke/` (launched) | Outbound link only; do not duplicate catalogs, carts, or checkout | Operational (external repo) |
| M-Pesa Daraja B2C | Safaricom Daraja API | Live OAuth + B2C payout adapter (`mpesaService.ts`) | Implemented awaiting Daraja live credentials (`SANDBOX_SIMULATION`) |
| OpenAI LLM Reasoning | OpenAI API | `llmClient.ts` tool-grounded synthesis + retries | Implemented awaiting `OPENAI_API_KEY` |
| KRA eTIMS / Biometric Timeclock | External KRA / Factory Hardware | Integration Readiness Registry & Webhook Adapters (`/api/integrations/status`) | Adapter documented; awaiting credentials/hardware endpoint |

---

## 2. Upgraded 6-Phase PeopleOS Roadmap

- **Phase 1 — Enterprise Foundation, Security Hardening & Architecture:** Audited `Rekker-Peoplehr` & external boundaries (`rekker.co.ke`, `shop.rekker.co.ke`); hardened startup config (`env.ts`), fail-closed auth & central RBAC/IDOR (`authorization.ts`, `peopleosAccess.ts`), AES-256-GCM `enc:v2` key-ring encryption, transactional fail-closed critical audit logging, strict CORS/errors, `/readyz` & `/admin/diagnostics` UI, client fail-loud error handling, SQL migrations `0002`/`0003`, CI workflow, and comprehensive documentation (`docs/phase-1/01..15` + ADRs). *(Executed & Verified on `phase-1/enterprise-foundation`)*
- **Phase 2 — Core Enterprise HR:** Bulk Employee CSV validation/import API + UI modal, Visual Hierarchy Org Chart (`OrganizationPage`), preserved 360° Profiles, Recruitment, Onboarding, Attendance, Leave, Approvals & Employee Self-Service. *(Implementing & Verifying Now)*
- **Phase 3 — Advanced HR Governance:** Confidential HR Case Management (`/hr-cases`) with strict PII/investigation redaction, Strict Maker-Checker Payroll enforcement (`preparer !== approver`), Finance Cost-Centre Double-Entry Journal (`DR Salary/Employer Statutory = CR Net Pay/PAYE/NSSF/SHIF/AHL`). *(Implementing & Verifying Now)*
- **Phase 4 — ERP Workforce Connections:** `/workforce-erp` linking HR records directly to Production Shifts & Replacement Matching, Warehouse Equipment Certifications, Distribution Driver Licence Expiry Alerts, Sales Force Targets/Commissions, plus Department × Shift Availability Heatmap & Integration Readiness Center. *(Implementing & Verifying Now)*
- **Phase 5 — AI & Python ML Intelligence:** Preserved 10-agent orchestrator, tool authorization boundaries, human approval proposals, and 8 Python Scikit-learn/XGBoost services with strict insufficient-data transparency. *(Implemented & Tested)*
- **Phase 6 — Enterprise Hardening & Verification:** Updated unit + HTTP integration tests covering CSV import duplicates, HR Case confidentiality boundaries, Maker-Checker payroll block, balanced GL journals, full `pnpm run typecheck`, `pnpm run test`, Python tests, and production `vite`/`esbuild` verification on localhost. *(Final Verification)*

