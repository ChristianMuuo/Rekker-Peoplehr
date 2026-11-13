# Rekker PeopleOS — Phase 4
## Fleet Driver Compliance, Sales Force Alignment & Integration Readiness

---

## 1. Distribution Fleet & Commercial Driver Regulatory Compliance

Operating heavy commercial freight and regional delivery vans in Kenya requires strict adherence to the National Transport and Safety Authority (NTSA) regulations:

### Driver Credential Verification

- **License Classes:** BCE Commercial Heavy Articulated, C1 Medium Commercial, C Heavy Commercial, CE Articulated Multi-Axle.
- **Dynamic Server-Date Expiry Calculations:** Calculated against `new Date()` (never hardcoded), returning exact remaining days:
  - $\text{daysRemaining} = \lceil (\text{expiryTime} - \text{asOfTime}) / 86,400,000 \rceil$
- **Alert Tiers:**
  - `valid`: $>45$ days remaining.
  - `expiring_soon`: $\le 45$ days remaining (triggers renewal notifications).
  - `critical`: $\le 14$ days remaining.
  - `expired`: $\le 0$ days remaining (triggers immediate automatic grounding).

### Vehicle Asset Linkage & Dispatch Clearance Validation

Before a heavy commercial transport or delivery van departs, fleet controllers invoke the Vehicle Dispatch Clearance check (`POST /api/workforce-erp/drivers/validate-dispatch`):
- Verifies driver profile status (`active`, `grounded`, `on_leave`).
- Verifies NTSA commercial driving license validity.
- Verifies Public Service Vehicle (PSV) / Commercial Safety certification validity.
- **Hard Dispatch Blocking:** If either the driving license or safety certification has expired, vehicle departure is blocked immediately:
  ```json
  {
    "dispatchAllowed": false,
    "driverName": "Wanjiku Kimani",
    "daysRemaining": -393,
    "alertLevel": "expired",
    "reasons": [
      "NTSA Driving license DL-KE-550192 expired on 2025-10-15. Mandatory renewal required before vehicle dispatch."
    ]
  }
  ```

---

## 2. Commercial Territories & Sales Force Performance Alignment

Binds sales personnel to official commercial territories and regional hubs:

| Territory Code | Territory Name | Regional Hub | Monthly Target (KES) | Commission Rate | Cost Centre |
|---|---|---|---|---|---|
| `TERR-NAI-01` | Nairobi Central & Modern Trade Hub | Nairobi Metro | KES 5,000,000 | 2.5% | `CC-SLS-01` |
| `TERR-RIFT-01` | Rift Valley Agrochemical & Industrial Zone | Nakuru / Eldoret | KES 3,800,000 | 3.0% | `CC-SLS-02` |
| `TERR-CST-01` | Coastal Maritime Trade Corridor | Mombasa Port | KES 3,200,000 | 3.0% | `CC-SLS-03` |
| `TERR-MTK-01` | Mt. Kenya & Upper Eastern Agricultural Belt | Nyeri / Meru | KES 2,600,000 | 3.5% | `CC-SLS-04` |

### Transparent Target Attainment & Commission Previews

- **Attainment Percentage:**
  $$\text{Attainment } \% = \left( \frac{\text{Actual Attributed KES}}{\text{Monthly Target KES}} \right) \times 100$$
- **Commission Preview:**
  $$\text{Estimated Commission KES} = \text{Actual Attributed KES} \times \left( \frac{\text{Commission Rate } \%}{100} \right)$$
- *Governance Safeguard:* All commission amounts are previews calculated transparently against accredited sales. Actual disbursements are processed through Phase 3 Maker-Checker payroll controls.

---

## 3. Honest Integration Readiness Center

To ensure enterprise transparency, PeopleOS does not fake or simulate live external connectivity:

| Adapter | Domain | Honest Status | Diagnostic Test |
|---|---|---|---|
| **Safaricom Daraja B2C** | Mobile Payroll Disbursements | `SANDBOX_SIMULATION` | Heartbeat ping validates OAuth endpoint. Real funds never move without live credentials. |
| **KRA eTIMS Middleware** | Tax Compliance Engine | `AWAITING_CREDENTIALS` | Honest disclosure: requires `KRA_ETIMS_API_KEY` and hardware VSCU device. |
| **Biometric Timeclock Feed** | Attendance & Access Control | `AWAITING_CREDENTIALS` | Listening socket ready; requires `BIOMETRIC_SYNC_SECRET` and paired static IP. |
| **Python ML Microservice** | Predictive Attrition & Scheduling | `CONNECTED` | Active and verified via `services/ml-engine/`. Round-trip latency ~16ms. |
| **NTSA TIMS Gateway** | Commercial Driver Verification | `AWAITING_CREDENTIALS` | Requires registered TIMS API access key. |
| **Industrial SCADA / Modbus** | Batch Counters & Machine Telemetry | `AWAITING_HARDWARE` | Modbus TCP gateway prepared for packaging bay PLC integration. |
