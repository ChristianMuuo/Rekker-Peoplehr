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

describe("Rekker PeopleOS Upgrades: Bulk CSV, Org Chart, Confidential HR Cases, Maker-Checker Payroll & Workforce ERP", () => {
  test("Phase 2: CSV import preview detects valid, duplicate, and invalid rows before commit + org-chart returns hierarchy", async () => {
    await withServer(async (baseUrl) => {
      const uniqueSuffix = Date.now().toString().slice(-4);
      const empNo = `REK-CSV-${uniqueSuffix}`;
      const empEmail = `csv.worker.${uniqueSuffix}@rekker-demo.invalid`;
      const csvText = [
        "employeeNumber,firstName,lastName,workEmail,jobTitle,departmentCode,location,employmentType,startDate",
        `${empNo},Wambui,Kamau,${empEmail},Quality Lab Technician,MFG,Nairobi Production Facility,permanent,2026-04-01`,
        `${empNo},Wambui,Kamau,${empEmail},Quality Lab Technician,MFG,Nairobi Production Facility,permanent,2026-04-01`,
        `REK-BAD-${uniqueSuffix},Missing,Email,invalid-email,Packaging Operator,MFG,Nairobi Production Facility,permanent,2026-04-01`,
      ].join("\n");

      const previewRes = await fetch(`${baseUrl}/api/peopleos/employees/import-preview`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-role": "hr_admin",
        },
        body: JSON.stringify({ csvText }),
      });
      assert.strictEqual(previewRes.status, 200);
      const preview = (await previewRes.json()) as any;
      assert.strictEqual(preview.totalRows, 3);
      assert.strictEqual(preview.validCount, 1);
      assert.strictEqual(preview.duplicateCount, 1);
      assert.strictEqual(preview.errorCount, 1);

      const commitRes = await fetch(`${baseUrl}/api/peopleos/employees/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-role": "hr_admin",
        },
        body: JSON.stringify({
          batchId: preview.batchId,
          importToken: preview.importToken,
        }),
      });
      assert.strictEqual(commitRes.status, 201);
      const committed = (await commitRes.json()) as any;
      assert.strictEqual(committed.importedCount, 1);
      assert.strictEqual(committed.skippedDuplicatesCount, 1);

      const orgRes = await fetch(`${baseUrl}/api/peopleos/org-chart`, {
        headers: { "x-peopleos-role": "hr_admin" },
      });
      assert.strictEqual(orgRes.status, 200);
      const org = (await orgRes.json()) as any;
      assert.ok(org.totalNodes > 0);
      assert.ok(Array.isArray(org.nodes));
      assert.ok(org.nodes.every((n: any) => typeof n.fullName === "string" && typeof n.directReportsCount === "number"));
    });
  });

  test("Phase 3: Confidential HR cases firewall separates employees, blocks department managers, and isolates sealed notes to HR officers", async () => {
    await withServer(async (baseUrl) => {
      const empHeaders = {
        "content-type": "application/json",
        "x-peopleos-user-id": "user_emp_relations_01",
        "x-peopleos-role": "employee",
      };

      const createRes = await fetch(`${baseUrl}/api/hr-cases`, {
        method: "POST",
        headers: empHeaders,
        body: JSON.stringify({
          title: "Shift Allowance Overtime Query",
          category: "grievance",
          severity: "medium",
          description: "Requesting confidential review of weekend shift overtime calculation on Filling Line B.",
        }),
      });
      assert.strictEqual(createRes.status, 201);
      const created = (await createRes.json()) as any;
      assert.ok(created.id);

      // Employee only sees own submitted case with sealed confidentialNotes nulled out
      const empListRes = await fetch(`${baseUrl}/api/hr-cases`, {
        headers: empHeaders,
      });
      assert.strictEqual(empListRes.status, 200);
      const empList = (await empListRes.json()) as any;
      assert.strictEqual(empList.accessScope, "EMPLOYEE_SELF_REDACTED");
      const ownRow = empList.items.find((c: any) => c.id === created.id);
      assert.ok(ownRow, "Submitting employee should see their own case");
      assert.strictEqual(ownRow.confidentialNotes, null);

      // Non-HR department_manager must receive 403 Forbidden
      const mgrRes = await fetch(`${baseUrl}/api/hr-cases`, {
        headers: {
          "x-peopleos-user-id": "user_dept_mgr_99",
          "x-peopleos-role": "department_manager",
        },
      });
      assert.strictEqual(mgrRes.status, 403);

      // Non-officer cannot update or seal notes on a case
      const empPatchRes = await fetch(`${baseUrl}/api/hr-cases/${created.id}`, {
        method: "PATCH",
        headers: empHeaders,
        body: JSON.stringify({ status: "resolved", confidentialNotes: "Attempted override" }),
      });
      assert.strictEqual(empPatchRes.status, 403);

      // Authorized HR Admin can investigate, add sealed notes, and inspect full scope
      const hrHeaders = {
        "content-type": "application/json",
        "x-peopleos-user-id": "user_hr_officer_01",
        "x-peopleos-role": "hr_admin",
      };
      const patchRes = await fetch(`${baseUrl}/api/hr-cases/${created.id}`, {
        method: "PATCH",
        headers: hrHeaders,
        body: JSON.stringify({
          status: "investigating",
          confidentialNotes: "Verified biometric punch log; escalated to Payroll checker.",
        }),
      });
      assert.strictEqual(patchRes.status, 200);

      const hrListRes = await fetch(`${baseUrl}/api/hr-cases`, { headers: hrHeaders });
      assert.strictEqual(hrListRes.status, 200);
      const hrList = (await hrListRes.json()) as any;
      assert.strictEqual(hrList.accessScope, "HR_CASE_OFFICER_FULL");
      const hrRow = hrList.items.find((c: any) => c.id === created.id);
      assert.strictEqual(hrRow.status, "investigating");
      assert.strictEqual(hrRow.confidentialNotes, "Verified biometric punch log; escalated to Payroll checker.");

      // Submitting employee still receives null confidentialNotes after HR adds sealed notes
      const empRecheckRes = await fetch(`${baseUrl}/api/hr-cases`, { headers: empHeaders });
      const empRecheck = (await empRecheckRes.json()) as any;
      const ownAfter = empRecheck.items.find((c: any) => c.id === created.id);
      assert.strictEqual(ownAfter.confidentialNotes, null);
    });
  });

  test("Phase 3: Maker-Checker payroll rule blocks self-approval and GL journal balances Debits === Credits", async () => {
    await withServer(async (baseUrl) => {
      const uniquePeriod = `TestCycle-${Date.now()}`;
      const makerHeaders = {
        "content-type": "application/json",
        "x-peopleos-user-id": "user_payroll_maker_01",
        "x-peopleos-role": "payroll_officer",
      };
      const checkerHeaders = {
        "content-type": "application/json",
        "x-peopleos-user-id": "user_finance_checker_02",
        "x-peopleos-role": "finance_manager",
      };

      const createRunRes = await fetch(`${baseUrl}/api/payroll/runs`, {
        method: "POST",
        headers: makerHeaders,
        body: JSON.stringify({ period: uniquePeriod }),
      });
      assert.strictEqual(createRunRes.status, 201);
      const createdRun = (await createRunRes.json()) as any;
      const runId = createdRun.run?.id;
      assert.ok(runId);

      // Same maker cannot approve their own payroll run
      const selfApproveRes = await fetch(`${baseUrl}/api/payroll/approve`, {
        method: "POST",
        headers: makerHeaders,
        body: JSON.stringify({ period: runId }),
      });
      assert.strictEqual(selfApproveRes.status, 403);

      // Distinct checker (Finance Manager) approves successfully
      const checkerApproveRes = await fetch(`${baseUrl}/api/payroll/approve`, {
        method: "POST",
        headers: checkerHeaders,
        body: JSON.stringify({ period: runId }),
      });
      assert.strictEqual(checkerApproveRes.status, 200);

      // Double-entry cost-centre Finance GL Journal must balance exactly
      const journalRes = await fetch(`${baseUrl}/api/payroll/runs/run_2026_03/journal`, {
        headers: checkerHeaders,
      });
      assert.strictEqual(journalRes.status, 200);
      const journal = (await journalRes.json()) as any;
      assert.strictEqual(journal.balanced, true);
      assert.ok(journal.totalDebitsKes > 0);
      assert.strictEqual(journal.totalDebitsKes, journal.totalCreditsKes);
      assert.ok(Array.isArray(journal.lines) && journal.lines.length >= 6);
    });
  });

  test("Phase 4: Workforce ERP operations, driver expiry monitoring, workflow rules & honest integration readiness", async () => {
    await withServer(async (baseUrl) => {
      // Standard employee should not browse cross-unit ERP supervisor dashboard
      const deniedRes = await fetch(`${baseUrl}/api/workforce-erp/overview`, {
        headers: { "x-peopleos-role": "employee" },
      });
      assert.strictEqual(deniedRes.status, 403);

      const supHeaders = { "x-peopleos-role": "production_supervisor" };
      const overviewRes = await fetch(`${baseUrl}/api/workforce-erp/overview`, { headers: supHeaders });
      assert.strictEqual(overviewRes.status, 200);
      const overview = (await overviewRes.json()) as any;
      assert.ok(overview.heatmap.length > 0);
      assert.ok(overview.roster.length > 0);

      const replRes = await fetch(`${baseUrl}/api/workforce-erp/production/replacements`, { headers: supHeaders });
      assert.strictEqual(replRes.status, 200);
      const repl = (await replRes.json()) as any;
      assert.ok(Array.isArray(repl.qualifiedReplacements));

      const driversRes = await fetch(`${baseUrl}/api/workforce-erp/drivers`, {
        headers: { "x-peopleos-role": "warehouse_supervisor" },
      });
      assert.strictEqual(driversRes.status, 200);
      const drivers = (await driversRes.json()) as any;
      assert.ok(drivers.items.length > 0);
      assert.ok(drivers.items.some((d: any) => d.alertLevel === "expiring_soon" || d.alertLevel === "valid"));

      const salesRes = await fetch(`${baseUrl}/api/workforce-erp/sales-force`, {
        headers: { "x-peopleos-role": "sales_manager" },
      });
      assert.strictEqual(salesRes.status, 200);
      const sales = (await salesRes.json()) as any;
      assert.ok(sales.items.length > 0 && sales.totalAttributedKes > 0);

      const createWfRes = await fetch(`${baseUrl}/api/workflow-rules`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-role": "hr_director",
        },
        body: JSON.stringify({
          domain: "expense",
          name: "Dual Logistics Fuel Signoff",
          approvalLevels: 2,
          slaHours: 12,
        }),
      });
      assert.strictEqual(createWfRes.status, 201);

      const shiftRes = await fetch(`${baseUrl}/api/workforce-erp/shifts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...supHeaders,
        },
        body: JSON.stringify({
          employeeId: "10000000-0000-4000-8000-000000000010",
          unitType: "production",
          workZone: "Automated Filling Line B",
          shiftName: "Afternoon (14:00-22:00)",
          roleSkill: "Quality Batch Inspector",
          costCentreCode: "CC-MFG-01",
        }),
      });
      assert.strictEqual(shiftRes.status, 201);

      const reliefRes = await fetch(`${baseUrl}/api/workforce-erp/production/assign-relief`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...supHeaders,
        },
        body: JSON.stringify({
          replacementEmployeeId: "10000000-0000-4000-8000-000000000002",
          targetUnitType: "warehouse",
          targetZone: "Nairobi Dispatch Warehouse",
          shiftName: "Day (08:00-17:00)",
        }),
      });
      assert.strictEqual(reliefRes.status, 201);
      const reliefJson = (await reliefRes.json()) as any;
      assert.strictEqual(reliefJson.assigned, true);

      const statusRes = await fetch(`${baseUrl}/api/integrations/status`, {
        headers: { "x-peopleos-role": "hr_admin" },
      });
      assert.strictEqual(statusRes.status, 200);
      const status = (await statusRes.json()) as any;
      assert.ok(Array.isArray(status.adapters));
      const extSites = status.adapters.find((a: any) => a.key === "rekker_external_sites");
      assert.strictEqual(extSites?.status, "EXTERNAL_SYSTEMS_LINKED");
    });
  });
});

