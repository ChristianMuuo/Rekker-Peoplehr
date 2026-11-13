# Rekker PeopleOS — Phase 4
## Intelligent Absence Replacement Matching & Warehouse Equipment Competencies

---

## 1. Missing Coverage Detection & Transparent Replacement Matching

When scheduled operators are on approved leave or absent, the replacement matching engine (`replacementMatcherService.ts`) calculates real-time vacancies and ranks eligible replacement candidates without opaque black-box heuristics.

### Step 1: Hard Eligibility Filters (Exclusion Gates)
Before any candidate is scored, the engine filters out ineligible personnel:
1. **Active Employment:** Must not be `former` or `suspended`.
2. **Leave Status:** Must not have an approved or pending leave request overlapping `targetDate`.
3. **Shift Conflicts:** Must not already be assigned to a scheduled shift on `targetDate`.
4. **Mandatory Safety Clearances:** Must have active, verified safety certifications for the required work domain.

Excluded personnel are returned in `excludedCandidatesSummary` with clear explanations (e.g., `"Excluded: Approved annual leave until 2026-03-13"` or `"Excluded: Counterbalance Forklift certification expired"`).

### Step 2: Multi-Factor Transparent Scoring Formula

Eligible candidates are ranked from 0 to 100 based on four transparent factors:

$$\text{Match Score} = S_{\text{competency}} + S_{\text{zone}} + S_{\text{availability}} + S_{\text{tenure}}$$

| Factor | Points | Evaluation Rule |
|---|---|---|
| **Exact Competency Match** | $+40$ pts | Holds verified, non-expired certification matching target role skill or equipment. |
| **Department / Zone Familiarity** | $+25$ pts | Primary department matches target operational unit (e.g. Formulation & Filling or Logistics). |
| **Shift Availability** | $+20$ pts | Completely unassigned on target date with no overlapping scheduled duties. |
| **Experience / Tenure Tier** | $+15$ pts | Demonstrates &ge;3 years operational service with zero disciplinary actions. |

### Step 3: Relief Deployment Action

Supervisors can immediately deploy the top candidate via `POST /api/workforce-erp/production/assign-relief`:
- Creates a dedicated `workforceShiftAssignmentsTable` record with `isRelief: true`.
- Binds `reliefForEmployeeId` and records relief dispatch audit logs.
- Instantly updates the Availability Heatmap and restores staffing integrity.

---

## 2. Warehouse & Material Handling Equipment Competency Registry

Warehouse operations require certified machinery operators to comply with the Kenya Occupational Safety and Health Act (OSHA 2007) and DOSHS standards:

### Standardized Equipment Classes

| Class Code | Equipment Classification | Standard Issuing Authorities |
|---|---|---|
| `FL-01` | Counterbalance Forklift (Class I/IV) | Toyota Forklift Academy, OSHA Kenya Directorate |
| `RT-02` | High-Bay Reach Truck (Class II) | Chartered Institute of Logistics & Transport, DOSHS |
| `VNA-03` | Very Narrow Aisle (VNA) Man-Up Turret | Certified Equipment Safety Academy |
| `PPT-04` | Powered Pallet Truck (PPT Operator) | Internal Safety & Equipment Committee |
| `OP-05` | High-Level Order Picker | Industrial Material Handling Institute |
| `CR-06` | Overhead Gantry Crane / Hoist | DOSHS Crane Inspectorate |

### Verification Lifecycle

```
[ pending_verification ]
       │
       ├──── (Supervisor Verified) ────> [ verified ] ──── (Annual/Triennial) ────> [ expired ]
       │                                     │
       │                                     └──── (Safety Violation) ────────────> [ revoked ]
       │
       └──── (Criteria Not Met) ───────> [ rejected ]
```

1. **Registration:** Supervisors or operators register new credentials with category, certificate number, issue date, and expiry date.
2. **Verification:** HR Managers or Operations Supervisors review credentials against official registries (OSHA/DOSHS/Toyota) and mark `verified`.
3. **Revocation:** In case of safety violations or required re-testing, credentials can be revoked with mandatory justification notes.
