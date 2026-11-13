# Rekker PeopleOS — Phase 4 Architecture & Summary
## ERP Workforce Connections, Operational Scheduling & Competency Management

**Release:** Phase 4 of 6  
**Module:** Workforce ERP & Operations Gateway (`/workforce-erp`)  
**Status:** Implemented, Fully Tested (50/50 Monorepo Unit & Integration Tests Passing), Production Build Verified  

---

## 1. Executive Summary

Phase 4 transforms Rekker PeopleOS from a standard Human Resource Information System into an interconnected, real-time operational workforce management and scheduling system. 

Rather than duplicating master employee data, equipment databases, or leave records, Phase 4 establishes an authoritative, bi-directional operational bridge between core PeopleOS HR records and real-world industrial operations:

1. **Manufacturing & Production Lines:** Real-time shift scheduling with live conflict detection, leave verification, and minimum staffing compliance across formulation, mixing, filling, and packaging bays.
2. **Absence Relief & Intelligent Replacement Matching:** Real-time detection of scheduled operator absences with transparent multi-factor scoring (+40 competency, +25 zone familiarity, +20 conflict-free, +15 tenure) and automated relief deployment.
3. **Warehouse & Material Handling Equipment Competencies:** Formal equipment operation authorization registry with full lifecycle management (`pending_verification` &rarr; `verified` / `rejected` / `revoked` / `expired`) covering Forklifts, High-Bay Reach Trucks, VNA Turrets, PPTs, and Overhead Cranes.
4. **Distribution Fleet & Driver Regulatory Compliance:** Real-time driver credential monitoring calculating exact remaining days until NTSA commercial license and PSV expiry based on dynamic server time (`new Date()`), with automated hard blocking of unauthorized vehicle dispatch.
5. **Commercial Territories & Sales Force Performance:** Territory assignment, accredited monthly target tracking, and transparent commission calculations.
6. **Department &times; Shift Availability Heatmap:** Multi-unit workforce availability tracking calculating exact coverage: `(Eligible Assigned / Required) * 100`, classifying units as `fully_staffed`, `adequately_staffed`, `understaffed`, `critical_shortage`, or `qualification_blocked`.
7. **Honest Integration Readiness Center:** Diagnostic status and live round-trip latency checks for external adapters (Safaricom Daraja B2C, NTSA TIMS, KRA eTIMS, Biometric Access, Kenya Met Weather, SCADA Modbus).

---

## 2. Architectural Principles & Data Ownership

| Operational Domain | Authoritative PeopleOS Source | Workforce ERP Role |
|---|---|---|
| Employee Identity & Status | `peopleos_employees` | Reads employee master data; verifies `status === 'active'` (blocks `former` or `suspended`). |
| Absence & Leave Management | `leave_requests` | Queries active leaves; strictly blocks scheduling or relief deployment of on-leave employees. |
| Warehouse Vehicles & Heavy Assets | `peopleos_assets` | Links commercial drivers and material handling equipment to verified asset tags. |
| Cost-Centre Accounting | `peopleos_positions`, `payroll_gl_journals` | Binds all shifts and territory activities to verified cost centres (`CC-MFG-01`, `CC-WHS-01`, `CC-LOG-01`, `CC-SLS-01`). |
| Identity & Access Control | `peopleosAccess.ts`, `authorization.ts` | Enforces enterprise RBAC with distinct privileges for `production_supervisor`, `warehouse_supervisor`, and `hr_manager`. |
| Audit Trail & Governance | `peopleos_audit_events` | Emits transactional audit events for all shift allocations, relief deployments, cert verifications, and dispatch validations. |

---

## 3. Data Model & PostgreSQL Schemas (`lib/db`)

Defined in `lib/db/src/schema/phase4WorkforceErp.ts` and migrated via `0005_phase4_erp_workforce_operations.sql`:

1. `workforce_production_lines`: Physical manufacturing and packaging zones with minimum staffing thresholds, operating hours, required skill arrays, and cost centres.
2. `workforce_shift_templates`: Operational shift windows ensuring compliance with Kenyan Employment Act §27 statutory rest periods.
3. `workforce_shift_assignments`: Concrete dated shift allocations with real-time foreign-key bindings to employee records and work zones.
4. `employee_certifications`: Official registry of machine operation and safety certifications with issuing authority tracking and verification lifecycle.
5. `workforce_driver_profiles`: Commercial driver credentials linked to employee records and transport vehicle assets, tracking NTSA license classes (BCE, C1, C, CE).
6. `workforce_territories`: Commercial sales territories with regional hubs, monthly revenue quotas, and attributed commission rates.
7. `workforce_sales_assignments`: Sales representative assignments linking employees to regional territories.
8. `workforce_shift_swaps`: Audited peer-to-peer shift swap requests with mutual employee bindings and supervisor approval signoffs.
9. `workforce_relief_requests`: Real-time relief dispatch records tracking emergency line staffing and replacement reasons.
10. `integration_health_checks`: Diagnostic telemetry and configuration status for external industrial and governmental adapters.

---

## 4. Verification & Automated Test Coverage

The Phase 4 suite (`artifacts/api-server/tests/phase4-workforce-erp.test.ts`) verifies all 10 core capability workstreams:
- **10/10 Test Suites Passing**
- **50/50 Tests Passing** across the entire monorepo with 0 regressions.
- Strict compile-time and runtime validation with TypeScript 5.9 and Node.js test runner.
