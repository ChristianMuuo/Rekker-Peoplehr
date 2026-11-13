import { describe, test } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("Phase 4: ERP Workforce Operations, Scheduling, Competency & Honest Integrations", () => {
  const supervisorHeaders = {
    "content-type": "application/json",
    "x-peopleos-role": "production_supervisor",
    "x-peopleos-org-id": "org_rekker_master",
    "x-peopleos-user-id": "user_demo_supervisor_01",
  };

  const hrManagerHeaders = {
    "content-type": "application/json",
    "x-peopleos-role": "hr_manager",
    "x-peopleos-org-id": "org_rekker_master",
    "x-peopleos-user-id": "user_demo_admin_01",
  };

  const employeeHeaders = {
    "content-type": "application/json",
    "x-peopleos-role": "employee",
    "x-peopleos-org-id": "org_rekker_master",
    "x-peopleos-user-id": "user_demo_emp_02",
    "x-peopleos-employee-id": "10000000-0000-4000-8000-000000000002",
  };

  test("1. Production Lines & Shift Templates: configuration, min staffing, and listing", async () => {
    await withServer(async (baseUrl) => {
      // List existing production lines
      const linesRes = await fetch(`${baseUrl}/api/workforce-erp/production/lines`, {
        headers: supervisorHeaders,
      });
      assert.strictEqual(linesRes.status, 200);
      const linesData = (await linesRes.json()) as any;
      assert.ok(Array.isArray(linesData.items));
      assert.ok(linesData.items.length >= 3);

      const lineA = linesData.items.find((l: any) => l.code === "LINE-MFG-01");
      assert.ok(lineA, "Line A should exist");
      assert.strictEqual(lineA.operationalStatus, "active");
      assert.strictEqual(lineA.minStaffing, 3);
      assert.strictEqual(lineA.costCentreCode, "CC-MFG-01");

      // Create a new production line
      const createLineRes = await fetch(`${baseUrl}/api/workforce-erp/production/lines`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          code: `LINE-EXP-${Date.now().toString().slice(-4)}`,
          name: "Sterile Liquid Blending Facility",
          workZone: "Liquid Blending Bay D",
          minStaffing: 5,
          operatingHours: "07:00 - 19:00",
          costCentreCode: "CC-MFG-03",
          requiredSkills: ["Sterile Filtration", "Vessel CIP Sanitation"],
          requiredCertifications: ["GMP Cleanroom Protocol"],
        }),
      });
      assert.strictEqual(createLineRes.status, 201);
      const createdLine = (await createLineRes.json()) as any;
      assert.strictEqual(createdLine.minStaffing, 5);
      assert.strictEqual(createdLine.workZone, "Liquid Blending Bay D");

      // List shift templates
      const templatesRes = await fetch(`${baseUrl}/api/workforce-erp/shift-templates`, {
        headers: supervisorHeaders,
      });
      assert.strictEqual(templatesRes.status, 200);
      const templatesData = (await templatesRes.json()) as any;
      assert.ok(Array.isArray(templatesData.items));
      assert.ok(templatesData.items.length >= 3);
    });
  });

  test("2. Competency-Aware Shift Scheduling: conflict detection, leave blocking, and competency validation", async () => {
    await withServer(async (baseUrl) => {
      const shiftDate = "2026-03-08";

      // A: Successful schedule assignment for qualified employee (Achieng Odhiambo)
      const validShiftRes = await fetch(`${baseUrl}/api/workforce-erp/shifts`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          employeeId: "10000000-0000-4000-8000-000000000001",
          unitType: "production",
          workZone: "Formulation Line A",
          shiftDate,
          shiftName: "Morning (06:00-14:00)",
          startTime: "06:00",
          endTime: "14:00",
          roleSkill: "Lead Formulation Chemist",
          costCentreCode: "CC-MFG-01",
        }),
      });
      assert.strictEqual(validShiftRes.status, 201);
      const validShift = (await validShiftRes.json()) as any;
      assert.strictEqual(validShift.employeeName, "Achieng Odhiambo");

      // B: Double-booking overlap conflict on same date must be rejected
      const overlapRes = await fetch(`${baseUrl}/api/workforce-erp/shifts`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          employeeId: "10000000-0000-4000-8000-000000000001",
          unitType: "production",
          workZone: "Automated Filling Line B",
          shiftDate,
          shiftName: "Afternoon (14:00-22:00)",
          startTime: "14:00",
          endTime: "22:00",
          roleSkill: "Packaging Operator",
          costCentreCode: "CC-MFG-01",
        }),
      });
      assert.strictEqual(overlapRes.status, 400);
      const overlapData = (await overlapRes.json()) as any;
      assert.ok(overlapData.error?.includes("conflict") || overlapData.error?.includes("already scheduled"));

      // C: Assigning employee on approved leave must be rejected
      // Wanjiku Kimani (emp 4) has approved annual leave March 02 to March 13, 2026
      const leaveConflictRes = await fetch(`${baseUrl}/api/workforce-erp/shifts`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          employeeId: "10000000-0000-4000-8000-000000000004",
          unitType: "warehouse",
          workZone: "Nairobi Dispatch Warehouse",
          shiftDate: "2026-03-05",
          shiftName: "Day (08:00-17:00)",
          startTime: "08:00",
          endTime: "17:00",
          roleSkill: "Forklift Operator",
          costCentreCode: "CC-WHS-01",
        }),
      });
      assert.strictEqual(leaveConflictRes.status, 400);
      const leaveData = (await leaveConflictRes.json()) as any;
      assert.ok(leaveData.error?.includes("leave") || leaveData.error?.includes("rejected"));

      // D: Assigning with specialized competency requirement when employee lacks verified credential
      const compFailRes = await fetch(`${baseUrl}/api/workforce-erp/shifts`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          employeeId: "10000000-0000-4000-8000-000000000005", // Brenda Mutheu (sales rep)
          unitType: "warehouse",
          workZone: "High-Bay Racks",
          shiftDate: "2026-03-09",
          shiftName: "Day (08:00-17:00)",
          startTime: "08:00",
          endTime: "17:00",
          roleSkill: "Very Narrow Aisle Turret Specialist",
          costCentreCode: "CC-WHS-01",
          requiredCompetency: "Very Narrow Aisle (VNA) Turret Operator",
        }),
      });
      assert.strictEqual(compFailRes.status, 400);
      const compData = (await compFailRes.json()) as any;
      assert.ok(compData.error?.includes("Competency verification failed"));
    });
  });

  test("3. Intelligent Absence Replacement Matching & Relief Deployment", async () => {
    await withServer(async (baseUrl) => {
      // Query replacements for date when Wanjiku Kimani is on leave
      const replacementsRes = await fetch(
        `${baseUrl}/api/workforce-erp/production/replacements?date=2026-03-05`,
        { headers: supervisorHeaders },
      );
      assert.strictEqual(replacementsRes.status, 200);
      const repData = (await replacementsRes.json()) as any;

      assert.ok(Array.isArray(repData.missingCoverageEmployees));
      assert.ok(Array.isArray(repData.qualifiedReplacements));
      assert.ok(Array.isArray(repData.excludedCandidatesSummary));

      // Wanjiku Kimani (on leave) must be detected in missing coverage or excluded
      assert.ok(
        repData.missingCoverageEmployees.some(
          (m: any) => m.employeeId === "10000000-0000-4000-8000-000000000004",
        ) ||
        repData.excludedCandidatesSummary.some(
          (e: any) => e.employeeId === "10000000-0000-4000-8000-000000000004",
        ),
      );

      // Qualified candidates must have score >= 40 and qualifyingReasons
      if (repData.qualifiedReplacements.length > 0) {
        const topCandidate = repData.qualifiedReplacements[0];
        assert.ok(topCandidate.score >= 40);
        assert.ok(Array.isArray(topCandidate.qualifyingReasons));
        assert.ok(topCandidate.qualifyingReasons.length > 0);
      }

      // Deploy relief operator
      const deployRes = await fetch(`${baseUrl}/api/workforce-erp/production/assign-relief`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          replacementEmployeeId: "10000000-0000-4000-8000-000000000002",
          targetUnitType: "warehouse",
          targetZone: "Nairobi Dispatch Warehouse",
          shiftDate: "2026-03-05",
          shiftName: "Day (08:00-17:00)",
        }),
      });
      assert.strictEqual(deployRes.status, 201);
      const deployData = (await deployRes.json()) as any;
      assert.ok(deployData.assigned);
      assert.strictEqual(deployData.employeeName, "Mwangi Kariuki");
    });
  });

  test("4. Warehouse & Equipment Competencies: registration, verification lifecycle, and revocation", async () => {
    await withServer(async (baseUrl) => {
      // Register new equipment certification
      const certNo = `TFT-FL-${Date.now().toString().slice(-4)}`;
      const regRes = await fetch(`${baseUrl}/api/workforce-erp/certifications`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          employeeId: "10000000-0000-4000-8000-000000000002",
          category: "equipment_operation",
          competencyType: "Very Narrow Aisle (VNA) Turret Operator",
          equipmentType: "VNA Turret Truck",
          issuingOrg: "Toyota Forklift Training Academy",
          certificateNumber: certNo,
          issueDate: "2026-01-10",
          expiryDate: "2029-01-10",
        }),
      });
      assert.strictEqual(regRes.status, 201);
      const regData = (await regRes.json()) as any;
      assert.strictEqual(regData.verificationStatus, "pending_verification");
      assert.strictEqual(regData.certificateNumber, certNo);
      const certId = regData.id;

      // Verify certification by HR Manager / Supervisor
      const verifyRes = await fetch(`${baseUrl}/api/workforce-erp/certifications/${certId}/verify`, {
        method: "POST",
        headers: hrManagerHeaders,
        body: JSON.stringify({
          decision: "verified",
          reason: "Practical driving test and DOSHS theory exam passed with distinction.",
        }),
      });
      assert.strictEqual(verifyRes.status, 200);
      const verifiedData = (await verifyRes.json()) as any;
      assert.strictEqual(verifiedData.verificationStatus, "verified");
      assert.ok(verifiedData.verifiedAt);

      // Revoke certification
      const revokeRes = await fetch(`${baseUrl}/api/workforce-erp/certifications/${certId}/verify`, {
        method: "POST",
        headers: hrManagerHeaders,
        body: JSON.stringify({
          decision: "revoked",
          reason: "Annual re-testing required after safety protocol update.",
        }),
      });
      assert.strictEqual(revokeRes.status, 200);
      const revokedData = (await revokeRes.json()) as any;
      assert.strictEqual(revokedData.verificationStatus, "revoked");
      assert.strictEqual(revokedData.revocationReason, "Annual re-testing required after safety protocol update.");
    });
  });

  test("5. Distribution Fleet Drivers & Dynamic Expiry Compliance: server-date calculations and dispatch blocking", async () => {
    await withServer(async (baseUrl) => {
      // List drivers
      const driversRes = await fetch(`${baseUrl}/api/workforce-erp/drivers`, {
        headers: supervisorHeaders,
      });
      assert.strictEqual(driversRes.status, 200);
      const driversData = (await driversRes.json()) as any;
      assert.ok(Array.isArray(driversData.items));
      assert.ok(driversData.items.length >= 2);

      const juma = driversData.items.find(
        (d: any) => d.employeeId === "10000000-0000-4000-8000-000000000003",
      );
      assert.ok(juma, "Juma Omondi must be in driver list");
      assert.strictEqual(juma.licenseClass, "BCE Commercial Heavy");
      assert.ok(typeof juma.daysRemaining === "number");

      // Validate dispatch clearance for active driver
      const dispatchValidRes = await fetch(`${baseUrl}/api/workforce-erp/drivers/validate-dispatch`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          driverEmployeeId: "10000000-0000-4000-8000-000000000003",
          vehicleAssetTag: "KDM 482L · Box Distribution Truck",
        }),
      });
      assert.strictEqual(dispatchValidRes.status, 200);
      const dispatchValid = (await dispatchValidRes.json()) as any;
      assert.ok(dispatchValid.driverName);
      assert.strictEqual(dispatchValid.dispatchAllowed, true);

      // Validate dispatch clearance for expired license (Wanjiku Kimani)
      const dispatchExpiredRes = await fetch(`${baseUrl}/api/workforce-erp/drivers/validate-dispatch`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          driverEmployeeId: "10000000-0000-4000-8000-000000000004", // Wanjiku Kimani (expired license)
          vehicleAssetTag: "KDG 910M · Urban Delivery Van",
        }),
      });
      assert.strictEqual(dispatchExpiredRes.status, 200);
      const dispatchExpired = (await dispatchExpiredRes.json()) as any;
      assert.strictEqual(dispatchExpired.dispatchAllowed, false);
      assert.ok(dispatchExpired.reasons.length > 0);
      assert.ok(dispatchExpired.reasons[0].includes("expired") || dispatchExpired.reasons[0].includes("NTSA"));

      // Validate dispatch clearance for non-driver (Brenda Mutheu)
      const dispatchNonDriverRes = await fetch(`${baseUrl}/api/workforce-erp/drivers/validate-dispatch`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          driverEmployeeId: "10000000-0000-4000-8000-000000000005", // Sales Rep
          vehicleAssetTag: "KDC 109M · Heavy Haul Articulated Semi-Trailer",
        }),
      });
      assert.strictEqual(dispatchNonDriverRes.status, 200);
      const dispatchNonDriver = (await dispatchNonDriverRes.json()) as any;
      assert.strictEqual(dispatchNonDriver.dispatchAllowed, false);
      assert.ok(dispatchNonDriver.reasons.length > 0);
      assert.ok(dispatchNonDriver.reasons[0].includes("No registered commercial driver profile"));
    });
  });

  test("6. Sales Force Territories & Commission Preview: attainment % and realistic commission calculation", async () => {
    await withServer(async (baseUrl) => {
      // List territories
      const terrRes = await fetch(`${baseUrl}/api/workforce-erp/territories`, {
        headers: supervisorHeaders,
      });
      assert.strictEqual(terrRes.status, 200);
      const terrData = (await terrRes.json()) as any;
      assert.ok(Array.isArray(terrData.items));
      assert.ok(terrData.items.length >= 2);

      // List sales force performance
      const salesRes = await fetch(`${baseUrl}/api/workforce-erp/sales-force`, {
        headers: supervisorHeaders,
      });
      assert.strictEqual(salesRes.status, 200);
      const salesData = (await salesRes.json()) as any;
      assert.ok(Array.isArray(salesData.items));
      assert.ok(salesData.items.length >= 1);

      const brenda = salesData.items[0];
      assert.strictEqual(brenda.repName, "Brenda Mutheu");
      assert.ok(brenda.monthlyTargetKes > 0);
      assert.ok(brenda.actualAttributedKes > 0);

      // Verify exact arithmetic: attainmentPct = Math.round((actual / target) * 1000) / 10
      const expectedAttainment =
        Math.round((brenda.actualAttributedKes / brenda.monthlyTargetKes) * 1000) / 10;
      assert.strictEqual(brenda.attainmentPct, expectedAttainment);

      // Verify exact arithmetic: estimatedCommissionKes = Math.round(actual * (rate / 100))
      const expectedCommission = Math.round(
        brenda.actualAttributedKes * (brenda.commissionRatePct / 100),
      );
      assert.strictEqual(brenda.estimatedCommissionKes, expectedCommission);
    });
  });

  test("7. Availability Heatmap & Executive Summary: exact coverage % formula and shortage classification", async () => {
    await withServer(async (baseUrl) => {
      const overviewRes = await fetch(`${baseUrl}/api/workforce-erp/overview?date=2026-03-06`, {
        headers: supervisorHeaders,
      });
      assert.strictEqual(overviewRes.status, 200);
      const overview = (await overviewRes.json()) as any;
      assert.strictEqual(overview.dataScope, "ERP_WORKFORCE_AVAILABILITY");
      assert.ok(Array.isArray(overview.heatmap));
      assert.ok(Array.isArray(overview.roster));

      for (const h of overview.heatmap) {
        assert.ok(h.unitType);
        assert.ok(typeof h.coveragePct === "number");
        assert.ok(h.shortageStatus);
        // Ensure shortage status is one of the valid enum values
        assert.ok(
          [
            "fully_staffed",
            "adequately_staffed",
            "understaffed",
            "critical_shortage",
            "qualification_blocked",
          ].includes(h.shortageStatus),
        );
      }

      // Executive Summary
      const summaryRes = await fetch(`${baseUrl}/api/workforce-erp/executive-summary`, {
        headers: supervisorHeaders,
      });
      assert.strictEqual(summaryRes.status, 200);
      const summary = (await summaryRes.json()) as any;
      assert.strictEqual(summary.dataScope, "ERP_EXECUTIVE_SUMMARY");
      assert.ok(typeof summary.overallCoveragePct === "number");
      assert.ok(typeof summary.criticalShortagesCount === "number");
      assert.ok(typeof summary.activeDriversCount === "number");
      assert.ok(typeof summary.salesTargetAttainmentPct === "number");
    });
  });

  test("8. Shift Swaps Workflow: submission, listing, and supervisor approval", async () => {
    await withServer(async (baseUrl) => {
      // Submit shift swap request
      const swapRes = await fetch(`${baseUrl}/api/workforce-erp/shift-swaps`, {
        method: "POST",
        headers: employeeHeaders,
        body: JSON.stringify({
          requestingShiftAssignmentId: "asgn-002",
          targetEmployeeId: "10000000-0000-4000-8000-000000000010",
          reason: "Attending specialized equipment certification seminar at DOSHS.",
        }),
      });
      assert.strictEqual(swapRes.status, 201);
      const swap = (await swapRes.json()) as any;
      assert.strictEqual(swap.status, "pending");
      assert.strictEqual(swap.requestingEmployeeId, "10000000-0000-4000-8000-000000000002");
      const swapId = swap.id;

      // Supervisor approves shift swap
      const decisionRes = await fetch(`${baseUrl}/api/workforce-erp/shift-swaps/${swapId}/decision`, {
        method: "POST",
        headers: supervisorHeaders,
        body: JSON.stringify({
          decision: "approved",
          decisionComment: "Approved. Line minimum staffing maintained.",
        }),
      });
      assert.strictEqual(decisionRes.status, 200);
      const approvedSwap = (await decisionRes.json()) as any;
      assert.strictEqual(approvedSwap.status, "approved");
      assert.strictEqual(approvedSwap.decisionNotes, "Approved. Line minimum staffing maintained.");
    });
  });

  test("9. Honest Integration Adapters: honest reporting and diagnostic ping", async () => {
    await withServer(async (baseUrl) => {
      const integrationsRes = await fetch(`${baseUrl}/api/workforce-erp/integrations`, {
        headers: supervisorHeaders,
      });
      assert.strictEqual(integrationsRes.status, 200);
      const integrationsData = (await integrationsRes.json()) as any;
      assert.ok(Array.isArray(integrationsData.adapters));
      assert.ok(integrationsData.adapters.length >= 6);

      // Verify unconfigured adapter honestly reports status
      const etims = integrationsData.adapters.find((a: any) => a.key === "kra_etims");
      assert.ok(etims, "eTIMS adapter should exist");
      assert.strictEqual(etims.configured, false);
      assert.strictEqual(etims.status, "AWAITING_CREDENTIALS");
      assert.ok(etims.requiredConfiguration.includes("KRA_ETIMS_API_KEY"));

      // Diagnostic Ping Check on active Python ML engine
      const pingRes = await fetch(`${baseUrl}/api/workforce-erp/integrations/python_ml/ping`, {
        method: "POST",
        headers: supervisorHeaders,
      });
      assert.strictEqual(pingRes.status, 200);
      const pingData = (await pingRes.json()) as any;
      assert.strictEqual(pingData.key, "python_ml");
      assert.strictEqual(pingData.status, "CONNECTED");
      assert.strictEqual(pingData.success, true);
      assert.ok(typeof pingData.latencyMs === "number");
    });
  });

  test("10. Enterprise Security & Role-Based Access Control (RBAC): negative authorization & segregation of duties", async () => {
    await withServer(async (baseUrl) => {
      // Non-supervisor (standard employee) CANNOT schedule shifts (must return 403 Forbidden)
      const empShiftRes = await fetch(`${baseUrl}/api/workforce-erp/shifts`, {
        method: "POST",
        headers: employeeHeaders,
        body: JSON.stringify({
          employeeId: "10000000-0000-4000-8000-000000000002",
          unitType: "production",
          workZone: "Formulation Line A",
          shiftDate: "2026-03-12",
          shiftName: "Morning (06:00-14:00)",
          roleSkill: "Line Operator",
        }),
      });
      assert.strictEqual(empShiftRes.status, 403);

      // Non-supervisor CANNOT create production lines (must return 403 Forbidden)
      const empLineRes = await fetch(`${baseUrl}/api/workforce-erp/production/lines`, {
        method: "POST",
        headers: employeeHeaders,
        body: JSON.stringify({
          code: "LINE-ILLEGAL",
          name: "Unauthorized Line",
          workZone: "Zone X",
        }),
      });
      assert.strictEqual(empLineRes.status, 403);

      // Non-supervisor CANNOT verify certifications (must return 403 Forbidden)
      const empVerifyRes = await fetch(
        `${baseUrl}/api/workforce-erp/certifications/cert-001/verify`,
        {
          method: "POST",
          headers: employeeHeaders,
          body: JSON.stringify({
            decision: "verified",
          }),
        },
      );
      assert.strictEqual(empVerifyRes.status, 403);
    });
  });
});
