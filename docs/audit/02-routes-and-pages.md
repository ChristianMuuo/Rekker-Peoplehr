# Rekker PeopleOS — Frontend Routes & Screen Inventory

## 1. Route Map (`artifacts/peopleos/src/App.tsx`)

| Route Path | Component / Page | Access Control / Required Permission | Description & Core Purpose |
|---|---|---|---|
| `/` | `AppHomeRedirect` | Public / Authenticated | Redirects signed-in users to `/overview` and signed-out visitors to `/sign-in` or landing page. |
| `/sign-in` | `SignIn` | Public | Clerk authentication modal or sandbox role selector. |
| `/sign-up` | `SignUp` | Public | Clerk registration modal or sandbox redirection. |
| `/overview` | `OverviewPage` | All Authenticated Roles | High-level workforce operational metrics, headcount, shift coverage, and quick-action links. |
| `/self-service` | `SelfServicePage` | All Authenticated Employees | Employee profile view, payslip downloads, personal leave balance, and leave application. |
| `/people` | `PeoplePage` | All Authenticated Roles | Employee directory, search, departmental filters, and pagination. |
| `/people/:id` | `EmployeePage` | All Authenticated Roles | Employee 360 profile, statutory IDs (masked), emergency contacts, and timeline. |
| `/organization` | `OrganizationPage` | All Authenticated Roles | Interactive Organization Chart, reporting hierarchy tree, and position vacancy tracker. |
| `/leave` | `LeavePage` | All Authenticated Roles | Leave balances, upcoming leaves calendar, entitlement policies, and request history. |
| `/approvals` | `ApprovalsPage` | `canApproveLeave` or `canManagePeople` | Manager and HR approval queue for pending leave and operational requests. |
| `/recruitment` | `RecruitmentPage` | `canManagePeople` | Job requisitions, candidate pipeline, interview scheduling, and offer letters. |
| `/onboarding` | `OnboardingPage` | `canManagePeople` | New hire checklists, statutory document collection, probation review milestones. |
| `/attendance` | `AttendancePage` | All Authenticated Roles | Clock-in/clock-out logs, biometric sync status, and shift attendance reconciliation. |
| `/payroll` | `PayrollPage` | `canViewPayroll` | Kenya statutory payroll runs, tax band breakdown, Maker-Checker approvals, and M-Pesa disbursement. |
| `/expenses` | `ExpensesPage` | All Authenticated Roles | Travel & petty cash expense claims, receipt attachments, and approval tracking. |
| `/assets` | `AssetsPage` | `canManagePeople` | IT equipment, tools, and PPE asset issuance register. |
| `/performance` | `PerformancePage` | All Authenticated Roles | KPI reviews, 360 feedback cycles, and professional development plans. |
| `/learning` | `LearningPage` | All Authenticated Roles | Internal training courses, safety certifications, and compliance modules. |
| `/documents` | `DocumentsPage` | All Authenticated Roles | Company policy library, employment contracts, and statutory compliance forms. |
| `/ml` | `PredictiveMlPage` | `canManageSettings` or HR Officers | Attrition risk analysis, shift demand forecasts, and model fairness governance. |
| `/reports` | `ReportsPage` | `canManagePeople` or `canViewAudit` | Statutory reports (KRA P9, NITA, SHA, NSSF), headcount turnover, and labor costs. |
| `/workforce-erp` | `WorkforceErpPage` | `canManagePeople` | Production line shift scheduling, driver license compliance, and relief assignments. |
| `/hr-cases` | `HrCasesPage` | HR Case Officers & Affected Staff | Confidential disciplinary and grievance cases with sealed note protections. |
| `/agent-hub` | `AgentHubPage` | All Authenticated Roles | 10-Specialist autonomous AI assistant hub, policy RAG, and Human Approval Queue. |
| `/audit` | `AuditPage` | `canViewAudit` | Immutable security audit trail of sensitive employee and financial operations. |
| `/diagnostics` | `DiagnosticsPage` | `canManageSettings` or `canViewAudit` | System health probes, database connection check, and third-party integration monitors. |
| `/settings` | `SettingsPage` | `canManageSettings` | Organization parameters, leave accrual policies, statutory rates, and security options. |
